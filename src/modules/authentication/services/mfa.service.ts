import crypto from "crypto";
import { BaseService } from "../../../core/base/base.service";
import { RequestContext } from "../../../core/http/context/request-context";
import { EventBus } from "../../../core/events/event.bus";
import { AppError } from "../../../core/errors";
import { MfaMethodType } from "../../../generated/prisma/client";

// Import types & strategies
import type { ICacheService } from "../../../core/cache/cache.service";
import type { MfaStrategy } from "../types/mfa.types";
import { TotpMfaStrategy } from "./strategies/totp.strategy";
import { encryptionService } from "../../../core/security/encryption.service";

// Import repositories & services
import { MfaMethodRepository } from "../repositories/mfa-method.repository";
import { IdentityRepository } from "../../identity/repositories/identity.repository";
import { CredentialRepository } from "../repositories/credential.repository";
import { SessionRepository } from "../repositories/session.repository";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";

// Import events
import {
  MfaSetupInitiatedEvent,
  MfaEnabledEvent,
  MfaDisabledEvent,
  MfaVerificationSucceededEvent,
  MfaVerificationFailedEvent,
  BackupCodesGeneratedEvent,
  BackupCodeUsedEvent,
  BackupCodesExhaustedEvent,
  TrustedDeviceAddedEvent,
  TrustedDeviceRevokedEvent,
} from "../events/mfa.events";
import { AuthenticationLoggedInEvent } from "../events/authentication.events";
import type { LoginResponseData } from "../types/authentication.types";

export class MfaService extends BaseService {
  private readonly strategies = new Map<MfaMethodType, MfaStrategy>();

  constructor(
    private readonly mfaMethodRepository: MfaMethodRepository,
    private readonly identityRepository: IdentityRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly cacheService: ICacheService
  ) {
    super();
    // Register strategies
    this.strategies.set(MfaMethodType.TOTP, new TotpMfaStrategy());
  }

  /**
   * Helper to retrieve a registered MFA strategy.
   */
  private getStrategy(type: MfaMethodType): MfaStrategy {
    const strategy = this.strategies.get(type);
    if (!strategy) {
      throw new AppError(`MFA strategy '${type}' is not supported`, "ERR_VALIDATION_FAILED", 400);
    }
    return strategy;
  }

  /**
   * Helper to generate a secure 8-character backup recovery code string (formatted as XXXX-XXXX).
   */
  private generateBackupCodeString(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Alphanumeric, omitting ambiguous characters
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars[crypto.randomInt(0, chars.length)];
    }
    return `${code.substring(0, 4)}-${code.substring(4)}`;
  }

  /**
   * Generates a device fingerprint hash to prevent database plaintext leakage.
   */
  private hashFingerprint(fingerprint: string): string {
    return crypto.createHash("sha256").update(fingerprint).digest("hex");
  }

  /**
   * Initiates MFA setup by generating a secret and otpauth provisioning URI.
   * Saves/upserts the record as disabled first.
   */
  public async initiateSetup(
    identityId: string,
    type: MfaMethodType,
    email?: string
  ): Promise<{ secret: string; provisioningUri: string }> {
    const strategy = this.getStrategy(type);
    const { secret, provisioningUri } = await strategy.generateSecret(identityId, email);

    // Encrypt the raw secret before saving
    const encryptedSecret = encryptionService.encrypt(secret);

    // Save pending MFA method
    await this.mfaMethodRepository.upsertMethod({
      identityId,
      type,
      secret: encryptedSecret,
      enabled: false,
    });

    await EventBus.publish(new MfaSetupInitiatedEvent({ identityId, type }));

    return { secret, provisioningUri: provisioningUri || "" };
  }

  /**
   * Verifies the first TOTP code to finalize and enable MFA, generating 10 recovery codes.
   */
  public async confirmSetupAndEnable(
    identityId: string,
    type: MfaMethodType,
    code: string,
    ipAddress?: string | null,
    deviceName?: string | null
  ): Promise<{ backupCodes: string[] }> {
    const mfaMethod = await this.mfaMethodRepository.findActiveMethod(identityId, type);
    if (!mfaMethod) {
      throw new AppError("No pending MFA setup found. Initiate setup first.", "ERR_VALIDATION_FAILED", 400);
    }

    const strategy = this.getStrategy(type);
    const decryptedSecret = encryptionService.decrypt(mfaMethod.secret);

    const result = await strategy.verifyCode(decryptedSecret, code, mfaMethod.lastVerifiedCounter);
    if (!result.success) {
      throw new AppError("Invalid MFA verification code.", "ERR_VALIDATION_FAILED", 400);
    }

    // Enable the MFA method with auditing metadata
    await this.mfaMethodRepository.updateMethod(mfaMethod.id, {
      enabled: true,
      lastUsedAt: new Date(),
      lastVerifiedCounter: result.nextCounter,
      deviceName: deviceName || null,
      disabledAt: null,
      disabledBy: null,
      disableReason: null,
    });

    // Generate 10 unique recovery codes
    const backupCodes: string[] = [];
    await this.mfaMethodRepository.deleteBackupCodes(identityId);

    for (let i = 0; i < 10; i++) {
      const rawCode = this.generateBackupCodeString();
      backupCodes.push(rawCode);

      // Hash using Argon2id for premium security
      const hashedCode = await this.passwordService.hash(rawCode);
      await this.mfaMethodRepository.createBackupCode(identityId, hashedCode);
    }

    await EventBus.publish(new MfaEnabledEvent({ identityId, type }));
    await EventBus.publish(new BackupCodesGeneratedEvent({ identityId, count: 10 }));

    return { backupCodes };
  }

  /**
   * Soft-disables MFA for a user, keeping the record for auditability.
   * Requires confirmation of password and revokes all active sessions.
   */
  public async disableMfa(
    identityId: string,
    passwordConfirm: string,
    disabledBy = "user",
    reason = "Disabled by user"
  ): Promise<void> {
    // 1. Confirm password
    const credential = await this.credentialRepository.findByIdentityId(identityId);
    if (!credential) {
      throw new AppError("Invalid user credentials.", "ERR_UNAUTHORIZED", 401);
    }

    const isPasswordValid = await this.passwordService.verify(passwordConfirm, credential.password);
    if (!isPasswordValid) {
      throw new AppError("Invalid password confirmation.", "ERR_UNAUTHORIZED", 401);
    }

    // 2. Resolve enabled methods
    const activeMethods = await this.mfaMethodRepository.listActiveMethods(identityId);
    const enabledMethods = activeMethods.filter((m) => m.enabled);

    for (const mfaMethod of enabledMethods) {
      // Soft-disable the method
      await this.mfaMethodRepository.updateMethod(mfaMethod.id, {
        enabled: false,
        disabledAt: new Date(),
        disabledBy,
        disableReason: reason,
      });

      await EventBus.publish(
        new MfaDisabledEvent({
          identityId,
          type: mfaMethod.type,
          disabledBy,
          disableReason: reason,
        })
      );
    }

    // 3. Clear backup codes, active challenges, and remembered trusted devices
    await this.mfaMethodRepository.deleteBackupCodes(identityId);
    await this.mfaMethodRepository.deleteMfaChallenges(identityId);
    await this.mfaMethodRepository.revokeAllTrustedDevices(identityId);

    // 4. Invalidate all existing sessions
    await this.sessionRepository.revokeAllSessions(identityId);
  }

  /**
   * Initiates an MFA challenge in the DB, returning a challenge identifier.
   */
  public async createChallenge(
    identityId: string,
    ip?: string | null,
    userAgent?: string | null
  ): Promise<{ challengeId: string }> {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // Challenges expire in 5 minutes
    const challenge = await this.mfaMethodRepository.createChallenge(
      identityId,
      expiresAt,
      ip || undefined,
      userAgent || undefined
    );
    return { challengeId: challenge.id };
  }

  /**
   * Verifies an active MFA challenge, either using TOTP or an active Backup recovery code.
   * Upon success, provisions full Vera session tokens.
   */
  public async verifyChallenge(
    challengeId: string,
    code: string,
    ipAddress?: string | null,
    userAgent?: string | null,
    deviceFingerprint?: string | null
  ): Promise<LoginResponseData> {
    const challenge = await this.mfaMethodRepository.findChallenge(challengeId);
    if (!challenge || challenge.completedAt || challenge.usedAt || challenge.expiresAt < new Date()) {
      throw new AppError("Invalid, used, or expired MFA verification challenge.", "ERR_UNAUTHORIZED", 401);
    }

    // Propagate correct environment in RequestContext store
    const store = RequestContext.get();
    if (store) {
      store.environmentId = challenge.environmentId;
    }

    const identityId = challenge.identityId;
    const activeMethods = await this.mfaMethodRepository.listActiveMethods(identityId);
    const activeTotpMethod = activeMethods.find((m) => m.enabled && m.type === MfaMethodType.TOTP);

    if (!activeTotpMethod) {
      throw new AppError("MFA is not enabled for this user.", "ERR_VALIDATION_FAILED", 400);
    }

    const identity = await this.identityRepository.findById(identityId);
    if (!identity || identity.status === "DEACTIVATED") {
      throw new AppError("Associated user does not exist or has been deactivated.", "ERR_UNAUTHORIZED", 401);
    }

    const cleanedCode = code.trim().replace(/\s/g, "");

    // 1. Check if the code is a backup/recovery code (8-character code with optional hyphen)
    const isBackupFormat = cleanedCode.replace("-", "").length === 8;

    if (isBackupFormat) {
      const backupCodes = await this.mfaMethodRepository.listBackupCodes(identityId);
      const unusedBackupCodes = backupCodes.filter((bc) => !bc.usedAt);

      let matchedCodeRecord: any = null;
      for (const bc of unusedBackupCodes) {
        const isMatch = await this.passwordService.verify(cleanedCode, bc.codeHash);
        if (isMatch) {
          matchedCodeRecord = bc;
          break;
        }
      }

      if (!matchedCodeRecord) {
        await EventBus.publish(
          new MfaVerificationFailedEvent({
            identityId,
            type: "RECOVERY_CODE",
            error: "Invalid backup recovery code",
            isBackupCode: true,
          })
        );
        throw new AppError("Invalid backup recovery code.", "ERR_UNAUTHORIZED", 401);
      }

      // Mark backup code as used
      await this.mfaMethodRepository.markBackupCodeAsUsed(matchedCodeRecord.id);

      // Complete challenge
      await this.mfaMethodRepository.completeChallenge(challengeId, MfaMethodType.TOTP);
      await this.mfaMethodRepository.markChallengeAsUsed(challengeId);

      await EventBus.publish(new BackupCodeUsedEvent({ identityId, codeId: matchedCodeRecord.id }));

      const remainingUnused = await this.mfaMethodRepository.countUnusedBackupCodes(identityId);
      if (remainingUnused === 0) {
        await EventBus.publish(new BackupCodesExhaustedEvent({ identityId }));
      }

      await EventBus.publish(
        new MfaVerificationSucceededEvent({
          identityId,
          type: "RECOVERY_CODE",
          isBackupCode: true,
        })
      );
    } else {
      // 2. Standard TOTP verification
      const strategy = this.getStrategy(MfaMethodType.TOTP);
      const decryptedSecret = encryptionService.decrypt(activeTotpMethod.secret);

      const result = await strategy.verifyCode(decryptedSecret, cleanedCode, activeTotpMethod.lastVerifiedCounter);
      if (!result.success) {
        await EventBus.publish(
          new MfaVerificationFailedEvent({
            identityId,
            type: MfaMethodType.TOTP,
            error: "Invalid TOTP verification code",
            isBackupCode: false,
          })
        );
        throw new AppError("Invalid MFA verification code.", "ERR_UNAUTHORIZED", 401);
      }

      // Update TOTP method counter and lastUsedIp for auditing
      await this.mfaMethodRepository.updateMethod(activeTotpMethod.id, {
        lastUsedAt: new Date(),
        lastVerifiedCounter: result.nextCounter,
        lastUsedIp: ipAddress || null,
      });

      // Complete and mark challenge as used
      await this.mfaMethodRepository.completeChallenge(challengeId, MfaMethodType.TOTP);
      await this.mfaMethodRepository.markChallengeAsUsed(challengeId);

      await EventBus.publish(
        new MfaVerificationSucceededEvent({
          identityId,
          type: MfaMethodType.TOTP,
          isBackupCode: false,
        })
      );
    }

    // 3. Option: Add device to Trusted Devices list if requested
    if (deviceFingerprint) {
      const hashedFingerprint = this.hashFingerprint(deviceFingerprint);
      const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000); // 30 days
      await this.mfaMethodRepository.upsertTrustedDevice(identityId, hashedFingerprint, expiresAt);
      await EventBus.publish(new TrustedDeviceAddedEvent({ identityId, deviceFingerprint: hashedFingerprint }));
    }

    // 4. Create secure Vera Session and return tokens
    const session = await this.sessionRepository.createSession({
      identityId: identity.id,
      expiresInDays: 30,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    });

    const rawRefreshToken = this.passwordService.generateRandomToken();
    const hashedRefreshToken = await this.passwordService.hash(rawRefreshToken);

    await this.sessionRepository.createRefreshToken(session.id, hashedRefreshToken, 30);

    const accessToken = this.tokenService.signAccessToken({
      sub: identity.id,
      email: identity.email,
      environmentId: identity.environmentId,
    });

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
   * Regenerates a fresh set of 10 backup codes (invalidating previous unused ones).
   * Requires confirmation of password.
   */
  public async regenerateBackupCodes(identityId: string, passwordConfirm: string): Promise<{ backupCodes: string[] }> {
    const credential = await this.credentialRepository.findByIdentityId(identityId);
    if (!credential) {
      throw new AppError("Invalid user credentials.", "ERR_UNAUTHORIZED", 401);
    }

    const isPasswordValid = await this.passwordService.verify(passwordConfirm, credential.password);
    if (!isPasswordValid) {
      throw new AppError("Invalid password confirmation.", "ERR_UNAUTHORIZED", 401);
    }

    // Ensure they have MFA enabled
    const activeMethods = await this.mfaMethodRepository.listActiveMethods(identityId);
    const activeTotp = activeMethods.find((m) => m.enabled && m.type === MfaMethodType.TOTP);
    if (!activeTotp) {
      throw new AppError("Cannot generate recovery codes without active MFA enabled.", "ERR_VALIDATION_FAILED", 400);
    }

    // Generate 10 new codes
    const backupCodes: string[] = [];
    await this.mfaMethodRepository.deleteBackupCodes(identityId);

    for (let i = 0; i < 10; i++) {
      const rawCode = this.generateBackupCodeString();
      backupCodes.push(rawCode);

      const hashedCode = await this.passwordService.hash(rawCode);
      await this.mfaMethodRepository.createBackupCode(identityId, hashedCode);
    }

    await EventBus.publish(new BackupCodesGeneratedEvent({ identityId, count: 10 }));

    return { backupCodes };
  }

  /**
   * Check if a specific device fingerprint is trusted for skip-MFA logic.
   */
  public async isDeviceTrusted(identityId: string, deviceFingerprint: string): Promise<boolean> {
    const hashedFingerprint = this.hashFingerprint(deviceFingerprint);
    const activeDevice = await this.mfaMethodRepository.findActiveTrustedDevice(identityId, hashedFingerprint);
    return !!activeDevice;
  }

  /**
   * Revokes a remembered trusted device for a user.
   */
  public async revokeTrustedDevice(identityId: string, deviceFingerprint: string): Promise<void> {
    const hashedFingerprint = this.hashFingerprint(deviceFingerprint);
    const device = await this.mfaMethodRepository.findActiveTrustedDevice(identityId, hashedFingerprint);
    if (!device) {
      throw new AppError("No active trusted device found with this fingerprint.", "ERR_VALIDATION_FAILED", 400);
    }

    await this.mfaMethodRepository.revokeTrustedDevice(device.id);
    await EventBus.publish(new TrustedDeviceRevokedEvent({ identityId, deviceFingerprint: hashedFingerprint }));
  }

  /**
   * Lists active trusted devices for an authenticated identity.
   */
  public async getTrustedDevices(identityId: string): Promise<any[]> {
    const list = await this.mfaMethodRepository.listTrustedDevices(identityId);
    return list.map((d) => ({
      id: d.id,
      expiresAt: d.expiresAt,
      lastUsedAt: d.lastUsedAt,
      createdAt: d.createdAt,
    }));
  }
}
