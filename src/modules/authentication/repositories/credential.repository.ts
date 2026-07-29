import { BaseRepository } from "../../../core/base/base.repository";
import { type CredentialEntity } from "../entities/credential.entity";

export class CredentialRepository extends BaseRepository<CredentialEntity> {
  /**
   * Finds a credential by Identity ID.
   */
  async findByIdentityId(identityId: string): Promise<CredentialEntity | null> {
    return this.db.credential.findUnique({
      where: { identityId },
    });
  }

  /**
   * Creates a new credential for an Identity.
   */
  async create(identityId: string, passwordHash: string): Promise<CredentialEntity> {
    return this.db.credential.create({
      data: {
        identityId,
        password: passwordHash,
      },
    });
  }

  /**
   * Updates an existing identity's password credential.
   */
  async update(identityId: string, passwordHash: string): Promise<CredentialEntity> {
    return this.db.credential.update({
      where: { identityId },
      data: {
        password: passwordHash,
      },
    });
  }
}
