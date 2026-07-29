import { BaseRepository } from "../../../core/base/base.repository";

export interface RolePermissionJoin {
  roleId: string;
  permissionId: string;
  createdAt: Date;
  permission: {
    name: string;
    displayName: string;
    deletedAt: Date | null;
  };
}

export class RolePermissionRepository extends BaseRepository<any> {
  async assign(roleId: string, permissionId: string): Promise<any> {
    return this.db.rolePermission.create({
      data: {
        roleId,
        permissionId,
      },
    });
  }

  async revoke(roleId: string, permissionId: string): Promise<void> {
    await this.db.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId,
          permissionId,
        },
      },
    });
  }

  async findByRoleId(roleId: string): Promise<RolePermissionJoin[]> {
    return this.db.rolePermission.findMany({
      where: {
        roleId,
        permission: {
          deletedAt: null,
        },
      },
      include: {
        permission: true,
      },
    }) as unknown as RolePermissionJoin[];
  }

  async findByRoleIds(roleIds: string[]): Promise<RolePermissionJoin[]> {
    if (roleIds.length === 0) return [];
    return this.db.rolePermission.findMany({
      where: {
        roleId: { in: roleIds },
        permission: {
          deletedAt: null,
        },
        role: {
          deletedAt: null,
        },
      },
      include: {
        permission: true,
      },
    }) as unknown as RolePermissionJoin[];
  }

  async exists(roleId: string, permissionId: string): Promise<boolean> {
    const count = await this.db.rolePermission.count({
      where: { roleId, permissionId },
    });
    return count > 0;
  }
}
