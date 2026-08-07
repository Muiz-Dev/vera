import crypto from "crypto";
import { BaseService } from "../../../core/base/base.service";
import { OAuthClientRepository } from "../repositories/oauth-client.repository";
import { OAuthAuthCodeRepository } from "../repositories/oauth-auth-code.repository";
import { OAuthIssuedTokenRepository } from "../repositories/oauth-issued-token.repository";
import { OidcKeyService } from "./oidc-key.service";
import { PasswordService } from "./password.service";
import { IdentityRepository } from "../../identity/repositories/identity.repository";
import { db } from "../../../core/database";
import { AppError, NotFoundError } from "../../../core/errors";
import Logger from "../../../core/logging/logger";
import { configService } from "../../../core/config/config.service";
import { EventBus } from "../../../core/events/event.bus";
import {
  OAuthClientRegisteredEvent,
  OAuthAuthCodeIssuedEvent,
  OAuthTokenIssuedEvent,
  OAuthTokenRevokedEvent
} from "../events/oidc.events";

export class OidcServerService extends BaseService {
  constructor(
    private readonly clientRepository: OAuthClientRepository,
    private readonly authCodeRepository: OAuthAuthCodeRepository,
    private readonly tokenRepository: OAuthIssuedTokenRepository,
    private readonly keyService: OidcKeyService,
    private readonly passwordService: PasswordService,
    private readonly identityRepository: IdentityRepository
  ) {
    super();
  }

  /**
   * Retrieves the OIDC issuer URL.
   */
  public getIssuer(): string {
    return `http://localhost:${configService.app.port}/api/v1`;
  }

  /**
   * Helper to hash an access or refresh token before saving to database.
   */
  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  /**
   * Registers a new OAuth Client.
   */
  public async registerClient(
    environmentId: string,
    data: {
      clientName: string;
      redirectUris: string[];
      allowedScopes: string[];
      allowedGrantTypes: string[];
      isPublic?: boolean;
    }
  ): Promise<{ client: any; clientSecret: string }> {
    const clientId = `cli_${crypto.randomBytes(12).toString("hex")}`;

    // For public clients, secret is optional or empty, but we always generate and hash a secret
    // so they are cryptographically consistent.
    const clientSecret = `cls_${crypto.randomBytes(24).toString("hex")}`;
    const clientSecretHash = await this.passwordService.hash(clientSecret);

    const client = await this.clientRepository.create({
      environmentId,
      clientId,
      clientSecretHash,
      clientName: data.clientName,
      redirectUris: data.redirectUris,
      allowedScopes: data.allowedScopes,
      allowedGrantTypes: data.allowedGrantTypes,
    });

    await EventBus.publish(
      new OAuthClientRegisteredEvent({
        clientId,
        clientName: data.clientName,
        environmentId,
      })
    );

    return {
      client,
      clientSecret,
    };
  }

  /**
   * Validates OIDC Authorization Request parameters.
   */
  public async validateAuthorizationRequest(
    environmentId: string,
    params: {
      clientId: string;
      redirectUri: string;
      responseType: string;
      scope: string;
      codeChallenge?: string;
      codeChallengeMethod?: string;
    }
  ): Promise<any> {
    const client = await this.clientRepository.findByClientId(environmentId, params.clientId);
    if (!client) {
      throw new AppError("OAuth Client not found", "ERR_VALIDATION_FAILED", 400);
    }

    if (client.status !== "ACTIVE") {
      throw new AppError("OAuth Client is suspended", "ERR_FORBIDDEN", 403);
    }

    // Strict redirect URI matching (exact match only)
    if (!client.redirectUris.includes(params.redirectUri)) {
      throw new AppError("Redirect URI is not registered for this client", "ERR_VALIDATION_FAILED", 400);
    }

    if (params.responseType !== "code") {
      throw new AppError("Unsupported response type. Only 'code' is supported", "ERR_VALIDATION_FAILED", 400);
    }

    // Validate scopes
    const requestedScopes = params.scope ? params.scope.split(" ") : [];
    const invalidScopes = requestedScopes.filter(s => !client.allowedScopes.includes(s));
    if (invalidScopes.length > 0) {
      throw new AppError(`Requested scopes [${invalidScopes.join(", ")}] are not allowed`, "ERR_VALIDATION_FAILED", 400);
    }

    return client;
  }

  /**
   * Generates a single-use secure authorization code.
   */
  public async issueAuthorizationCode(
    environmentId: string,
    params: {
      clientId: string;
      redirectUri: string;
      scope: string;
      identityId: string;
      codeChallenge?: string;
      codeChallengeMethod?: string;
    }
  ): Promise<string> {
    // 1. MFA Enforcements: check if MFA is globally required or user has MFA setup
    const settings = await db.client.applicationSettings.findUnique({
      where: { environmentId },
    });

    const mfaMethods = await db.client.mfaMethod.findMany({
      where: { identityId: params.identityId, enabled: true },
    });

    const isMfaRequiredGlobally = settings?.mfaRequired || false;
    const isMfaSetup = mfaMethods.length > 0;

    if (isMfaRequiredGlobally || isMfaSetup) {
      // User must have an active completed MFA verification for their session
      const activeChallenges = await db.client.mfaChallenge.findFirst({
        where: {
          identityId: params.identityId,
          completedAt: { not: null },
        },
        orderBy: { completedAt: "desc" },
      });

      // Also allow if there is an active session (which is only created on login/MFA completion)
      const hasSession = await db.client.session.findFirst({
        where: { identityId: params.identityId, revokedAt: null, expiresAt: { gt: new Date() } },
      });

      if (!activeChallenges && !hasSession) {
        throw new AppError("MFA verification required to complete authorization flow", "ERR_FORBIDDEN", 403);
      }
    }

    // 2. Generate authorization code
    const code = `code_${crypto.randomBytes(24).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const scopesArray = params.scope ? params.scope.split(" ") : [];

    await this.authCodeRepository.create({
      environmentId,
      clientId: params.clientId,
      identityId: params.identityId,
      code,
      redirectUri: params.redirectUri,
      scope: scopesArray,
      codeChallenge: params.codeChallenge || null,
      codeChallengeMethod: params.codeChallengeMethod || null,
      expiresAt,
    });

    await EventBus.publish(
      new OAuthAuthCodeIssuedEvent({
        clientId: params.clientId,
        identityId: params.identityId,
        environmentId,
        code,
      })
    );

    return code;
  }

  /**
   * Validates confidential client credentials.
   */
  public async authenticateClient(environmentId: string, clientId: string, clientSecret?: string): Promise<any> {
    const client = await this.clientRepository.findByClientId(environmentId, clientId);
    if (!client) {
      throw new AppError("Invalid client credentials", "ERR_UNAUTHORIZED", 401);
    }

    if (client.status !== "ACTIVE") {
      throw new AppError("Client is suspended", "ERR_FORBIDDEN", 403);
    }

    if (clientSecret) {
      const isValid = await this.passwordService.verify(clientSecret, client.clientSecretHash);
      if (!isValid) {
        throw new AppError("Invalid client credentials", "ERR_UNAUTHORIZED", 401);
      }
    }

    return client;
  }

  /**
   * Exchanges an authorization code or client credentials for tokens.
   */
  public async exchangeToken(
    environmentId: string,
    params: {
      grantType: string;
      code?: string;
      redirectUri?: string;
      codeVerifier?: string;
      clientId?: string;
      clientSecret?: string;
    }
  ): Promise<any> {
    if (params.grantType === "client_credentials") {
      if (!params.clientId || !params.clientSecret) {
        throw new AppError("Client ID and Client Secret are required for client_credentials grant", "ERR_VALIDATION_FAILED", 400);
      }

      const client = await this.authenticateClient(environmentId, params.clientId, params.clientSecret);
      if (!client.allowedGrantTypes.includes("client_credentials")) {
        throw new AppError("Grant type client_credentials not allowed for this client", "ERR_FORBIDDEN", 403);
      }

      // Generate app-level access token
      const accessToken = await this.keyService.signJwt(environmentId, {
        iss: this.getIssuer(),
        sub: client.clientId,
        client_id: client.clientId,
        scope: client.allowedScopes.join(" "),
        environmentId,
      }, { expiresIn: "1h" });

      const accessTokenHash = this.hashToken(accessToken);

      await this.tokenRepository.create({
        environmentId,
        clientId: client.clientId,
        accessTokenHash,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });

      await EventBus.publish(
        new OAuthTokenIssuedEvent({
          clientId: client.clientId,
          identityId: null,
          environmentId,
          grantType: "client_credentials",
          accessTokenHash,
        })
      );

      return {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
      };
    }

    if (params.grantType === "authorization_code") {
      if (!params.code) {
        throw new AppError("Authorization code is required", "ERR_VALIDATION_FAILED", 400);
      }

      const codeRecord = await this.authCodeRepository.findByCode(environmentId, params.code);
      if (!codeRecord) {
        throw new AppError("Invalid or expired authorization code", "ERR_VALIDATION_FAILED", 400);
      }

      // Replay Attack Detection: If code is already used, revoke all tokens issued for this client/user
      if (codeRecord.usedAt) {
        Logger.warn(`Replay attack detected for authorization code! Revoking all previously issued tokens for client ${codeRecord.clientId}`);
        await this.tokenRepository.revokeAllForSession(environmentId, codeRecord.clientId, codeRecord.identityId);

        await EventBus.publish(
          new OAuthTokenRevokedEvent({
            clientId: codeRecord.clientId,
            environmentId,
            tokenHash: "all_tokens_revoked_on_replay",
          })
        );
        throw new AppError("Authorization code already used. All active tokens for this client/session have been revoked.", "ERR_UNAUTHORIZED", 401);
      }

      if (codeRecord.expiresAt < new Date()) {
        throw new AppError("Authorization code has expired", "ERR_VALIDATION_FAILED", 400);
      }

      if (params.redirectUri !== codeRecord.redirectUri) {
        throw new AppError("Redirect URI mismatch", "ERR_VALIDATION_FAILED", 400);
      }

      // Validate Client
      const client = codeRecord.client;
      if (client.status !== "ACTIVE") {
        throw new AppError("Client is suspended", "ERR_FORBIDDEN", 403);
      }

      // confidential client needs secret check
      const isConfidential = client.allowedGrantTypes.includes("authorization_code") && client.clientSecretHash && params.clientSecret;
      if (isConfidential) {
        await this.authenticateClient(environmentId, client.clientId, params.clientSecret);
      }

      // PKCE Validation (Required for public clients, highly recommended for all)
      if (codeRecord.codeChallenge) {
        if (!params.codeVerifier) {
          throw new AppError("code_verifier is required for PKCE validation", "ERR_VALIDATION_FAILED", 400);
        }

        let isPkceValid = false;
        if (codeRecord.codeChallengeMethod === "plain") {
          isPkceValid = params.codeVerifier === codeRecord.codeChallenge;
        } else if (codeRecord.codeChallengeMethod === "S256" || !codeRecord.codeChallengeMethod) {
          const hash = crypto.createHash("sha256").update(params.codeVerifier).digest();
          const base64url = hash.toString("base64url");
          isPkceValid = base64url === codeRecord.codeChallenge;
        }

        if (!isPkceValid) {
          throw new AppError("PKCE verification failed: Invalid code_verifier", "ERR_UNAUTHORIZED", 401);
        }
      } else {
        // Strict: PKCE (S256) is required for all public clients
        const isPublicClient = !params.clientSecret;
        if (isPublicClient) {
          throw new AppError("PKCE is mandatory for public clients", "ERR_VALIDATION_FAILED", 400);
        }
      }

      // Mark authorization code as used
      await this.authCodeRepository.markAsUsed(codeRecord.id);

      // Issue OIDC/OAuth Tokens
      const scopesString = codeRecord.scope.join(" ");

      // Create signed RS256 Access Token
      const accessToken = await this.keyService.signJwt(environmentId, {
        iss: this.getIssuer(),
        sub: codeRecord.identityId,
        client_id: client.clientId,
        scope: scopesString,
        environmentId,
      }, { expiresIn: "1h" });

      // Create rotating refresh token
      const refreshToken = `rot_${crypto.randomBytes(32).toString("hex")}`;

      const accessTokenHash = this.hashToken(accessToken);
      const refreshTokenHash = this.hashToken(refreshToken);

      await this.tokenRepository.create({
        environmentId,
        clientId: client.clientId,
        identityId: codeRecord.identityId,
        accessTokenHash,
        refreshTokenHash,
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000), // 30 days
      });

      // Issue OIDC ID Token if scope includes 'openid'
      let idToken: string | undefined;
      if (codeRecord.scope.includes("openid")) {
        idToken = await this.keyService.signJwt(environmentId, {
          iss: this.getIssuer(),
          sub: codeRecord.identityId,
          aud: client.clientId,
          email: codeRecord.identity.email,
          email_verified: codeRecord.identity.status === "ACTIVE",
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        }, { expiresIn: "1h" });
      }

      await EventBus.publish(
        new OAuthTokenIssuedEvent({
          clientId: client.clientId,
          identityId: codeRecord.identityId,
          environmentId,
          grantType: "authorization_code",
          accessTokenHash,
        })
      );

      return {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: refreshToken,
        ...(idToken ? { id_token: idToken } : {}),
      };
    }

    throw new AppError("Unsupported grant type", "ERR_VALIDATION_FAILED", 400);
  }

  /**
   * Verifies access token and returns UserInfo.
   */
  public async getUserInfo(environmentId: string, accessToken: string): Promise<any> {
    const accessTokenHash = this.hashToken(accessToken);
    const tokenRecord = await this.tokenRepository.findByAccessTokenHash(environmentId, accessTokenHash);

    if (!tokenRecord || !tokenRecord.identityId) {
      throw new AppError("Invalid or expired access token", "ERR_UNAUTHORIZED", 401);
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new AppError("Access token is expired", "ERR_UNAUTHORIZED", 401);
    }

    const identity = tokenRecord.identity;
    return {
      sub: identity.id,
      email: identity.email,
      email_verified: identity.status === "ACTIVE",
    };
  }

  /**
   * Revokes a refresh token or an access token.
   */
  public async revokeToken(environmentId: string, token: string, clientId: string, clientSecret?: string): Promise<void> {
    // 1. Authenticate client
    await this.authenticateClient(environmentId, clientId, clientSecret);

    const tokenHash = this.hashToken(token);

    // Look for refresh token first
    let tokenRecord = await this.tokenRepository.findByRefreshTokenHash(environmentId, tokenHash);
    if (!tokenRecord) {
      // Look for access token
      tokenRecord = await this.tokenRepository.findByAccessTokenHash(environmentId, tokenHash);
    }

    if (tokenRecord) {
      if (tokenRecord.clientId !== clientId) {
        throw new AppError("Token does not belong to this client", "ERR_FORBIDDEN", 403);
      }

      await this.tokenRepository.revokeToken(tokenRecord.id);

      await EventBus.publish(
        new OAuthTokenRevokedEvent({
          clientId,
          environmentId,
          tokenHash,
        })
      );
    }
  }
}
