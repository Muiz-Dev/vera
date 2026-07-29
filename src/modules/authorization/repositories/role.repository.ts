import { BaseRepository } from "../../../core/base/base.repository";
import { type RoleEntity } from "../entities/role.entity";
import { RequestContext } from "../../../core/http/context/request-context";

export class RoleRepository extends BaseRepository<RoleEntity> {
  private get activeEnvironmentId(): string {
    const envId = RequestContext.environmentId;
    if (!envId) {
      throw new Error("Environment context (environmentId) is missing in RequestContext");
    }
    return envId;
  }

  async findById(id: string): Promise<RoleEntity | null> {
    return this.db.role.findFirst({
      where: {
        id,
        environmentId: this.activeEnvironmentId,
        deletedAt: null,
      },
    });
  }

  async findBySlug(slug: string): Promise<RoleEntity | null> {
    return this.db.role.findFirst({
      where: {
        slug,
        environmentId: this.activeEnvironmentId,
        deletedAt: null,
      },
    });
  }

  async findAll(): Promise<RoleEntity[]> {
    return this.db.role.findMany({
      where: {
        environmentId: this.activeEnvironmentId,
        deletedAt: null,
      },
    });
  }

  async create(data: { name: string; slug: string; description?: string | null; isSystem?: boolean }): Promise<RoleEntity> {
    return this.db.role.create({
      data: {
        environmentId: this.activeEnvironmentId,
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        isSystem: data.isSystem ?? false,
      },
    });
  }

  async update(id: string, data: { name?: string; slug?: string; description?: string | null; deletedAt?: Date | null }): Promise<RoleEntity> {
    return this.db.role.update({
      where: {
        id,
        environmentId: this.activeEnvironmentId,
      },
      data,
    });
  }

  async softDelete(id: string): Promise<RoleEntity> {
    return this.db.role.update({
      where: {
        id,
        environmentId: this.activeEnvironmentId,
      },
      data: { deletedAt: new Date() },
    });
  }

  async hardDelete(id: string): Promise<void> {
    await this.db.role.delete({
      where: {
        id,
        environmentId: this.activeEnvironmentId,
      },
    });
  }
}
export default RoleRepository;
