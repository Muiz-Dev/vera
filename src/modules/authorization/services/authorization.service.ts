import { randomUUID } from "crypto";
import { AppError } from "../../../core/errors";
import { EventBus } from "../../../core/events/event.bus";
import type { ICacheService } from "../../../core/cache";
import { RoleRepository } from "../repositories/role.repository";
import { PermissionRepository } from "../repositories/permission.repository";
import { RolePermissionRepository } from "../repositories/role-permission.repository";
import { IdentityRoleRepository } from "../repositories/identity-role.repository";
import { PermissionResolver } from "./permission.resolver";
import { PermissionEvaluator } from "./permission.evaluator";
import { type RoleEntity } from "../entities/role.entity";
import { type PermissionEntity } from "../entities/permission.entity";

export class AuthorizationService {
  private readonly permissionResolver: PermissionResolver;
  private readonly permissionEvaluator: PermissionEvaluator;

  constructor(
    private readonly roleRepository: RoleRepository,
    private readonly permissionRepository: PermissionRepository,
    private readonly rolePermissionRepository: RolePermissionRepository,
    private readonly identityRoleRepository: IdentityRoleRepository,
    private readonly cacheService: ICacheService
  ) {
    this.permissionResolver = new PermissionResolver(
      this.identityRoleRepository,
      this.rolePermissionRepository
    );
    this.permissionEvaluator = new PermissionEvaluator(this.permissionResolver);
  }

  /**
   * Helper to publish standard structured events with rich metadata.
   */
  private async publishEvent(
    eventName: string,
    payload: Record<string, any>,
    actorId?: string,
    correlationId?: string
  ): Promise<void> {
    await EventBus.publish({
      eventName,
      timestamp: new Date(),
      payload: {
        eventId: randomUUID(),
        occurredAt: new Date().toISOString(),
        actorId: actorId ?? "system",
        correlationId: correlationId ?? randomUUID(),
        ...payload,
      },
    });
  }

  /**
   * Generates a cache key for an identity's permissions.
   */
  private getCacheKey(identityId: string): string {
    return `authz:identity:${identityId}`;
  }

  /**
   * Invalidates cached permissions for a given identity.
   */
  private async invalidateCache(identityId: string): Promise<void> {
    await this.cacheService.delete(this.getCacheKey(identityId));
  }

  /**
   * Invalidates all authorization caches (e.g. when role permissions change).
   */
  private async invalidateAllCaches(): Promise<void> {
    await this.cacheService.clear();
  }

  // --- ROLE MANAGEMENT ---

  async createRole(
    data: { name: string; slug: string; description?: string | null },
    actorId?: string,
    correlationId?: string,
    allowSystem = false
  ): Promise<RoleEntity> {
    // Standardize slug
    const slug = data.slug.trim().toLowerCase();

    // Check duplicate slug
    const existing = await this.roleRepository.findBySlug(slug);
    if (existing) {
      throw new AppError(`Role with slug '${slug}' already exists`, "ERR_VALIDATION_FAILED", 400);
    }

    const role = await this.roleRepository.create({
      name: data.name.trim(),
      slug,
      description: data.description ?? null,
      isSystem: allowSystem,
    });

    await this.publishEvent(
      "RoleCreated",
      { roleId: role.id, roleName: role.name, roleSlug: role.slug },
      actorId,
      correlationId
    );

    return role;
  }

  async updateRole(
    id: string,
    data: { name?: string; slug?: string; description?: string | null },
    actorId?: string,
    correlationId?: string
  ): Promise<RoleEntity> {
    const role = await this.roleRepository.findById(id);
    if (!role) {
      throw new AppError("Role not found", "ERR_NOT_FOUND", 404);
    }

    if (role.isSystem) {
      throw new AppError("System reserved roles cannot be updated", "ERR_VALIDATION_FAILED", 400);
    }

    const updateData: any = {};
    if (data.name) updateData.name = data.name.trim();
    if (data.description !== undefined) updateData.description = data.description;
    if (data.slug) {
      const slug = data.slug.trim().toLowerCase();
      const existing = await this.roleRepository.findBySlug(slug);
      if (existing && existing.id !== id) {
        throw new AppError(`Role with slug '${slug}' already exists`, "ERR_VALIDATION_FAILED", 400);
      }
      updateData.slug = slug;
    }

    const updated = await this.roleRepository.update(id, updateData);

    await this.invalidateAllCaches();

    await this.publishEvent(
      "RoleUpdated",
      { roleId: updated.id, roleName: updated.name, roleSlug: updated.slug },
      actorId,
      correlationId
    );

    return updated;
  }

  async deleteRole(id: string, actorId?: string, correlationId?: string): Promise<RoleEntity> {
    const role = await this.roleRepository.findById(id);
    if (!role) {
      throw new AppError("Role not found", "ERR_NOT_FOUND", 404);
    }

    if (role.isSystem) {
      throw new AppError("System reserved roles cannot be deleted", "ERR_VALIDATION_FAILED", 400);
    }

    const deleted = await this.roleRepository.softDelete(id);

    await this.invalidateAllCaches();

    await this.publishEvent(
      "RoleDeleted",
      { roleId: deleted.id, roleName: deleted.name, roleSlug: deleted.slug },
      actorId,
      correlationId
    );

    return deleted;
  }

  // --- PERMISSION MANAGEMENT ---

  async createPermission(
    data: { name: string; displayName: string; description?: string | null },
    actorId?: string,
    correlationId?: string,
    allowSystem = false
  ): Promise<PermissionEntity> {
    const name = data.name.trim().toLowerCase();

    // Validate permission naming convention: domain.resource.action
    const pattern = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/;
    if (!pattern.test(name)) {
      throw new AppError(
        "Permission name must strictly follow the 'domain.resource.action' convention (e.g., authorization.roles.create)",
        "ERR_VALIDATION_FAILED",
        400
      );
    }

    // Check duplicate name
    const existing = await this.permissionRepository.findByName(name);
    if (existing) {
      throw new AppError(`Permission with name '${name}' already exists`, "ERR_VALIDATION_FAILED", 400);
    }

    const permission = await this.permissionRepository.create({
      name,
      displayName: data.displayName.trim(),
      description: data.description ?? null,
      isSystem: allowSystem,
    });

    await this.publishEvent(
      "PermissionCreated",
      { permissionId: permission.id, permissionName: permission.name },
      actorId,
      correlationId
    );

    return permission;
  }

  // --- ASSIGNMENTS ---

  async assignPermission(
    roleId: string,
    permissionId: string,
    actorId?: string,
    correlationId?: string
  ): Promise<any> {
    const role = await this.roleRepository.findById(roleId);
    if (!role) {
      throw new AppError("Role not found", "ERR_NOT_FOUND", 404);
    }

    const permission = await this.permissionRepository.findById(permissionId);
    if (!permission) {
      throw new AppError("Permission not found", "ERR_NOT_FOUND", 404);
    }

    if (role.isSystem) {
      throw new AppError("Permissions cannot be assigned to system reserved roles through the API", "ERR_VALIDATION_FAILED", 400);
    }

    const exists = await this.rolePermissionRepository.exists(roleId, permissionId);
    if (exists) {
      throw new AppError("Permission is already assigned to this role", "ERR_VALIDATION_FAILED", 400);
    }

    const assignment = await this.rolePermissionRepository.assign(roleId, permissionId);

    await this.invalidateAllCaches();

    await this.publishEvent(
      "PermissionAssigned",
      { roleId, permissionId },
      actorId,
      correlationId
    );

    return assignment;
  }

  async revokePermission(
    roleId: string,
    permissionId: string,
    actorId?: string,
    correlationId?: string
  ): Promise<void> {
    const role = await this.roleRepository.findById(roleId);
    if (!role) {
      throw new AppError("Role not found", "ERR_NOT_FOUND", 404);
    }

    if (role.isSystem) {
      throw new AppError("Permissions cannot be revoked from system reserved roles through the API", "ERR_VALIDATION_FAILED", 400);
    }

    const exists = await this.rolePermissionRepository.exists(roleId, permissionId);
    if (!exists) {
      throw new AppError("Permission assignment not found", "ERR_NOT_FOUND", 404);
    }

    await this.rolePermissionRepository.revoke(roleId, permissionId);

    await this.invalidateAllCaches();

    await this.publishEvent(
      "PermissionRevoked",
      { roleId, permissionId },
      actorId,
      correlationId
    );
  }

  async assignRole(
    identityId: string,
    roleId: string,
    actorId?: string,
    correlationId?: string
  ): Promise<any> {
    const role = await this.roleRepository.findById(roleId);
    if (!role) {
      throw new AppError("Role not found", "ERR_NOT_FOUND", 404);
    }

    const exists = await this.identityRoleRepository.exists(identityId, roleId);
    if (exists) {
      throw new AppError("Role is already assigned to this identity", "ERR_VALIDATION_FAILED", 400);
    }

    const assignment = await this.identityRoleRepository.assign(identityId, roleId);

    await this.invalidateCache(identityId);

    await this.publishEvent(
      "RoleAssigned",
      { identityId, roleId, roleSlug: role.slug },
      actorId,
      correlationId
    );

    return assignment;
  }

  async removeRole(
    identityId: string,
    roleId: string,
    actorId?: string,
    correlationId?: string
  ): Promise<void> {
    const role = await this.roleRepository.findById(roleId);
    if (!role) {
      throw new AppError("Role not found", "ERR_NOT_FOUND", 404);
    }

    const exists = await this.identityRoleRepository.exists(identityId, roleId);
    if (!exists) {
      throw new AppError("Role assignment not found", "ERR_NOT_FOUND", 404);
    }

    await this.identityRoleRepository.revoke(identityId, roleId);

    await this.invalidateCache(identityId);

    await this.publishEvent(
      "RoleRemoved",
      { identityId, roleId, roleSlug: role.slug },
      actorId,
      correlationId
    );
  }

  // --- RESOLUTION & EVALUATION ---

  /**
   * Resolves the effective, unique role slugs and permissions for an identity (with caching support).
   */
  async getEffectivePermissions(identityId: string): Promise<{ roles: string[]; permissions: string[] }> {
    const cacheKey = this.getCacheKey(identityId);

    // Check cache
    const cached = await this.cacheService.get<{ roles: string[]; permissions: string[] }>(cacheKey);
    if (cached) {
      return cached;
    }

    // Resolve
    const resolved = await this.permissionResolver.resolve(identityId);

    // Save to cache (cache for 5 minutes)
    await this.cacheService.set(cacheKey, resolved, 300);

    return resolved;
  }

  async hasPermission(
    identityId: string,
    permissionName: string,
    actorId?: string,
    correlationId?: string
  ): Promise<boolean> {
    // 1. Get resolved cached permissions
    const { permissions } = await this.getEffectivePermissions(identityId);

    const decision = permissions.includes(permissionName) ? "GRANT" : "DENY";

    // 2. Publish event
    await this.publishEvent(
      "AuthorizationEvaluated",
      { identityId, permission: permissionName, decision },
      actorId ?? identityId,
      correlationId
    );

    return decision === "GRANT";
  }

  async hasRole(identityId: string, roleSlug: string): Promise<boolean> {
    const { roles } = await this.getEffectivePermissions(identityId);
    return roles.includes(roleSlug.toLowerCase());
  }

  async evaluate(
    identityId: string,
    permissionName: string,
    actorId?: string,
    correlationId?: string
  ): Promise<boolean> {
    return this.hasPermission(identityId, permissionName, actorId, correlationId);
  }
}
