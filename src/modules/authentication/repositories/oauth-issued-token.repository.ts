import { BaseRepository } from "../../../core/base/base.repository";

export class OAuthIssuedTokenRepository extends BaseRepository<any> {
  async create(data: {
    environmentId: string;
    clientId: string;
    identityId?: string | null;
    accessTokenHash: string;
    refreshTokenHash?: string | null;
    expiresAt: Date;
  }) {
    return this.db.oAuthIssuedToken.create({
      data,
    });
  }

  async findByAccessTokenHash(environmentId: string, accessTokenHash: string) {
    return this.db.oAuthIssuedToken.findFirst({
      where: {
        environmentId,
        accessTokenHash,
        revokedAt: null,
      },
      include: {
        client: true,
        identity: true,
      },
    });
  }

  async findByRefreshTokenHash(environmentId: string, refreshTokenHash: string) {
    return this.db.oAuthIssuedToken.findFirst({
      where: {
        environmentId,
        refreshTokenHash,
      },
      include: {
        client: true,
        identity: true,
      },
    });
  }

  async revokeToken(id: string) {
    return this.db.oAuthIssuedToken.update({
      where: { id },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async revokeAllForSession(environmentId: string, clientId: string, identityId: string) {
    return this.db.oAuthIssuedToken.updateMany({
      where: {
        environmentId,
        clientId,
        identityId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}
