import { BaseRepository } from "../../../core/base/base.repository";
import { type EmailVerificationEntity, type PasswordResetEntity } from "../entities/credential.entity";

export class VerificationRepository extends BaseRepository<any> {
  /**
   * Creates an email verification token.
   */
  async createEmailVerification(identityId: string, token: string, expiresAt: Date): Promise<EmailVerificationEntity> {
    return this.db.emailVerification.create({
      data: {
        identityId,
        token,
        expiresAt,
      },
    });
  }

  /**
   * Finds an email verification token.
   */
  async findEmailVerification(token: string): Promise<EmailVerificationEntity | null> {
    return this.db.emailVerification.findUnique({
      where: { token },
    });
  }

  /**
   * Marks an email verification as verified.
   */
  async verifyEmailToken(id: string): Promise<EmailVerificationEntity> {
    return this.db.emailVerification.update({
      where: { id },
      data: {
        verifiedAt: new Date(),
      },
    });
  }

  /**
   * Creates a password reset token.
   */
  async createPasswordReset(identityId: string, token: string, expiresAt: Date): Promise<PasswordResetEntity> {
    return this.db.passwordReset.create({
      data: {
        identityId,
        token,
        expiresAt,
      },
    });
  }

  /**
   * Finds a password reset token.
   */
  async findPasswordReset(token: string): Promise<PasswordResetEntity | null> {
    return this.db.passwordReset.findUnique({
      where: { token },
    });
  }

  /**
   * Marks a password reset token as used.
   */
  async usePasswordResetToken(id: string): Promise<PasswordResetEntity> {
    return this.db.passwordReset.update({
      where: { id },
      data: {
        usedAt: new Date(),
      },
    });
  }
}
