import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { RequestContext } from "../http/context/request-context";
import { db } from "../database";

declare global {
  namespace Express {
    interface Request {
      environmentId?: string;
    }
  }
}

/**
 * Middleware to resolve the active environmentId from headers, API keys, or JWT tokens.
 * Propagates the environmentId into the RequestContext (AsyncLocalStorage) and req object.
 */
export async function environmentResolverMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let environmentId: string | undefined;

  // 1. Direct environment header (primarily for tests / administrative bypass)
  const directEnvHeader = req.headers["x-environment-id"];
  if (directEnvHeader && typeof directEnvHeader === "string") {
    environmentId = directEnvHeader;
  }

  // 2. Resolve via API Key (x-api-key, x-publishable-key, x-secret-key, or Bearer auth)
  if (!environmentId) {
    const apiKeyHeader =
      req.headers["x-api-key"] ||
      req.headers["x-publishable-key"] ||
      req.headers["x-secret-key"];

    let apiKeyToken = apiKeyHeader && typeof apiKeyHeader === "string" ? apiKeyHeader : undefined;

    // Check Authorization header for Bearer prefix, which might contain an API key instead of JWT
    const authHeader = req.headers.authorization;
    if (!apiKeyToken && authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      if (token && (token.startsWith("pk_") || token.startsWith("sk_"))) {
        apiKeyToken = token;
      }
    }

    if (apiKeyToken) {
      const keyRecord = await db.client.apiKey.findFirst({
        where: { token: apiKeyToken, revokedAt: null },
        select: { environmentId: true },
      });
      if (keyRecord) {
        environmentId = keyRecord.environmentId;
      }
    }
  }

  // 3. Resolve via Access Token JWT (if present)
  if (!environmentId) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      if (token) {
        try {
          const decoded = jwt.decode(token) as any;
          if (decoded && decoded.environmentId) {
            environmentId = decoded.environmentId;
          }
        } catch {
          // Ignore parsing errors, let JWT authentication handle it later
        }
      }
    }
  }

  // If resolved, propagate to AsyncLocalStorage and req object
  if (environmentId) {
    req.environmentId = environmentId;
    const store = RequestContext.get();
    if (store) {
      store.environmentId = environmentId;
    }
  }

  next();
}

/**
 * Express guard to ensure environmentId is present on the request.
 */
export function requireEnvironment(req: Request, res: Response, next: NextFunction) {
  const envId = req.environmentId || RequestContext.environmentId;
  if (!envId) {
    res.status(400).json({
      success: false,
      error: {
        code: "ERR_VALIDATION_FAILED",
        message: "Environment context is missing. Please provide a valid API key, JWT, or x-environment-id header.",
      },
    });
    return;
  }
  next();
}
