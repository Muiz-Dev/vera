import { BaseRepository } from "../../../core/base/base.repository";
import { type RoleEntity } from "../entities/role.entity";

export class RoleRepository extends BaseRepository<RoleEntity> {
  async findById(id: string): Promise<RoleEntity | null> {
    return this.db.role.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async findBySlug(slug: string): Promise<RoleEntity | null> {
    return this.db.role.findFirst({
      where: { slug, deletedAt: null },
    });
  }

  async findAll(): Promise<RoleEntity[]> {
    return this.db.role.findMany({
      where: { deletedAt: null },
    });
  }

  async create(data: { name: string; slug: string; description?: string | null; isSystem?: boolean }): Promise<RoleEntity> {
    return this.db.role.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        isSystem: data.isSystem ?? false,
      },
    });
  }

  async update(id: string, data: { name?: string; slug?: string; description?: string | null; deletedAt?: Date | null }): Promise<RoleEntity> {
    return this.db.role.update({
      where: { id },
      data,
    });
  }

  async softDelete(id: string): Promise<RoleEntity> {
    return this.db.role.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async hardDelete(id: string): Promise<void> {
    await this.db.role.delete({
      where: { id },
    });
  }
}
