import type { Request, Response, NextFunction } from "express";
import { MfaService } from "../services/mfa.service";
import { ResponseFormatter } from "../../../core/http/response-formatter";
import { AppError } from "../../../core/errors";
import { MfaMethodType } from "../../../generated/prisma/client";

export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  /**
   * POST /api/v1/auth/mfa/setup
   * Initiates MFA setup by generating secret and QR provisioning URI.
   */
  public setup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const identityId = req.auth?.identityId;
      const email = req.auth?.email || undefined;

      if (!identityId) {
        throw new AppError("Unauthorized context", "ERR_UNAUTHORIZED", 401);
      }

      const { type } = req.body;
      const mfaType = type === "TOTP" || !type ? MfaMethodType.TOTP : type;

      const result = await this.mfaService.initiateSetup(identityId, mfaType, email);
      ResponseFormatter.success(res, result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/auth/mfa/enable
   * Finalizes MFA setup by verifying the first code and returning 10 backup codes.
   */
  public enable = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const identityId = req.auth?.identityId;
      if (!identityId) {
        throw new AppError("Unauthorized context", "ERR_UNAUTHORIZED", 401);
      }

      const { type, code, deviceName } = req.body;
      if (!code) {
        throw new AppError("Verification code is required to enable MFA.", "ERR_VALIDATION_FAILED", 400);
      }

      const mfaType = type === "TOTP" || !type ? MfaMethodType.TOTP : type;
      const ipAddress = req.ip || null;

      const result = await this.mfaService.confirmSetupAndEnable(
        identityId,
        mfaType,
        code,
        ipAddress,
        deviceName
      );

      ResponseFormatter.success(res, result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/auth/mfa/disable
   * Disables MFA for user (soft-disable audit) and revokes all active sessions.
   */
  public disable = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const identityId = req.auth?.identityId;
      if (!identityId) {
        throw new AppError("Unauthorized context", "ERR_UNAUTHORIZED", 401);
      }

      const { passwordConfirm, reason } = req.body;
      if (!passwordConfirm) {
        throw new AppError("Password confirmation is required to disable MFA.", "ERR_VALIDATION_FAILED", 400);
      }

      await this.mfaService.disableMfa(identityId, passwordConfirm, "user", reason || "Disabled by user");
      ResponseFormatter.success(res, { message: "MFA has been successfully disabled and all sessions revoked." });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/auth/mfa/verify
   * Verifies an MFA challenge with TOTP or backup code, return full login tokens.
   */
  public verify = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { challengeId, code, deviceFingerprint } = req.body;
      if (!challengeId || !code) {
        throw new AppError("challengeId and code are required.", "ERR_VALIDATION_FAILED", 400);
      }

      const ipAddress = req.ip || null;
      const userAgent = req.headers["user-agent"] || null;

      const result = await this.mfaService.verifyChallenge(
        challengeId,
        code,
        ipAddress,
        userAgent,
        deviceFingerprint || null
      );

      ResponseFormatter.success(res, result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/auth/mfa/trusted-devices/revoke
   * Revokes a remembered trusted device fingerprint.
   */
  public revokeTrustedDevice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const identityId = req.auth?.identityId;
      if (!identityId) {
        throw new AppError("Unauthorized context", "ERR_UNAUTHORIZED", 401);
      }

      const { deviceFingerprint } = req.body;
      if (!deviceFingerprint) {
        throw new AppError("deviceFingerprint is required to revoke trusted status.", "ERR_VALIDATION_FAILED", 400);
      }

      await this.mfaService.revokeTrustedDevice(identityId, deviceFingerprint);
      ResponseFormatter.success(res, { message: "Device trust revoked successfully." });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/auth/mfa/backup-codes/regenerate
   * Regenerates a new set of 10 backup codes (invalidating previous ones).
   */
  public regenerateBackupCodes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const identityId = req.auth?.identityId;
      if (!identityId) {
        throw new AppError("Unauthorized context", "ERR_UNAUTHORIZED", 401);
      }

      const { passwordConfirm } = req.body;
      if (!passwordConfirm) {
        throw new AppError("Password confirmation is required to regenerate backup codes.", "ERR_VALIDATION_FAILED", 400);
      }

      const result = await this.mfaService.regenerateBackupCodes(identityId, passwordConfirm);
      ResponseFormatter.success(res, result);
    } catch (err) {
      next(err);
    }
  };
}
