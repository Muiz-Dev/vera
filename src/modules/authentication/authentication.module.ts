import type { Application } from "express";
import type { IModule } from "../../core/base/module.interface";
import { CredentialRepository } from "./repositories/credential.repository";
import { SessionRepository } from "./repositories/session.repository";
import { VerificationRepository } from "./repositories/verification.repository";
import { MfaRepository } from "./repositories/mfa.repository";
import { OAuthRepository } from "./repositories/oauth.repository";
import { MfaMethodRepository } from "./repositories/mfa-method.repository";
import { PasswordService } from "./services/password.service";
import { TokenService } from "./services/token.service";
import { AuthenticationService } from "./services/authentication.service";
import { OAuthService } from "./services/oauth.service";
import { MfaService } from "./services/mfa.service";
import { MemoryCacheService } from "../../core/cache/memory-cache.service";
import { AuthenticationController } from "./controllers/authentication.controller";
import { OAuthController } from "./controllers/oauth.controller";
import { MfaController } from "./controllers/mfa.controller";
import { createAuthenticationRouter } from "./routes/authentication.routes";
import { IdentityRepository } from "../identity/repositories/identity.repository";
import { IdentityService } from "../identity/services/identity.service";
import Logger from "../../core/logging/logger";

// OIDC extensions
import { OAuthClientRepository } from "./repositories/oauth-client.repository";
import { OAuthAuthCodeRepository } from "./repositories/oauth-auth-code.repository";
import { OAuthIssuedTokenRepository } from "./repositories/oauth-issued-token.repository";
import { OidcKeyService } from "./services/oidc-key.service";
import { OidcServerService } from "./services/oidc-server.service";
import { OidcController } from "./controllers/oidc.controller";
import { createOidcRouter } from "./routes/oidc.routes";

export class AuthenticationModule implements IModule {
  public readonly name = "AuthenticationModule";

  private credentialRepository!: CredentialRepository;
  private sessionRepository!: SessionRepository;
  private verificationRepository!: VerificationRepository;
  private mfaRepository!: MfaRepository;
  private oauthRepository!: OAuthRepository;
  private mfaMethodRepository!: MfaMethodRepository;

  // OIDC repositories
  private oauthClientRepository!: OAuthClientRepository;
  private oauthAuthCodeRepository!: OAuthAuthCodeRepository;
  private oauthIssuedTokenRepository!: OAuthIssuedTokenRepository;

  private passwordService!: PasswordService;
  private tokenService!: TokenService;
  private cacheService!: MemoryCacheService;
  private authService!: AuthenticationService;
  private oauthService!: OAuthService;
  private mfaService!: MfaService;

  // OIDC services & controllers
  private oidcKeyService!: OidcKeyService;
  private oidcServerService!: OidcServerService;
  private oidcController!: OidcController;

  private controller!: AuthenticationController;
  private oauthController!: OAuthController;
  private mfaController!: MfaController;

  public register(app: Application): void {
    // Shared dependencies from existing identity module mapping
    const identityRepository = new IdentityRepository();
    const identityService = new IdentityService(identityRepository);

    // Instantiate module repositories
    this.credentialRepository = new CredentialRepository();
    this.sessionRepository = new SessionRepository();
    this.verificationRepository = new VerificationRepository();
    this.mfaRepository = new MfaRepository();
    this.oauthRepository = new OAuthRepository();
    this.mfaMethodRepository = new MfaMethodRepository();

    // Instantiate OIDC repositories
    this.oauthClientRepository = new OAuthClientRepository();
    this.oauthAuthCodeRepository = new OAuthAuthCodeRepository();
    this.oauthIssuedTokenRepository = new OAuthIssuedTokenRepository();

    // Instantiate services
    this.passwordService = new PasswordService();
    this.tokenService = new TokenService();
    this.cacheService = new MemoryCacheService();

    this.authService = new AuthenticationService(
      this.credentialRepository,
      this.sessionRepository,
      this.verificationRepository,
      this.mfaRepository,
      this.passwordService,
      this.tokenService,
      identityRepository,
      identityService
    );

    this.oauthService = new OAuthService(
      this.oauthRepository,
      identityRepository,
      identityService,
      this.sessionRepository,
      this.credentialRepository,
      this.passwordService,
      this.tokenService,
      this.cacheService
    );

    this.mfaService = new MfaService(
      this.mfaMethodRepository,
      identityRepository,
      this.credentialRepository,
      this.sessionRepository,
      this.passwordService,
      this.tokenService,
      this.cacheService
    );

    // Instantiate OIDC services & controllers
    this.oidcKeyService = new OidcKeyService();
    this.oidcServerService = new OidcServerService(
      this.oauthClientRepository,
      this.oauthAuthCodeRepository,
      this.oauthIssuedTokenRepository,
      this.oidcKeyService,
      this.passwordService,
      identityRepository
    );
    this.oidcController = new OidcController(
      this.oidcServerService,
      this.oidcKeyService
    );

    // Instantiate controllers
    this.controller = new AuthenticationController(this.authService);
    this.oauthController = new OAuthController(this.oauthService);
    this.mfaController = new MfaController(this.mfaService);

    // Register OIDC router before general authentication
    const oidcRouter = createOidcRouter(this.oidcController);
    app.use("/api/v1", oidcRouter);

    // Register router
    const router = createAuthenticationRouter(this.controller, this.oauthController, this.mfaController);
    app.use("/api/v1/auth", router);

    Logger.info("OIDC routes registered at /api/v1");
    Logger.info("AuthenticationModule routes registered at /api/v1/auth");
  }

  public initialize(): void {
    Logger.info("AuthenticationModule initialized successfully.");
  }
}

export default AuthenticationModule;
