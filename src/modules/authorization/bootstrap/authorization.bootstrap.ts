import { AuthorizationService } from "../services/authorization.service";
import { RoleRepository } from "../repositories/role.repository";
import { PermissionRepository } from "../repositories/permission.repository";
import { db, Roles, Permissions } from "../../../core";
import { RequestContext } from "../../../core/http/context/request-context";
import Logger from "../../../core/logging/logger";

export class AuthorizationBootstrap {
  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly roleRepository: RoleRepository,
    private readonly permissionRepository: PermissionRepository
  ) {}

  /**
   * Idempotently seeds system roles, standard permissions, and system assignments for all environments.
   */
  async seed(): Promise<void> {
    Logger.info("Starting Authorization Engine system seed...");

    // Find all environments in the database
    const environments = await db.client.environment.findMany({ select: { id: true, name: true } });
    if (environments.length === 0) {
      Logger.info("No environments found in database. Skipping Authorization system bootstrap seed.");
      return;
    }

    // Run seeding inside a request context store so that RequestContext has a valid environmentId
    for (const env of environments) {
      Logger.info(`Seeding roles & permissions for environment: ${env.name} (${env.id})`);

      await new Promise<void>((resolve, reject) => {
        RequestContext.run({
          requestId: "bootstrap",
          correlationId: "bootstrap-correlation",
          environmentId: env.id,
        }, async () => {
          try {
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
                Logger.info(`[${env.name}] Seeded system role: ${r.name}`);
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
                Logger.info(`[${env.name}] Seeded system permission: ${p.name}`);
              } else {
                seededPermissions[p.name] = perm;
              }
              seededPermissions[p.name] = perm;
            }

            // 3. Assign All System Permissions to OWNER and ADMINISTRATOR Roles
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
                  Logger.info(`[${env.name}] Bound system permission ${permName} to role ${role.name}`);
                }
              }
            }
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      });
    }

    Logger.info("Authorization Engine system seed completed successfully.");
  }
}
export default AuthorizationBootstrap;
