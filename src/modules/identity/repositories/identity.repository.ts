import { BaseRepository } from "../../../core/base/base.repository";
import { type IdentityEntity } from "../entities/identity.entity";
import { IdentityStatus } from "../../../generated/prisma/client";

export class IdentityRepository extends BaseRepository<IdentityEntity> {
  /**
   * Find a non-deleted Identity by ID, including its profile.
   */
  async findById(id: string): Promise<IdentityEntity | null> {
    const identity = await this.db.identity.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        profile: true,
      },
    });

    if (!identity) return null;

    return {
      ...identity,
      profile: identity.profile ? {
        ...identity.profile,
        metadata: identity.profile.metadata as any,
      } : null,
    };
  }

  /**
   * Find a non-deleted Identity by email.
   */
  async findByEmail(email: string): Promise<IdentityEntity | null> {
    const identity = await this.db.identity.findFirst({
      where: {
        email,
        deletedAt: null,
      },
      include: {
        profile: true,
      },
    });

    if (!identity) return null;

    return {
      ...identity,
      profile: identity.profile ? {
        ...identity.profile,
        metadata: identity.profile.metadata as any,
      } : null,
    };
  }

  /**
   * Find a non-deleted Identity by phone.
   */
  async findByPhone(phone: string): Promise<IdentityEntity | null> {
    const identity = await this.db.identity.findFirst({
      where: {
        phone,
        deletedAt: null,
      },
      include: {
        profile: true,
      },
    });

    if (!identity) return null;

    return {
      ...identity,
      profile: identity.profile ? {
        ...identity.profile,
        metadata: identity.profile.metadata as any,
      } : null,
    };
  }

  /**
   * Creates a new Identity and optional Profile in a transaction.
   */
  async create(data: {
    email?: string;
    phone?: string;
    status?: IdentityStatus;
    profile?: {
      firstName?: string;
      lastName?: string;
      avatar?: string;
      displayName?: string;
      metadata?: any;
    };
  }): Promise<IdentityEntity> {
    const created = await this.db.$transaction(async (tx) => {
      const identity = await tx.identity.create({
        data: {
          email: data.email ?? null,
          phone: data.phone ?? null,
          status: data.status ?? IdentityStatus.PENDING,
        },
      });

      let profile = null;
      if (data.profile) {
        profile = await tx.identityProfile.create({
          data: {
            identityId: identity.id,
            firstName: data.profile.firstName ?? null,
            lastName: data.profile.lastName ?? null,
            avatar: data.profile.avatar ?? null,
            displayName: data.profile.displayName ?? null,
            metadata: data.profile.metadata ?? {},
          },
        });
      }

      return {
        ...identity,
        profile: profile ? {
          ...profile,
          metadata: profile.metadata as any,
        } : null,
      };
    });

    return created;
  }

  /**
   * Updates an existing Identity and/or its Profile in a transaction.
   */
  async update(
    id: string,
    data: {
      email?: string;
      phone?: string;
      status?: IdentityStatus;
      deletedAt?: Date | null;
      profile?: {
        firstName?: string;
        lastName?: string;
        avatar?: string;
        displayName?: string;
        metadata?: any;
      };
    }
  ): Promise<IdentityEntity> {
    const updated = await this.db.$transaction(async (tx) => {
      const updateData: any = {};
      if ("email" in data) updateData.email = data.email ?? null;
      if ("phone" in data) updateData.phone = data.phone ?? null;
      if ("status" in data) updateData.status = data.status;
      if ("deletedAt" in data) updateData.deletedAt = data.deletedAt;

      const identity = await tx.identity.update({
        where: { id },
        data: updateData,
      });

      let profile = null;
      if (data.profile) {
        const updateProfileData: any = {};
        if ("firstName" in data.profile) updateProfileData.firstName = data.profile.firstName ?? null;
        if ("lastName" in data.profile) updateProfileData.lastName = data.profile.lastName ?? null;
        if ("avatar" in data.profile) updateProfileData.avatar = data.profile.avatar ?? null;
        if ("displayName" in data.profile) updateProfileData.displayName = data.profile.displayName ?? null;
        if ("metadata" in data.profile) updateProfileData.metadata = data.profile.metadata;

        profile = await tx.identityProfile.upsert({
          where: { identityId: id },
          update: updateProfileData,
          create: {
            identityId: id,
            firstName: data.profile.firstName ?? null,
            lastName: data.profile.lastName ?? null,
            avatar: data.profile.avatar ?? null,
            displayName: data.profile.displayName ?? null,
            metadata: data.profile.metadata ?? {},
          },
        });
      } else {
        // Fetch existing profile if not updated
        profile = await tx.identityProfile.findUnique({
          where: { identityId: id },
        });
      }

      return {
        ...identity,
        profile: profile ? {
          ...profile,
          metadata: profile.metadata as any,
        } : null,
      };
    });

    return updated;
  }
}
