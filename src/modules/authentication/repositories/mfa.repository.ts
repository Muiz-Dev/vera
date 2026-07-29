import { BaseRepository } from "../../../core/base/base.repository";
import { type MfaSecretEntity } from "../entities/credential.entity";

export class MfaRepository extends BaseRepository<MfaSecretEntity> {
  /**
   * Finds an MFA secret by Identity ID.
   */
  async findByIdentityId(identityId: string): Promise<MfaSecretEntity | null> {
    return this.db.mfaSecret.findUnique({
      where: { identityId },
    });
  }

  /**
   * Upserts the MFA secret for an Identity.
   */
  async saveMfaSecret(identityId: string, secret: string): Promise<MfaSecretEntity> {
    return this.db.mfaSecret.upsert({
      where: { identityId },
      update: {
        secret,
      },
      create: {
        identityId,
        secret,
      },
    });
  }

  /**
   * Toggles the enabled state of MFA.
   */
  async toggleMfa(identityId: string, isEnabled: boolean): Promise<MfaSecretEntity> {
    return this.db.mfaSecret.update({
      where: { identityId },
      data: {
        isEnabled,
      },
    });
  }
}
