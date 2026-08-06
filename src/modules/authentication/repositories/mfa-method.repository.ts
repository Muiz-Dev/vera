import { db } from "../../../core/database";
import { RequestContext } from "../../../core/http/context/request-context";
import { MfaMethodType } from "../../../generated/prisma/client";

export class MfaMethodRepository {
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

  public async findActiveMethod(identityId: string, type: MfaMethodType) {
    return this.client.mfaMethod.findFirst({
      where: {
        environmentId: this.environmentId,
        identityId,
        type,
      },
    });
  }

  public async findActiveTotpMethod(identityId: string) {
    return this.client.mfaMethod.findFirst({
      where: {
        environmentId: this.environmentId,
        identityId,
        type: MfaMethodType.TOTP,
      },
    });
  }

  public async listActiveMethods(identityId: string) {
    return this.client.mfaMethod.findMany({
      where: {
        environmentId: this.environmentId,
        identityId,
      },
    });
  }

  public async upsertMethod(data: {
    identityId: string;
    type: MfaMethodType;
    secret: string;
    enabled?: boolean;
    disabledAt?: Date | null;
    disabledBy?: string | null;
    disableReason?: string | null;
    lastUsedAt?: Date | null;
    lastVerifiedCounter?: number;
    createdIp?: string | null;
    deviceName?: string | null;
  }) {
    const envId = this.environmentId;
    const existing = await this.client.mfaMethod.findUnique({
      where: {
        identityId_type: {
          identityId: data.identityId,
          type: data.type,
        },
      },
    });

    if (existing) {
      return this.client.mfaMethod.update({
        where: { id: existing.id },
        data,
      });
    }

    return this.client.mfaMethod.create({
      data: {
        ...data,
        environmentId: envId,
      },
    });
  }

  public async updateMethod(
    id: string,
    data: {
      enabled?: boolean;
      disabledAt?: Date | null;
      disabledBy?: string | null;
      disableReason?: string | null;
      lastUsedAt?: Date | null;
      lastVerifiedCounter?: number;
      lastUsedIp?: string | null;
      deviceName?: string | null;
    }
  ) {
    return this.client.mfaMethod.update({
      where: { id },
      data,
    });
  }

  public async deleteBackupCodes(identityId: string) {
    return this.client.mfaBackupCode.deleteMany({
      where: {
        environmentId: this.environmentId,
        identityId,
      },
    });
  }

  public async createBackupCode(identityId: string, codeHash: string) {
    return this.client.mfaBackupCode.create({
      data: {
        environmentId: this.environmentId,
        identityId,
        codeHash,
      },
    });
  }

  public async listBackupCodes(identityId: string) {
    return this.client.mfaBackupCode.findMany({
      where: {
        environmentId: this.environmentId,
        identityId,
      },
    });
  }

  public async markBackupCodeAsUsed(id: string) {
    return this.client.mfaBackupCode.update({
      where: { id },
      data: {
        usedAt: new Date(),
      },
    });
  }

  public async countUnusedBackupCodes(identityId: string): Promise<number> {
    return this.client.mfaBackupCode.count({
      where: {
        environmentId: this.environmentId,
        identityId,
        usedAt: null,
      },
    });
  }

  public async createChallenge(identityId: string, expiresAt: Date, ip?: string, userAgent?: string) {
    return this.client.mfaChallenge.create({
      data: {
        environmentId: this.environmentId,
        identityId,
        expiresAt,
        ip,
        userAgent,
      },
    });
  }

  public async findChallenge(id: string) {
    return this.client.mfaChallenge.findFirst({
      where: {
        environmentId: this.environmentId,
        id,
      },
    });
  }

  public async completeChallenge(id: string, method: MfaMethodType) {
    return this.client.mfaChallenge.update({
      where: { id },
      data: {
        completedAt: new Date(),
        method,
      },
    });
  }

  public async markChallengeAsUsed(id: string) {
    return this.client.mfaChallenge.update({
      where: { id },
      data: {
        usedAt: new Date(),
      },
    });
  }

  public async findActiveTrustedDevice(identityId: string, deviceFingerprint: string) {
    return this.client.trustedDevice.findFirst({
      where: {
        environmentId: this.environmentId,
        identityId,
        deviceFingerprint,
        expiresAt: { gt: new Date() },
        revokedAt: null,
      },
    });
  }

  public async listTrustedDevices(identityId: string) {
    return this.client.trustedDevice.findMany({
      where: {
        environmentId: this.environmentId,
        identityId,
        revokedAt: null,
      },
    });
  }

  public async upsertTrustedDevice(identityId: string, deviceFingerprint: string, expiresAt: Date) {
    const envId = this.environmentId;
    const existing = await this.client.trustedDevice.findUnique({
      where: {
        identityId_deviceFingerprint: {
          identityId,
          deviceFingerprint,
        },
      },
    });

    if (existing) {
      return this.client.trustedDevice.update({
        where: { id: existing.id },
        data: {
          expiresAt,
          lastUsedAt: new Date(),
          revokedAt: null,
        },
      });
    }

    return this.client.trustedDevice.create({
      data: {
        environmentId: envId,
        identityId,
        deviceFingerprint,
        expiresAt,
      },
    });
  }

  public async revokeTrustedDevice(id: string) {
    return this.client.trustedDevice.update({
      where: { id },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  public async revokeAllTrustedDevices(identityId: string) {
    return this.client.trustedDevice.updateMany({
      where: {
        environmentId: this.environmentId,
        identityId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  public async deleteMfaChallenges(identityId: string) {
    return this.client.mfaChallenge.deleteMany({
      where: {
        environmentId: this.environmentId,
        identityId,
      },
    });
  }
}
