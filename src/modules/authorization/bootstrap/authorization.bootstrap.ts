import { AuthorizationService } from "../services/authorization.service";
import { RoleRepository } from "../repositories/role.repository";
import { PermissionRepository } from "../repositories/permission.repository";
import { db, Roles, Permissions } from "../../../core";
import Logger from "../../../core/logging/logger";

export class AuthorizationBootstrap {
  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly roleRepository: RoleRepository,
    private readonly permissionRepository: PermissionRepository
  ) {}

  /**
   * Idempotently seeds system roles, standard permissions, and system assignments.
   */
  async seed(): Promise<void> {
    Logger.info("Starting Authorization Engine system seed...");

    // 1. Seed Roles
    const systemRoles = [
      { name: "Owner", slug: Roles.OWNER, description: "Platform Owner with full control" },
      { name: "Administrator", slug: Roles.ADMINISTRATOR, description: "Platform Administrator with operational management access" },
      { name: "System", slug: Roles.SYSTEM, description: "Internal automated background process role" },
    ];

    const seededRoles: Record<string, any> = {};

    for (const r of systemRoles) {
      let role = await this.roleRepository.findBySlug(r.slug);
      if (!role) {
        role = await this.authorizationService.createRole(
          { name: r.name, slug: r.slug, description: r.description },
          Roles.SYSTEM,
          "bootstrap-correlation",
          true // allowSystem
        );
        Logger.info(`Seeded system role: ${r.name}`);
      } else {
        seededRoles[r.slug] = role;
      }
      seededRoles[r.slug] = role;
    }

    // 2. Seed Permissions
    const systemPermissions = [
      { name: Permissions.AUTHORIZATION_ROLES_CREATE, displayName: "Create Role", description: "Allows creating custom roles" },
      { name: Permissions.AUTHORIZATION_ROLES_READ, displayName: "Read Roles", description: "Allows viewing all roles" },
      { name: Permissions.AUTHORIZATION_ROLES_UPDATE, displayName: "Update Role", description: "Allows updating custom role metadata" },
      { name: Permissions.AUTHORIZATION_ROLES_DELETE, displayName: "Delete Role", description: "Allows deleting custom roles" },
      { name: Permissions.AUTHORIZATION_PERMISSIONS_CREATE, displayName: "Create Permission", description: "Allows creating permissions" },
      { name: Permissions.AUTHORIZATION_PERMISSIONS_READ, displayName: "Read Permissions", description: "Allows viewing permissions" },
      { name: Permissions.AUTHORIZATION_PERMISSIONS_ASSIGN, displayName: "Assign Permission", description: "Allows assigning permissions to custom roles" },
      { name: Permissions.AUTHORIZATION_PERMISSIONS_REVOKE, displayName: "Revoke Permission", description: "Allows revoking permissions from custom roles" },
    ];

    const seededPermissions: Record<string, any> = {};

    for (const p of systemPermissions) {
      let perm = await this.permissionRepository.findByName(p.name);
      if (!perm) {
        perm = await this.authorizationService.createPermission(
          { name: p.name, displayName: p.displayName, description: p.description },
          Roles.SYSTEM,
          "bootstrap-correlation",
          true // allowSystem
        );
        Logger.info(`Seeded system permission: ${p.name}`);
      } else {
        seededPermissions[p.name] = perm;
      }
      seededPermissions[p.name] = perm;
    }

    // 3. Assign All System Permissions to OWNER and ADMINISTRATOR Roles (using raw database mapping bypass for bootstrap)
    const rolesToAssign = [seededRoles[Roles.OWNER], seededRoles[Roles.ADMINISTRATOR]];

    for (const role of rolesToAssign) {
      if (!role) continue;
      for (const permName of Object.keys(seededPermissions)) {
        const perm = seededPermissions[permName];
        if (!perm) continue;

        const exists = await db.client.rolePermission.count({
          where: { roleId: role.id, permissionId: perm.id },
        });

        if (exists === 0) {
          await db.client.rolePermission.create({
            data: {
              roleId: role.id,
              permissionId: perm.id,
            },
          });
          Logger.info(`Bound system permission ${permName} to role ${role.name}`);
        }
      }
    }

    Logger.info("Authorization Engine system seed completed successfully.");
  }
}
