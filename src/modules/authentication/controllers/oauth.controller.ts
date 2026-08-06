import type { Request, Response, NextFunction } from "express";
import { OAuthService } from "../services/oauth.service";
import { ResponseFormatter } from "../../../core/http/response-formatter";
import { AppError } from "../../../core/errors";
import { db } from "../../../core/database";

export class OAuthController {
  constructor(private readonly oauthService: OAuthService) {}

  /**
   * Helper to strictly validate redirect URIs against the registered allowed origins.
   */
  private async validateRedirectUri(environmentId: string, redirectUri: string): Promise<void> {
    if (!redirectUri) {
      throw new AppError("redirect_uri parameter is required", "ERR_VALIDATION_FAILED", 400);
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(redirectUri);
    } catch {
      throw new AppError("Invalid redirect_uri format", "ERR_VALIDATION_FAILED", 400);
    }

    const origins = await db.client.allowedOrigin.findMany({
      where: { environmentId },
    });

    // Default development bypass: allow localhost or 127.0.0.1 if no origins are registered
    if (origins.length === 0) {
      const isLocal =
        parsedUrl.hostname === "localhost" ||
        parsedUrl.hostname === "127.0.0.1";
      if (!isLocal) {
        throw new AppError(
          "redirect_uri is not allowed in this environment. Configure Allowed Origins.",
          "ERR_FORBIDDEN",
          403
        );
      }
      return;
    }

    const matched = origins.some((o) => {
      try {
        const allowedUrl = new URL(o.origin);
        return allowedUrl.origin === parsedUrl.origin;
      } catch {
        // Fallback string matching
        return parsedUrl.origin.includes(o.origin) || redirectUri.includes(o.origin);
      }
    });

    if (!matched) {
      throw new AppError(
        "The redirect_uri is not authorized for this application environment.",
        "ERR_FORBIDDEN",
        403
      );
    }
  }

  /**
   * GET /api/v1/auth/oauth/:provider
   * Initiates third-party social provider redirect flows.
   */
  public start = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { provider } = req.params;
      const redirectUri = req.query.redirect_uri as string;
      const state = req.query.state as string | undefined;

      const envId = req.environmentId;
      if (!envId) {
        throw new AppError("Environment context is missing.", "ERR_VALIDATION_FAILED", 400);
      }

      await this.validateRedirectUri(envId, redirectUri);

      const { authUrl } = await this.oauthService.startFlow(provider, redirectUri, state);
      res.redirect(authUrl);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/auth/oauth/:provider/callback
   * Processes authorization callbacks from external providers.
   */
  public callback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { provider } = req.params;
      const code = req.query.code as string;
      const state = req.query.state as string;

      if (!code || !state) {
        throw new AppError("Authorization code and state parameters are required from provider callback.", "ERR_VALIDATION_FAILED", 400);
      }

      const ipAddress = req.ip || null;
      const userAgent = req.headers["user-agent"] || null;

      const { redirectUri } = await this.oauthService.handleCallback(
        provider,
        code,
        state,
        ipAddress,
        userAgent
      );

      res.redirect(redirectUri);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/auth/oauth/token
   * Exchanges temporary authorization code for standard JWT session.
   */
  public tokenExchange = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { code, deviceFingerprint } = req.body;
      if (!code) {
        throw new AppError("Temporary authorization code is required for session exchange.", "ERR_VALIDATION_FAILED", 400);
      }

      const result = await this.oauthService.exchangeCode(code, deviceFingerprint || null);
      ResponseFormatter.success(res, result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/auth/oauth/accounts
   * Lists linked OAuth accounts for active user.
   */
  public list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const identityId = req.auth?.identityId;
      if (!identityId) {
        throw new AppError("Unauthorized context", "ERR_UNAUTHORIZED", 401);
      }

      const result = await this.oauthService.getLinkedAccounts(identityId);
      ResponseFormatter.success(res, result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/auth/oauth/link
   * Explicitly links a third-party social provider account.
   */
  public link = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const identityId = req.auth?.identityId;
      if (!identityId) {
        throw new AppError("Unauthorized context", "ERR_UNAUTHORIZED", 401);
      }

      const { provider, code, redirectUri } = req.body;
      if (!provider || !code || !redirectUri) {
        throw new AppError("provider, code, and redirectUri are required for account linking.", "ERR_VALIDATION_FAILED", 400);
      }

      const envId = req.environmentId;
      if (envId) {
        await this.validateRedirectUri(envId, redirectUri);
      }

      await this.oauthService.linkAccount(identityId, provider, code, redirectUri);
      ResponseFormatter.success(res, { message: `Social account '${provider}' successfully linked.` });
    } catch (err) {
      next(err);
    }
  };

  /**
   * DELETE /api/v1/auth/oauth/link/:provider
   * Unlinks a third-party social provider.
   */
  public unlink = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const identityId = req.auth?.identityId;
      if (!identityId) {
        throw new AppError("Unauthorized context", "ERR_UNAUTHORIZED", 401);
      }

      const { provider } = req.params;
      await this.oauthService.unlinkAccount(identityId, provider);
      ResponseFormatter.success(res, { message: `Social account '${provider}' successfully unlinked.` });
    } catch (err) {
      next(err);
    }
  };
}
