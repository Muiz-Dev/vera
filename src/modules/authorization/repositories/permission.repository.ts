import { BaseRepository } from "../../../core/base/base.repository";
import { type PermissionEntity } from "../entities/permission.entity";

export class PermissionRepository extends BaseRepository<PermissionEntity> {
  async findById(id: string): Promise<PermissionEntity | null> {
    return this.db.permission.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async findByName(name: string): Promise<PermissionEntity | null> {
    return this.db.permission.findFirst({
      where: { name, deletedAt: null },
    });
  }

  async findAll(): Promise<PermissionEntity[]> {
    return this.db.permission.findMany({
      where: { deletedAt: null },
    });
  }

  async create(data: { name: string; displayName: string; description?: string | null; isSystem?: boolean }): Promise<PermissionEntity> {
    return this.db.permission.create({
      data: {
        name: data.name,
        displayName: data.displayName,
        description: data.description ?? null,
        isSystem: data.isSystem ?? false,
      },
    });
  }

  async update(id: string, data: { displayName?: string; description?: string | null; deletedAt?: Date | null }): Promise<PermissionEntity> {
    return this.db.permission.update({
      where: { id },
      data,
    });
  }

  async softDelete(id: string): Promise<PermissionEntity> {
    return this.db.permission.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async hardDelete(id: string): Promise<void> {
    await this.db.permission.delete({
      where: { id },
    });
  }
}
