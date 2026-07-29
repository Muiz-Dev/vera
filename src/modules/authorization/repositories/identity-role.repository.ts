import { BaseRepository } from "../../../core/base/base.repository";

export interface IdentityRoleJoin {
  identityId: string;
  roleId: string;
  createdAt: Date;
  role: {
    id: string;
    name: string;
    slug: string;
    deletedAt: Date | null;
  };
}

export class IdentityRoleRepository extends BaseRepository<any> {
  async assign(identityId: string, roleId: string): Promise<any> {
    return this.db.identityRole.create({
      data: {
        identityId,
        roleId,
      },
    });
  }

  async revoke(identityId: string, roleId: string): Promise<void> {
    await this.db.identityRole.delete({
      where: {
        identityId_roleId: {
          identityId,
          roleId,
        },
      },
    });
  }

  async findByIdentityId(identityId: string): Promise<IdentityRoleJoin[]> {
    return this.db.identityRole.findMany({
      where: {
        identityId,
        role: {
          deletedAt: null,
        },
      },
      include: {
        role: true,
      },
    }) as unknown as IdentityRoleJoin[];
  }

  async exists(identityId: string, roleId: string): Promise<boolean> {
    const count = await this.db.identityRole.count({
      where: { identityId, roleId },
    });
    return count > 0;
  }
}
