import { BaseRepository } from "../../../core/base/base.repository";
import { type PermissionEntity } from "../entities/permission.entity";
import { RequestContext } from "../../../core/http/context/request-context";

export class PermissionRepository extends BaseRepository<PermissionEntity> {
  private get activeEnvironmentId(): string {
    const envId = RequestContext.environmentId;
    if (!envId) {
      throw new Error("Environment context (environmentId) is missing in RequestContext");
    }
    return envId;
  }

  async findById(id: string): Promise<PermissionEntity | null> {
    return this.db.permission.findFirst({
      where: {
        id,
        environmentId: this.activeEnvironmentId,
        deletedAt: null,
      },
    });
  }

  async findByName(name: string): Promise<PermissionEntity | null> {
    return this.db.permission.findFirst({
      where: {
        name,
        environmentId: this.activeEnvironmentId,
        deletedAt: null,
      },
    });
  }

  async findAll(): Promise<PermissionEntity[]> {
    return this.db.permission.findMany({
      where: {
        environmentId: this.activeEnvironmentId,
        deletedAt: null,
      },
    });
  }

  async create(data: { name: string; displayName: string; description?: string | null; isSystem?: boolean }): Promise<PermissionEntity> {
    return this.db.permission.create({
      data: {
        environmentId: this.activeEnvironmentId,
        name: data.name,
        displayName: data.displayName,
        description: data.description ?? null,
        isSystem: data.isSystem ?? false,
      },
    });
  }

  async update(id: string, data: { displayName?: string; description?: string | null; deletedAt?: Date | null }): Promise<PermissionEntity> {
    return this.db.permission.update({
      where: {
        id,
        environmentId: this.activeEnvironmentId,
      },
      data,
    });
  }

  async softDelete(id: string): Promise<PermissionEntity> {
    return this.db.permission.update({
      where: {
        id,
        environmentId: this.activeEnvironmentId,
      },
      data: { deletedAt: new Date() },
    });
  }

  async hardDelete(id: string): Promise<void> {
    await this.db.permission.delete({
      where: {
        id,
        environmentId: this.activeEnvironmentId,
      },
    });
  }
}
export default PermissionRepository;
