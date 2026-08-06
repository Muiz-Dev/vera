import { db } from "../../../core/database";
import { RequestContext } from "../../../core/http/context/request-context";

export class OAuthRepository {
  private get client() {
    return db.client;
  }

  private get environmentId(): string {
    const envId = RequestContext.environmentId;
    if (!envId) {
      throw new Error("Environment context is missing in RequestContext");
    }
    return envId;
  }

  public async findByProviderId(provider: string, providerUserId: string) {
    return this.client.oAuthAccount.findFirst({
      where: {
        environmentId: this.environmentId,
        provider,
        providerUserId,
      },
    });
  }

  public async findByEmail(email: string) {
    return this.client.oAuthAccount.findFirst({
      where: {
        environmentId: this.environmentId,
        email,
      },
    });
  }

  public async findByIdentityId(identityId: string) {
    return this.client.oAuthAccount.findMany({
      where: {
        environmentId: this.environmentId,
        identityId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  }

  public async findByProviderForIdentity(identityId: string, provider: string) {
    return this.client.oAuthAccount.findFirst({
      where: {
        environmentId: this.environmentId,
        identityId,
        provider,
      },
    });
  }

  public async create(data: {
    identityId: string;
    provider: string;
    providerUserId: string;
    email?: string;
    displayName?: string;
    avatarUrl?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: Date;
  }) {
    return this.client.oAuthAccount.create({
      data: {
        ...data,
        environmentId: this.environmentId,
      },
    });
  }

  public async update(
    id: string,
    data: {
      email?: string;
      displayName?: string;
      avatarUrl?: string;
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: Date | null;
    }
  ) {
    return this.client.oAuthAccount.update({
      where: { id },
      data,
    });
  }

  public async delete(id: string) {
    return this.client.oAuthAccount.delete({
      where: { id },
    });
  }

  public async countForIdentity(identityId: string): Promise<number> {
    return this.client.oAuthAccount.count({
      where: {
        environmentId: this.environmentId,
        identityId,
      },
    });
  }
}
