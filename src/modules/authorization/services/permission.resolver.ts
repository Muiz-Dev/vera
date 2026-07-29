import { IdentityRoleRepository } from "../repositories/identity-role.repository";
import { RolePermissionRepository } from "../repositories/role-permission.repository";

export class PermissionResolver {
  constructor(
    private readonly identityRoleRepository: IdentityRoleRepository,
    private readonly rolePermissionRepository: RolePermissionRepository
  ) {}

  /**
   * Resolves the deduplicated, effective permission strings and roles for an identity.
   */
  async resolve(identityId: string): Promise<{ roles: string[]; permissions: string[] }> {
    // 1. Fetch active roles for identity
    const identityRoles = await this.identityRoleRepository.findByIdentityId(identityId);
    const roles = identityRoles.map(ir => ir.role.slug);
    const roleIds = identityRoles.map(ir => ir.role.id);

    if (roleIds.length === 0) {
      return { roles, permissions: [] };
    }

    // 2. Fetch role-permissions for those roles
    const rolePermissions = await this.rolePermissionRepository.findByRoleIds(roleIds);
    const permissionNames = rolePermissions.map(rp => rp.permission.name);

    // 3. Deduplicate
    const uniquePermissions = Array.from(new Set(permissionNames));

    return {
      roles,
      permissions: uniquePermissions,
    };
  }
}
