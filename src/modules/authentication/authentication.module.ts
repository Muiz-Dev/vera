import type { Application } from "express";
import type { IModule } from "../../core/base/module.interface";
import { CredentialRepository } from "./repositories/credential.repository";
import { SessionRepository } from "./repositories/session.repository";
import { VerificationRepository } from "./repositories/verification.repository";
import { MfaRepository } from "./repositories/mfa.repository";
import { PasswordService } from "./services/password.service";
import { TokenService } from "./services/token.service";
import { AuthenticationService } from "./services/authentication.service";
import { AuthenticationController } from "./controllers/authentication.controller";
import { createAuthenticationRouter } from "./routes/authentication.routes";
import { IdentityRepository } from "../identity/repositories/identity.repository";
import { IdentityService } from "../identity/services/identity.service";
import Logger from "../../core/logging/logger";

export class AuthenticationModule implements IModule {
  public readonly name = "AuthenticationModule";

  private credentialRepository!: CredentialRepository;
  private sessionRepository!: SessionRepository;
  private verificationRepository!: VerificationRepository;
  private mfaRepository!: MfaRepository;
  private passwordService!: PasswordService;
  private tokenService!: TokenService;
  private authService!: AuthenticationService;
  private controller!: AuthenticationController;

  public register(app: Application): void {
    // Shared dependencies from existing identity module mapping
    const identityRepository = new IdentityRepository();
    const identityService = new IdentityService(identityRepository);

    // Instantiate module repositories
    this.credentialRepository = new CredentialRepository();
    this.sessionRepository = new SessionRepository();
    this.verificationRepository = new VerificationRepository();
    this.mfaRepository = new MfaRepository();

    // Instantiate services
    this.passwordService = new PasswordService();
    this.tokenService = new TokenService();
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

    // Instantiate controller
    this.controller = new AuthenticationController(this.authService);

    // Register router
    const router = createAuthenticationRouter(this.controller);
    app.use("/api/v1/auth", router);

    Logger.info("AuthenticationModule routes registered at /api/v1/auth");
  }

  public initialize(): void {
    Logger.info("AuthenticationModule initialized successfully.");
  }
}

export default AuthenticationModule;
