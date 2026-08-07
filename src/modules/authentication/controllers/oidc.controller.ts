import type { Request, Response, NextFunction } from "express";
import { OidcServerService } from "../services/oidc-server.service";
import { OidcKeyService } from "../services/oidc-key.service";
import { ResponseFormatter } from "../../../core/http/response-formatter";
import { AppError } from "../../../core/errors";
import { RequestContext } from "../../../core/http/context/request-context";

export class OidcController {
  constructor(
    private readonly oidcService: OidcServerService,
    private readonly keyService: OidcKeyService
  ) {}

  /**
   * GET /api/v1/.well-known/openid-configuration
   */
  public getDiscovery = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const issuer = this.oidcService.getIssuer();
      res.json({
        issuer,
        authorization_endpoint: `${issuer}/oauth/authorize`,
        token_endpoint: `${issuer}/oauth/token`,
        userinfo_endpoint: `${issuer}/oauth/userinfo`,
        jwks_uri: `${issuer}/oauth/certs`,
        scopes_supported: ["openid", "profile", "email"],
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "client_credentials"],
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/oauth/certs
   */
  public getCerts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const environmentId = req.environmentId || RequestContext.environmentId;
      if (!environmentId) {
        throw new AppError("Environment context is missing.", "ERR_VALIDATION_FAILED", 400);
      }

      const keys = await this.keyService.getActivePublicKeys(environmentId);
      res.json({ keys });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/oauth/clients (To facilitate registering testing clients)
   */
  public registerClient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const environmentId = req.environmentId || RequestContext.environmentId;
      if (!environmentId) {
        throw new AppError("Environment context is missing.", "ERR_VALIDATION_FAILED", 400);
      }

      const { clientName, redirectUris, allowedScopes, allowedGrantTypes } = req.body;
      if (!clientName || !redirectUris || !allowedScopes || !allowedGrantTypes) {
        throw new AppError("Missing client registration parameters", "ERR_VALIDATION_FAILED", 400);
      }

      const result = await this.oidcService.registerClient(environmentId, {
        clientName,
        redirectUris,
        allowedScopes,
        allowedGrantTypes,
      });

      ResponseFormatter.success(res, {
        client: {
          clientId: result.client.clientId,
          clientName: result.client.clientName,
          redirectUris: result.client.redirectUris,
          allowedScopes: result.client.allowedScopes,
          allowedGrantTypes: result.client.allowedGrantTypes,
          status: result.client.status,
        },
        clientSecret: result.clientSecret,
      }, 201);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/oauth/authorize
   */
  public authorize = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const environmentId = req.environmentId || RequestContext.environmentId;
      if (!environmentId) {
        throw new AppError("Environment context is missing.", "ERR_VALIDATION_FAILED", 400);
      }

      const clientId = req.query.client_id as string;
      const redirectUri = req.query.redirect_uri as string;
      const responseType = req.query.response_type as string;
      const scope = (req.query.scope as string) || "openid";
      const state = req.query.state as string;
      const codeChallenge = req.query.code_challenge as string;
      const codeChallengeMethod = req.query.code_challenge_method as string;

      if (!clientId || !redirectUri || !responseType) {
        throw new AppError("Missing required authorize query parameters", "ERR_VALIDATION_FAILED", 400);
      }

      // 1. Validate incoming OAuth request parameters
      const client = await this.oidcService.validateAuthorizationRequest(environmentId, {
        clientId,
        redirectUri,
        responseType,
        scope,
        codeChallenge,
        codeChallengeMethod,
      });

      // 2. Ensure User is authenticated
      const identityId = req.auth?.identityId;
      if (!identityId) {
        throw new AppError("User authentication is required", "ERR_UNAUTHORIZED", 401);
      }

      // 3. Issue code
      const code = await this.oidcService.issueAuthorizationCode(environmentId, {
        clientId,
        redirectUri,
        scope,
        identityId,
        codeChallenge,
        codeChallengeMethod,
      });

      // Construct redirect URL
      const redirectUrl = new URL(redirectUri);
      redirectUrl.searchParams.set("code", code);
      if (state) {
        redirectUrl.searchParams.set("state", state);
      }

      // Return structured response as specified in technical spec
      ResponseFormatter.success(res, {
        redirectUri: redirectUrl.toString(),
        code,
        state,
        client: {
          clientId: client.clientId,
          clientName: client.clientName,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/oauth/token
   */
  public token = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const environmentId = req.environmentId || RequestContext.environmentId;
      if (!environmentId) {
        throw new AppError("Environment context is missing.", "ERR_VALIDATION_FAILED", 400);
      }

      const {
        grant_type,
        code,
        redirect_uri,
        code_verifier,
        client_id,
        client_secret,
      } = req.body;

      if (!grant_type) {
        throw new AppError("grant_type is required", "ERR_VALIDATION_FAILED", 400);
      }

      const result = await this.oidcService.exchangeToken(environmentId, {
        grantType: grant_type,
        code,
        redirectUri: redirect_uri,
        codeVerifier: code_verifier,
        clientId: client_id,
        clientSecret: client_secret,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/oauth/userinfo
   */
  public userInfo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const environmentId = req.environmentId || RequestContext.environmentId;
      if (!environmentId) {
        throw new AppError("Environment context is missing.", "ERR_VALIDATION_FAILED", 400);
      }

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new AppError("Missing bearer access token", "ERR_UNAUTHORIZED", 401);
      }

      const token = authHeader.split(" ")[1];
      const result = await this.oidcService.getUserInfo(environmentId, token);

      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/oauth/revoke
   */
  public revoke = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const environmentId = req.environmentId || RequestContext.environmentId;
      if (!environmentId) {
        throw new AppError("Environment context is missing.", "ERR_VALIDATION_FAILED", 400);
      }

      const { token, client_id, client_secret } = req.body;
      if (!token || !client_id) {
        throw new AppError("token and client_id are required for revocation", "ERR_VALIDATION_FAILED", 400);
      }

      await this.oidcService.revokeToken(environmentId, token, client_id, client_secret);

      ResponseFormatter.success(res, { message: "Token revoked successfully" });
    } catch (err) {
      next(err);
    }
  };
}
