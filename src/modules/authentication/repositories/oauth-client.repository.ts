import { BaseRepository } from "../../../core/base/base.repository";

export class OAuthClientRepository extends BaseRepository<any> {
  async findByClientId(environmentId: string, clientId: string) {
    return this.db.oAuthClient.findFirst({
      where: {
        environmentId,
        clientId,
      },
    });
  }

  async create(data: {
    environmentId: string;
    clientId: string;
    clientSecretHash: string;
    clientName: string;
    redirectUris: string[];
    allowedScopes: string[];
    allowedGrantTypes: string[];
  }) {
    return this.db.oAuthClient.create({
      data,
    });
  }

  async updateStatus(environmentId: string, clientId: string, status: string) {
    return this.db.oAuthClient.update({
      where: {
        clientId,
      },
      data: {
        status,
      },
    });
  }
}
