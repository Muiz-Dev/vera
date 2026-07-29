import type { Request, Response, NextFunction } from "express";
import { AuthorizationService } from "../services/authorization.service";
import { RoleRepository } from "../repositories/role.repository";
import { PermissionRepository } from "../repositories/permission.repository";
import { ResponseFormatter } from "../../../core/http/response-formatter";
import {
  CreateRoleSchema,
  UpdateRoleSchema,
  CreatePermissionSchema,
  AssignPermissionSchema,
  AssignRoleSchema,
} from "../validators/authorization.validator";
import { AppError } from "../../../core/errors";

export class AuthorizationController {
  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly roleRepository: RoleRepository,
    private readonly permissionRepository: PermissionRepository
  ) {}

  private extractId(req: Request, paramName = "id"): string {
    const val = req.params[paramName];
    if (!val || typeof val !== "string") {
      throw new AppError(`Parameter '${paramName}' is required and must be a string`, "ERR_VALIDATION_FAILED", 400);
    }
    return val;
  }

  // --- ROLES API ---

  createRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = CreateRoleSchema.parse(req.body);
      const role = await this.authorizationService.createRole(
        {
          name: validated.name,
          slug: validated.slug,
          description: validated.description ?? null,
        },
        req.auth?.identityId,
        req.auth?.correlationId
      );
      ResponseFormatter.success(res, role, 201);
    } catch (error) {
      next(error);
    }
  };

  listRoles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const roles = await this.roleRepository.findAll();
      ResponseFormatter.success(res, roles, 200);
    } catch (error) {
      next(error);
    }
  };

  getRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = this.extractId(req);
      const role = await this.roleRepository.findById(id);
      if (!role) {
        throw new AppError("Role not found", "ERR_NOT_FOUND", 404);
      }
      ResponseFormatter.success(res, role, 200);
    } catch (error) {
      next(error);
    }
  };

  updateRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = this.extractId(req);
      const validated = UpdateRoleSchema.parse(req.body);
      const payload: any = {};
      if (validated.name !== undefined) payload.name = validated.name;
      if (validated.slug !== undefined) payload.slug = validated.slug;
      if (validated.description !== undefined) payload.description = validated.description ?? null;

      const updated = await this.authorizationService.updateRole(
        id,
        payload,
        req.auth?.identityId,
        req.auth?.correlationId
      );
      ResponseFormatter.success(res, updated, 200);
    } catch (error) {
      next(error);
    }
  };

  deleteRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = this.extractId(req);
      const deleted = await this.authorizationService.deleteRole(
        id,
        req.auth?.identityId,
        req.auth?.correlationId
      );
      ResponseFormatter.success(res, { id: deleted.id, deletedAt: deleted.deletedAt }, 200);
    } catch (error) {
      next(error);
    }
  };

  // --- PERMISSIONS API ---

  createPermission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = CreatePermissionSchema.parse(req.body);
      const permission = await this.authorizationService.createPermission(
        {
          name: validated.name,
          displayName: validated.displayName,
          description: validated.description ?? null,
        },
        req.auth?.identityId,
        req.auth?.correlationId
      );
      ResponseFormatter.success(res, permission, 201);
    } catch (error) {
      next(error);
    }
  };

  listPermissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const permissions = await this.permissionRepository.findAll();
      ResponseFormatter.success(res, permissions, 200);
    } catch (error) {
      next(error);
    }
  };

  // --- ASSIGNMENTS API ---

  assignPermission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = AssignPermissionSchema.parse(req.body);
      const roleId = this.extractId(req, "roleId");
      const assignment = await this.authorizationService.assignPermission(
        roleId,
        validated.permissionId,
        req.auth?.identityId,
        req.auth?.correlationId
      );
      ResponseFormatter.success(res, assignment, 201);
    } catch (error) {
      next(error);
    }
  };

  revokePermission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const roleId = this.extractId(req, "roleId");
      const permissionId = this.extractId(req, "permissionId");
      await this.authorizationService.revokePermission(
        roleId,
        permissionId,
        req.auth?.identityId,
        req.auth?.correlationId
      );
      ResponseFormatter.success(res, { roleId, permissionId }, 200);
    } catch (error) {
      next(error);
    }
  };

  assignRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = AssignRoleSchema.parse(req.body);
      const identityId = this.extractId(req, "identityId");
      const assignment = await this.authorizationService.assignRole(
        identityId,
        validated.roleId,
        req.auth?.identityId,
        req.auth?.correlationId
      );
      ResponseFormatter.success(res, assignment, 201);
    } catch (error) {
      next(error);
    }
  };

  removeRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const identityId = this.extractId(req, "identityId");
      const roleId = this.extractId(req, "roleId");
      await this.authorizationService.removeRole(
        identityId,
        roleId,
        req.auth?.identityId,
        req.auth?.correlationId
      );
      ResponseFormatter.success(res, { identityId, roleId }, 200);
    } catch (error) {
      next(error);
    }
  };

  getIdentityPermissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const identityId = this.extractId(req, "identityId");
      const resolved = await this.authorizationService.getEffectivePermissions(identityId);
      ResponseFormatter.success(res, resolved, 200);
    } catch (error) {
      next(error);
    }
  };
}
