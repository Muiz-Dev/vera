import { BaseService } from "../../../core/base/base.service";
import { RequestContext } from "../../../core/http/context/request-context";
import { CredentialRepository } from "../repositories/credential.repository";
import { SessionRepository } from "../repositories/session.repository";
import { VerificationRepository } from "../repositories/verification.repository";
import { MfaRepository } from "../repositories/mfa.repository";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";
import { IdentityRepository } from "../../identity/repositories/identity.repository";
import { IdentityService } from "../../identity/services/identity.service";
import { EventBus } from "../../../core/events/event.bus";
import { AppError, NotFoundError } from "../../../core/errors";
import { IdentityStatus } from "../../../generated/prisma/client";
import {
  AuthenticationRegisteredEvent,
  AuthenticationLoggedInEvent,
  AuthenticationLoggedOutEvent,
  PasswordChangedEvent,
  PasswordResetRequestedEvent,
  PasswordResetCompletedEvent,
  EmailVerificationRequestedEvent,
  EmailVerifiedEvent,
  RefreshTokenRotatedEvent,
  SessionRevokedEvent,
} from "../events/authentication.events";
import { type LoginResponseData, type RefreshResponseData } from "../types/authentication.types";

export class AuthenticationService extends BaseService {
  constructor(
    private readonly credentialRepository: CredentialRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly verificationRepository: VerificationRepository,
    private readonly mfaRepository: MfaRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly identityRepository: IdentityRepository,
    private readonly identityService: IdentityService
  ) {
    super();
  }

  /**
   * Registers a new Identity with Profile and sets up Credential password authentication.
   */
  async register(data: {
    email: string;
    password: string;
    profile?: {
      firstName?: string;
      lastName?: string;
      avatar?: string;
      displayName?: string;
      metadata?: any;
    };
  }): Promise<{ id: string; email: string; status: string }> {
    const emailNormalized = data.email.trim().toLowerCase();

    // Check if unique email already exists
    const existing = await this.identityRepository.findByEmail(emailNormalized);
    if (existing) {
      throw new AppError("An identity with this email already exists", "ERR_VALIDATION_FAILED", 400);
    }

    // Hash the password first using Argon2id
    const passwordHash = await this.passwordService.hash(data.password);

    // Call the Identity module service to create the identity record
    const createPayload: any = { email: emailNormalized };
    if (data.profile) {
      createPayload.profile = data.profile;
    }
    const identity = await this.identityService.createIdentity(createPayload);

    // Create the credentials linked to this Identity
    await this.credentialRepository.create(identity.id, passwordHash);

    // Publish AuthenticationRegisteredEvent
    await EventBus.publish(
      new AuthenticationRegisteredEvent({
        identityId: identity.id,
        email: identity.email,
      })
    );

    // Request email verification link trigger
    await this.requestEmailVerification(identity.id, emailNormalized);

    return {
      id: identity.id,
      email: identity.email ?? "",
      status: identity.status,
    };
  }

  /**
   * Logs a user in, verifying credentials, creating a Session, and generating tokens.
   */
  async login(
    data: { email: string; password: string },
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<LoginResponseData> {
    const emailNormalized = data.email.trim().toLowerCase();

    // Account enumeration protection: perform dummy verify if identity/credential is not found
    const identity = await this.identityRepository.findByEmail(emailNormalized);
    if (!identity) {
      await this.passwordService.dummyVerify();
      throw new AppError("Invalid email or password", "ERR_UNAUTHORIZED", 401);
    }

    const credential = await this.credentialRepository.findByIdentityId(identity.id);
    if (!credential) {
      await this.passwordService.dummyVerify();
      throw new AppError("Invalid email or password", "ERR_UNAUTHORIZED", 401);
    }

    const isPasswordValid = await this.passwordService.verify(data.password, credential.password);
    if (!isPasswordValid) {
      throw new AppError("Invalid email or password", "ERR_UNAUTHORIZED", 401);
    }

    // Verify identity status
    if (identity.status === IdentityStatus.SUSPENDED) {
      throw new AppError("Identity is suspended. Please contact support.", "ERR_FORBIDDEN", 403);
    }
    if (identity.status === IdentityStatus.DEACTIVATED) {
      throw new AppError("Identity has been deactivated.", "ERR_FORBIDDEN", 403);
    }

    // Create secure Session
    const sessionPayload: any = {
      identityId: identity.id,
      expiresInDays: 30,
    };
    if (ipAddress !== undefined) sessionPayload.ipAddress = ipAddress;
    if (userAgent !== undefined) sessionPayload.userAgent = userAgent;

    const session = await this.sessionRepository.createSession(sessionPayload);

    // Generate rotated Refresh Token
    const rawRefreshToken = this.passwordService.generateRandomToken();
    const hashedRefreshToken = await this.passwordService.hash(rawRefreshToken);

    await this.sessionRepository.createRefreshToken(session.id, hashedRefreshToken, 30);

    // Generate access token
    const accessToken = this.tokenService.signAccessToken({
      sub: identity.id,
      email: identity.email,
      environmentId: identity.environmentId,
    });

    // Publish Login event
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
   * Refreshes access and rotates refresh tokens (Refresh Token Rotation).
   * Replay detection automatically revokes entire sessions upon reuse of rotated token.
   */
  async refresh(rawRefreshToken: string): Promise<RefreshResponseData> {
    // We must find the Refresh Token by matching it against hashes or finding it in db.
    // Since refresh tokens are stored in the database as hashed versions to prevent leakage,
    // we need to look up active sessions and check hashes. To maintain simple, robust lookup:
    // We can fetch refresh tokens that are non-expired and compare.
    const allActiveTokens = await this.db.refreshToken.findMany({
      where: {
        revokedAt: null,
        expiresAt: { gt: new Date() },
        session: {
          revokedAt: null,
          identity: {
            environmentId: RequestContext.environmentId as string,
          },
        },
      },
      include: {
        session: true,
      },
    }) as any[];

    let foundTokenRecord: any = null;
    for (const record of allActiveTokens) {
      const match = await this.passwordService.verify(rawRefreshToken, record.token);
      if (match) {
        foundTokenRecord = record;
        break;
      }
    }

    // Replay attack / token theft detection check:
    // If we couldn't find an active token but a revoked token is provided, we should identify which session this token belonged to.
    if (!foundTokenRecord) {
      const allRevokedTokens = await this.db.refreshToken.findMany({
        where: {
          NOT: { revokedAt: null },
          session: {
            identity: {
              environmentId: RequestContext.environmentId as string,
            },
          },
        },
        include: {
          session: true,
        },
      }) as any[];

      for (const record of allRevokedTokens) {
        const match = await this.passwordService.verify(rawRefreshToken, record.token);
        if (match) {
          // Token has been revoked! Replay detected. Revoke entire session.
          await this.sessionRepository.revokeSession(record.sessionId);
          await this.sessionRepository.revokeAllRefreshTokensForSession(record.sessionId);

          await EventBus.publish(
            new SessionRevokedEvent({
              identityId: record.session.identityId,
              sessionId: record.sessionId,
              reason: "Replay attack detected. Revoking complete session.",
            })
          );

          throw new AppError("Invalid refresh token. Session compromised.", "ERR_UNAUTHORIZED", 401);
        }
      }

      throw new AppError("Invalid refresh token", "ERR_UNAUTHORIZED", 401);
    }

    // Extract records
    const session = foundTokenRecord.session;
    const identity = await this.identityRepository.findById(session.identityId);
    if (!identity) {
      throw new AppError("Associated user does not exist", "ERR_UNAUTHORIZED", 401);
    }

    // Revoke previous refresh token
    await this.sessionRepository.revokeRefreshToken(foundTokenRecord.id);

    // Create a new rotated refresh token
    const newRawRefreshToken = this.passwordService.generateRandomToken();
    const newHashedRefreshToken = await this.passwordService.hash(newRawRefreshToken);

    await this.sessionRepository.createRefreshToken(session.id, newHashedRefreshToken, 30);
    await this.sessionRepository.updateLastActive(session.id);

    // Generate new Access Token
    const accessToken = this.tokenService.signAccessToken({
      sub: identity.id,
      email: identity.email,
      environmentId: identity.environmentId,
    });

    // Publish Refresh Event
    await EventBus.publish(
      new RefreshTokenRotatedEvent({
        identityId: identity.id,
        sessionId: session.id,
        oldTokenHash: foundTokenRecord.token,
        newTokenHash: newHashedRefreshToken,
      })
    );

    return {
      accessToken,
      expiresIn: 900,
      refreshToken: newRawRefreshToken,
    };
  }

  /**
   * Logs out the user by revoking their current refresh token and session.
   */
  async logout(rawRefreshToken: string): Promise<void> {
    const allActiveTokens = await this.db.refreshToken.findMany({
      where: {
        revokedAt: null,
        session: {
          revokedAt: null,
          identity: {
            environmentId: RequestContext.environmentId as string,
          },
        },
      },
      include: {
        session: true,
      },
    });

    let foundTokenRecord: any = null;
    for (const record of allActiveTokens) {
      const match = await this.passwordService.verify(rawRefreshToken, record.token);
      if (match) {
        foundTokenRecord = record;
        break;
      }
    }

    if (!foundTokenRecord) {
      throw new AppError("Invalid refresh token", "ERR_UNAUTHORIZED", 401);
    }

    const session = foundTokenRecord.session;

    // Revoke refresh token and session
    await this.sessionRepository.revokeRefreshToken(foundTokenRecord.id);
    await this.sessionRepository.revokeSession(session.id);

    // Publish LoggedOut Event
    await EventBus.publish(
      new AuthenticationLoggedOutEvent({
        identityId: session.identityId,
        sessionId: session.id,
      })
    );
  }

  /**
   * Triggers a request for password reset. Account enumeration safe.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const emailNormalized = email.trim().toLowerCase();
    const identity = await this.identityRepository.findByEmail(emailNormalized);

    if (!identity) {
      // Return successfully to prevent account enumeration
      this.logger.info(`Password reset requested for non-existent email: ${emailNormalized}`);
      return;
    }

    // Generate raw secure token and expire date (1 hour)
    const rawResetToken = this.passwordService.generateRandomToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await this.verificationRepository.createPasswordReset(identity.id, rawResetToken, expiresAt);

    // Publish PasswordResetRequestedEvent
    await EventBus.publish(
      new PasswordResetRequestedEvent({
        identityId: identity.id,
        email: emailNormalized,
        token: rawResetToken,
        expiresAt,
      })
    );
  }

  /**
   * Resets password using the random verification token.
   */
  async resetPassword(token: string, password: string): Promise<void> {
    const record = await this.verificationRepository.findPasswordReset(token);

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new AppError("Invalid or expired password reset token", "ERR_VALIDATION_FAILED", 400);
    }

    // Verify token strictly with constant time comparison
    const isTokenValid = this.passwordService.timingSafeCompare(token, record.token);
    if (!isTokenValid) {
      throw new AppError("Invalid or expired password reset token", "ERR_VALIDATION_FAILED", 400);
    }

    // Hash and update credential password
    const passwordHash = await this.passwordService.hash(password);
    await this.credentialRepository.update(record.identityId, passwordHash);

    // Use password reset token
    await this.verificationRepository.usePasswordResetToken(record.id);

    // Revoke all active sessions for this compromised/reset identity
    await this.sessionRepository.revokeAllSessions(record.identityId);

    // Publish Events
    await EventBus.publish(new PasswordChangedEvent({ identityId: record.identityId }));
    await EventBus.publish(new PasswordResetCompletedEvent({ identityId: record.identityId }));
  }

  /**
   * Helper to create and trigger email verification.
   */
  async requestEmailVerification(identityId: string, email: string): Promise<void> {
    const rawVerificationToken = this.passwordService.generateRandomToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Valid for 7 days

    await this.verificationRepository.createEmailVerification(identityId, rawVerificationToken, expiresAt);

    // Publish Event
    await EventBus.publish(
      new EmailVerificationRequestedEvent({
        identityId,
        email,
        token: rawVerificationToken,
        expiresAt,
      })
    );
  }

  /**
   * Verifies the email verification token and sets the Identity status to ACTIVE.
   */
  async verifyEmail(token: string): Promise<void> {
    const record = await this.verificationRepository.findEmailVerification(token);

    if (!record || record.verifiedAt || record.expiresAt < new Date()) {
      throw new AppError("Invalid or expired email verification token", "ERR_VALIDATION_FAILED", 400);
    }

    const isTokenValid = this.passwordService.timingSafeCompare(token, record.token);
    if (!isTokenValid) {
      throw new AppError("Invalid or expired email verification token", "ERR_VALIDATION_FAILED", 400);
    }

    // Use verification token
    await this.verificationRepository.verifyEmailToken(record.id);

    // Retrieve Identity and update status to ACTIVE (if it is PENDING)
    const identity = await this.identityRepository.findById(record.identityId);
    if (identity && identity.status === IdentityStatus.PENDING) {
      await this.identityRepository.update(record.identityId, {
        status: IdentityStatus.ACTIVE,
      });
    }

    // Publish EmailVerifiedEvent
    await EventBus.publish(
      new EmailVerifiedEvent({
        identityId: record.identityId,
        email: identity?.email ?? null,
      })
    );
  }

  /**
   * Create/Enroll MFA Foundation (secret key).
   */
  async setupMfaSecret(identityId: string): Promise<{ secret: string }> {
    const mfaSecret = this.passwordService.generateRandomToken(20).toUpperCase(); // Secure random secret foundation
    await this.mfaRepository.saveMfaSecret(identityId, mfaSecret);
    return { secret: mfaSecret };
  }
}
