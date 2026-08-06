import crypto from "crypto";
import { BaseService } from "../../../core/base/base.service";
import { RequestContext } from "../../../core/http/context/request-context";
import { EventBus } from "../../../core/events/event.bus";
import { AppError } from "../../../core/errors";
import { IdentityStatus } from "../../../generated/prisma/client";

// Import types & adapters
import type { ICacheService } from "../../../core/cache/cache.service";
import type { OAuthProvider, OAuthProfile } from "../types/oauth.types";
import { GoogleProvider } from "./providers/google.provider";
import { GitHubProvider } from "./providers/github.provider";
import { encryptionService } from "../../../core/security/encryption.service";

// Import repositories & services
import { OAuthRepository } from "../repositories/oauth.repository";
import { IdentityRepository } from "../../identity/repositories/identity.repository";
import { IdentityService } from "../../identity/services/identity.service";
import { SessionRepository } from "../repositories/session.repository";
import { CredentialRepository } from "../repositories/credential.repository";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";

// Import events
import {
  OAuthAccountLinkedEvent,
  OAuthAccountUnlinkedEvent,
  OAuthLoginSucceededEvent,
  OAuthLoginFailedEvent,
} from "../events/oauth.events";
import { AuthenticationLoggedInEvent } from "../events/authentication.events";
import type { LoginResponseData } from "../types/authentication.types";

export class OAuthService extends BaseService {
  private readonly providers: Map<string, OAuthProvider> = new Map();

  constructor(
    private readonly oauthRepository: OAuthRepository,
    private readonly identityRepository: IdentityRepository,
    private readonly identityService: IdentityService,
    private readonly sessionRepository: SessionRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly cacheService: ICacheService
  ) {
    super();
    // Register standard providers
    this.providers.set("google", new GoogleProvider());
    this.providers.set("github", new GitHubProvider());
  }

  /**
   * Helper to resolve the correct provider adapter.
   */
  private getProvider(providerName: string): OAuthProvider {
    const provider = this.providers.get(providerName.toLowerCase());
    if (!provider) {
      throw new AppError(`OAuth provider '${providerName}' is not supported`, "ERR_VALIDATION_FAILED", 400);
    }
    return provider;
  }

  /**
   * Computes a standard PKCE code challenge (S256).
   */
  private generatePkcePair(): { verifier: string; challenge: string } {
    const base64Url = (buf: Buffer): string =>
      buf
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");

    const verifier = base64Url(crypto.randomBytes(32));
    const challenge = base64Url(
      crypto.createHash("sha256").update(verifier).digest()
    );

    return { verifier, challenge };
  }

  /**
   * Starts the OAuth flow by caching state transaction metadata and returning authorization URL.
   */
  public async startFlow(
    providerName: string,
    redirectUri: string,
    clientState?: string
  ): Promise<{ authUrl: string }> {
    const provider = this.getProvider(providerName);
    const state = crypto.randomBytes(16).toString("hex");
    const { verifier, challenge } = this.generatePkcePair();

    const envId = RequestContext.environmentId;
    if (!envId) {
      throw new AppError("Environment context is missing", "ERR_VALIDATION_FAILED", 400);
    }

    // Cache the OAuth transaction context with a short 10-minute TTL
    await this.cacheService.set(
      `oauth:state:${state}`,
      {
        state,
        code_verifier: verifier,
        provider: provider.name,
        environmentId: envId,
        redirectUri,
        clientState,
        correlationId: RequestContext.get()?.correlationId || "",
        createdAt: Date.now(),
      },
      600 // 10 minutes
    );

    const authUrl = provider.getAuthorizationUrl(state, redirectUri, challenge);
    return { authUrl };
  }

  /**
   * Handles Callback redirection from OAuth providers.
   * Exchanges code for provider tokens, retrieves user profile, creates/verifies identities,
   * and returns an app-level redirect URI with a short-lived authorization code.
   */
  public async handleCallback(
    providerName: string,
    code: string,
    state: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<{ redirectUri: string }> {
    const stateKey = `oauth:state:${state}`;
    const cached = await this.cacheService.get<any>(stateKey);

    if (!cached || cached.provider !== providerName.toLowerCase()) {
      await EventBus.publish(
        new OAuthLoginFailedEvent({
          provider: providerName,
          error: "Invalid or expired state verification token",
        })
      );
      throw new AppError("Invalid or expired state verification token", "ERR_VALIDATION_FAILED", 400);
    }

    // Immediately delete the cached state to protect against replay attacks
    await this.cacheService.delete(stateKey);

    // Propagate the correct environmentId back into RequestContext store
    const store = RequestContext.get();
    if (store) {
      store.environmentId = cached.environmentId;
    }

    const provider = this.getProvider(providerName);

    let tokens: any;
    let profile: OAuthProfile;

    try {
      // Exchange provider code for tokens
      tokens = await provider.exchangeCode(code, cached.redirectUri, cached.code_verifier);
      // Fetch provider profile
      profile = await provider.getUserProfile(tokens.accessToken);
    } catch (err: any) {
      await EventBus.publish(
        new OAuthLoginFailedEvent({
          provider: provider.name,
          error: err.message || "Failed to exchange provider tokens",
        })
      );
      throw new AppError(err.message || "Failed to exchange provider tokens", "ERR_VALIDATION_FAILED", 400);
    }

    // Find if an OAuthAccount already exists for this provider and providerUserId in this environment
    let oauthAccount = await this.oauthRepository.findByProviderId(provider.name, profile.providerUserId);
    let identityId: string;

    if (oauthAccount) {
      identityId = oauthAccount.identityId;

      // Update provider credentials (optionally encrypt before persistence)
      const encryptedAccess = tokens.accessToken ? encryptionService.encrypt(tokens.accessToken) : null;
      const encryptedRefresh = tokens.refreshToken ? encryptionService.encrypt(tokens.refreshToken) : null;

      await this.oauthRepository.update(oauthAccount.id, {
        email: profile.email || oauthAccount.email || undefined,
        displayName: profile.displayName || oauthAccount.displayName || undefined,
        avatarUrl: profile.avatarUrl || oauthAccount.avatarUrl || undefined,
        accessToken: encryptedAccess || undefined,
        refreshToken: encryptedRefresh || undefined,
        expiresAt: tokens.expiresAt || null,
      });

      // Fetch Identity to verify status
      const identity = await this.identityRepository.findById(identityId);
      if (!identity || identity.status === IdentityStatus.DEACTIVATED) {
        throw new AppError("Associated identity is inactive or deactivated", "ERR_FORBIDDEN", 403);
      }
      if (identity.status === IdentityStatus.SUSPENDED) {
        throw new AppError("Associated identity is suspended", "ERR_FORBIDDEN", 403);
      }

      await EventBus.publish(
        new OAuthLoginSucceededEvent({
          identityId,
          provider: provider.name,
          providerUserId: profile.providerUserId,
        })
      );
    } else {
      // No OAuthAccount exists. Check if email matches an existing Identity in this environment.
      if (profile.email) {
        const existingIdentity = await this.identityRepository.findByEmail(profile.email);
        if (existingIdentity) {
          // Rule B: Match found but no link exists. Deny login. User must manually link.
          await EventBus.publish(
            new OAuthLoginFailedEvent({
              provider: provider.name,
              providerUserId: profile.providerUserId,
              error: "An account with this email already exists. Please log in first to link your account.",
            })
          );
          throw new AppError(
            "An account with this email already exists. Please log in first to link this social account.",
            "ERR_VALIDATION_FAILED",
            400
          );
        }
      }

      // No matching email either. Register new Identity & Profile.
      const createPayload: any = {
        email: profile.email || null,
        // Mark ACTIVE instantly for verified/trusted providers
        status: profile.emailVerified ? IdentityStatus.ACTIVE : IdentityStatus.PENDING,
        profile: {
          firstName: profile.displayName ? profile.displayName.split(" ")[0] || null : null,
          lastName: profile.displayName ? profile.displayName.split(" ").slice(1).join(" ") || null : null,
          avatar: profile.avatarUrl || null,
          displayName: profile.displayName || null,
        },
      };

      const newIdentity = await this.identityService.createIdentity(createPayload);
      identityId = newIdentity.id;

      // Encrypt provider credentials before storage
      const encryptedAccess = tokens.accessToken ? encryptionService.encrypt(tokens.accessToken) : null;
      const encryptedRefresh = tokens.refreshToken ? encryptionService.encrypt(tokens.refreshToken) : null;

      // Save OAuthAccount linkage
      await this.oauthRepository.create({
        identityId,
        provider: provider.name,
        providerUserId: profile.providerUserId,
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        accessToken: encryptedAccess || undefined,
        refreshToken: encryptedRefresh || undefined,
        expiresAt: tokens.expiresAt,
      });

      await EventBus.publish(
        new OAuthAccountLinkedEvent({
          identityId,
          provider: provider.name,
          providerUserId: profile.providerUserId,
        })
      );

      await EventBus.publish(
        new OAuthLoginSucceededEvent({
          identityId,
          provider: provider.name,
          providerUserId: profile.providerUserId,
        })
      );
    }

    // Check if MFA is enabled for this identity
    const activeMfa = await this.db.mfaMethod.findFirst({
      where: {
        identityId,
        enabled: true,
      },
    });

    const mfaRequired = !!activeMfa;

    // Generate short-lived (5 min) authorization code representing the successful login session
    const oauthCode = crypto.randomBytes(24).toString("hex");
    await this.cacheService.set(
      `oauth:code:${oauthCode}`,
      {
        identityId,
        environmentId: cached.environmentId,
        ipAddress,
        userAgent,
        mfaRequired,
        createdAt: Date.now(),
      },
      300 // 5 minutes
    );

    // Build redirect back to client redirectUri
    const redirectParams = new URLSearchParams();
    redirectParams.append("code", oauthCode);
    if (cached.clientState) {
      redirectParams.append("state", cached.clientState);
    }

    const separator = cached.redirectUri.includes("?") ? "&" : "?";
    const finalRedirectUri = `${cached.redirectUri}${separator}${redirectParams.toString()}`;

    return { redirectUri: finalRedirectUri };
  }

  /**
   * Exchanges short-lived authorization code for active Vera Session tokens.
   * If MFA is enabled and the device is not trusted, generates a secure challenge and returns mfaRequired.
   */
  public async exchangeCode(
    oauthCode: string,
    deviceFingerprint?: string | null
  ): Promise<LoginResponseData | { mfaRequired: boolean; challengeId: string }> {
    const codeKey = `oauth:code:${oauthCode}`;
    const cached = await this.cacheService.get<any>(codeKey);

    if (!cached) {
      throw new AppError("Invalid or expired session authorization code", "ERR_UNAUTHORIZED", 401);
    }

    // Immediately invalidate the authorization code (single-use replay protection!)
    await this.cacheService.delete(codeKey);

    // Ensure environment is set in request context store
    const store = RequestContext.get();
    if (store) {
      store.environmentId = cached.environmentId;
    }

    const identity = await this.identityRepository.findById(cached.identityId);
    if (!identity || identity.status === IdentityStatus.DEACTIVATED) {
      throw new AppError("Associated user does not exist or has been deactivated", "ERR_UNAUTHORIZED", 401);
    }
    if (identity.status === IdentityStatus.SUSPENDED) {
      throw new AppError("Associated user is suspended", "ERR_FORBIDDEN", 403);
    }

    // If MFA is required, check if device fingerprint is trusted
    if (cached.mfaRequired) {
      let isTrusted = false;
      if (deviceFingerprint) {
        const hashedFingerprint = crypto.createHash("sha256").update(deviceFingerprint).digest("hex");
        const trusted = await this.db.trustedDevice.findFirst({
          where: {
            identityId: identity.id,
            deviceFingerprint: hashedFingerprint,
            expiresAt: { gt: new Date() },
            revokedAt: null,
          },
        });
        if (trusted) {
          isTrusted = true;
          await this.db.trustedDevice.update({
            where: { id: trusted.id },
            data: { lastUsedAt: new Date() },
          });
        }
      }

      if (!isTrusted) {
        // Create an MFA challenge
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
        const challenge = await this.db.mfaChallenge.create({
          data: {
            environmentId: identity.environmentId,
            identityId: identity.id,
            expiresAt,
            ip: cached.ipAddress || undefined,
            userAgent: cached.userAgent || undefined,
          },
        });

        return {
          mfaRequired: true,
          challengeId: challenge.id,
        } as any;
      }
    }

    // Setup active session
    const session = await this.sessionRepository.createSession({
      identityId: identity.id,
      expiresInDays: 30,
      ipAddress: cached.ipAddress || null,
      userAgent: cached.userAgent || null,
    });

    // Generate rotated Refresh Token
    const rawRefreshToken = this.passwordService.generateRandomToken();
    const hashedRefreshToken = await this.passwordService.hash(rawRefreshToken);

    await this.sessionRepository.createRefreshToken(session.id, hashedRefreshToken, 30);

    // Generate Access Token JWT
    const accessToken = this.tokenService.signAccessToken({
      sub: identity.id,
      email: identity.email,
      environmentId: identity.environmentId,
    });

    // Publish Session login
    await EventBus.publish(
      new AuthenticationLoggedInEvent({
        identityId: identity.id,
        sessionId: session.id,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      })
    );

    return {
      accessToken,
      expiresIn: 900,
      refreshToken: rawRefreshToken,
      user: {
        id: identity.id,
        email: identity.email,
      },
    };
  }

  /**
   * Links a third-party social provider to an authenticated active identity.
   */
  public async linkAccount(
    identityId: string,
    providerName: string,
    providerCode: string,
    redirectUri: string
  ): Promise<void> {
    const provider = this.getProvider(providerName);

    let tokens: any;
    let profile: OAuthProfile;

    try {
      tokens = await provider.exchangeCode(providerCode, redirectUri);
      profile = await provider.getUserProfile(tokens.accessToken);
    } catch (err: any) {
      throw new AppError(err.message || "Failed to exchange provider tokens for linking", "ERR_VALIDATION_FAILED", 400);
    }

    // Check if this provider profile is already linked to ANOTHER user in this environment
    const existingLink = await this.oauthRepository.findByProviderId(provider.name, profile.providerUserId);
    if (existingLink) {
      if (existingLink.identityId === identityId) {
        // Idempotent return (already linked to this exact user)
        return;
      }
      throw new AppError("This social account is already linked to another user", "ERR_VALIDATION_FAILED", 400);
    }

    // Encrypt tokens
    const encryptedAccess = tokens.accessToken ? encryptionService.encrypt(tokens.accessToken) : null;
    const encryptedRefresh = tokens.refreshToken ? encryptionService.encrypt(tokens.refreshToken) : null;

    // Create link
    await this.oauthRepository.create({
      identityId,
      provider: provider.name,
      providerUserId: profile.providerUserId,
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      accessToken: encryptedAccess || undefined,
      refreshToken: encryptedRefresh || undefined,
      expiresAt: tokens.expiresAt,
    });

    await EventBus.publish(
      new OAuthAccountLinkedEvent({
        identityId,
        provider: provider.name,
        providerUserId: profile.providerUserId,
      })
    );
  }

  /**
   * Unlinks a provider from the user's account.
   */
  public async unlinkAccount(identityId: string, providerName: string): Promise<void> {
    const provider = this.getProvider(providerName);

    const link = await this.oauthRepository.findByProviderForIdentity(identityId, provider.name);
    if (!link) {
      throw new AppError(`Provider '${providerName}' is not linked to this account`, "ERR_VALIDATION_FAILED", 400);
    }

    // Safety Constraint Check: Ensure user has another authentication factor.
    // They must either have a credential record (password) or at least one other OAuth link.
    const hasPassword = await this.credentialRepository.findByIdentityId(identityId);
    const oauthLinkCount = await this.oauthRepository.countForIdentity(identityId);

    if (!hasPassword && oauthLinkCount <= 1) {
      throw new AppError(
        "Cannot unlink the sole remaining login method for this account. Please set a password or link another provider first.",
        "ERR_VALIDATION_FAILED",
        400
      );
    }

    await this.oauthRepository.delete(link.id);

    await EventBus.publish(
      new OAuthAccountUnlinkedEvent({
        identityId,
        provider: provider.name,
        providerUserId: link.providerUserId,
      })
    );
  }

  /**
   * Lists all linked OAuth accounts for an authenticated identity.
   */
  public async getLinkedAccounts(identityId: string): Promise<any[]> {
    const accounts = await this.oauthRepository.findByIdentityId(identityId);
    return accounts.map((acc) => ({
      id: acc.id,
      provider: acc.provider,
      providerUserId: acc.providerUserId,
      email: acc.email,
      displayName: acc.displayName,
      avatarUrl: acc.avatarUrl,
      linkedAt: acc.createdAt,
    }));
  }
}
