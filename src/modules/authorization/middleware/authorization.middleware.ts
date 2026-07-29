import type { Request, Response, NextFunction } from "express";
import { TokenService } from "../../authentication/services/token.service";
import { AuthorizationService } from "../services/authorization.service";
import { RoleRepository } from "../repositories/role.repository";
import { PermissionRepository } from "../repositories/permission.repository";
import { RolePermissionRepository } from "../repositories/role-permission.repository";
import { IdentityRoleRepository } from "../repositories/identity-role.repository";
import { MemoryCacheService } from "../../../core/cache";
import { RequestContext } from "../../../core/http/context/request-context";
import { AppError } from "../../../core/errors";
import { db } from "../../../core";

// Instantiations for middleware layer
const tokenService = new TokenService();
const roleRepository = new RoleRepository();
const permissionRepository = new PermissionRepository();
const rolePermissionRepository = new RolePermissionRepository();
const identityRoleRepository = new IdentityRoleRepository();
const cacheService = new MemoryCacheService();

export const authorizationService = new AuthorizationService(
  roleRepository,
  permissionRepository,
  rolePermissionRepository,
  identityRoleRepository,
  cacheService
);

declare global {
  namespace Express {
    interface Request {
      auth?: {
        identityId: string;
        sessionId: string;
        email: string | null;
        roles: string[];
        permissions: string[];
        authenticatedAt: Date;
        requestId: string;
        correlationId: string;
      };
    }
  }
}

/**
 * Reusable middleware to enforce authentication and resolve authorization claims.
 */
export async function requireAuthentication(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new AppError("Authentication credentials missing or invalid", "ERR_UNAUTHORIZED", 401));
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return next(new AppError("Authentication credentials missing or invalid", "ERR_UNAUTHORIZED", 401));
  }
  try {
    const decoded = tokenService.verifyAccessToken(token);

    // Resolve latest session
    const latestSession = await db.client.session.findFirst({
      where: { identityId: decoded.sub, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    const sessionId = latestSession?.id ?? "stateless";

    // Resolve claims
    const { roles, permissions } = await authorizationService.getEffectivePermissions(decoded.sub);

    const requestId = RequestContext.requestId ?? "system";
    const correlationId = RequestContext.correlationId ?? requestId;

    // Attach to request
    req.auth = {
      identityId: decoded.sub,
      sessionId,
      email: decoded.email,
      roles,
      permissions,
      authenticatedAt: new Date(),
      requestId,
      correlationId,
    };

    // Propagate context to ALS
    const store = RequestContext.get();
    if (store) {
      store.userId = decoded.sub;
      store.environmentId = decoded.environmentId;
      if (!store.metadata) {
        store.metadata = {};
      }
      store.metadata.sessionId = sessionId;
    }

    next();
  } catch (err: any) {
    next(err);
  }
}

/**
 * Reusable middleware to require a specific role or set of roles.
 */
export function requireRole(roles: string | string[]) {
  const requiredRoles = Array.isArray(roles) ? roles.map(r => r.toLowerCase()) : [roles.toLowerCase()];

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(new AppError("Authentication required", "ERR_UNAUTHORIZED", 401));
    }

    const hasMatchingRole = req.auth.roles.some((role) =>
      requiredRoles.includes(role.toLowerCase())
    );

    if (!hasMatchingRole) {
      return next(new AppError("You do not have the required role to access this resource", "ERR_FORBIDDEN", 403));
    }

    next();
  };
}

/**
 * Reusable middleware to require a specific permission or set of permissions.
 */
export function requirePermission(permissions: string | string[]) {
  const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(new AppError("Authentication required", "ERR_UNAUTHORIZED", 401));
    }

    const hasMatchingPermission = req.auth.permissions.some((perm) =>
      requiredPermissions.includes(perm)
    );

    if (!hasMatchingPermission) {
      return next(new AppError("You do not have the required permission to perform this action", "ERR_FORBIDDEN", 403));
    }

    next();
  };
}
