import { BaseRepository } from "../../../core/base/base.repository";

export class OAuthAuthCodeRepository extends BaseRepository<any> {
  async findByCode(environmentId: string, code: string) {
    return this.db.oAuthAuthCode.findFirst({
      where: {
        environmentId,
        code,
      },
      include: {
        client: true,
        identity: true,
      },
    });
  }

  async create(data: {
    environmentId: string;
    clientId: string;
    identityId: string;
    code: string;
    redirectUri: string;
    scope: string[];
    codeChallenge?: string | null;
    codeChallengeMethod?: string | null;
    expiresAt: Date;
  }) {
    return this.db.oAuthAuthCode.create({
      data,
    });
  }

  async markAsUsed(id: string) {
    return this.db.oAuthAuthCode.update({
      where: { id },
      data: {
        usedAt: new Date(),
      },
    });
  }
}
