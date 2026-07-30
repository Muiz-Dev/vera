import crypto from "crypto";
import { DeveloperRepository } from "../repositories/developer.repository";
import { PasswordService } from "../../authentication/services/password.service";
import { AppError } from "../../../core/errors";
import Logger from "../../../core/logging/logger";
import { Roles } from "../../../core/constants/roles";
import { Permissions } from "../../../core/constants/permissions";
import { db } from "../../../core/database";
import { EventBus } from "../../../core/events/event.bus";
import {
  DeveloperRegisteredEvent,
  ApplicationCreatedEvent,
  ApiKeyRotatedEvent
} from "../events/developer.events";

const passwordService = new PasswordService();

export class DeveloperService {
  constructor(private readonly repository: DeveloperRepository) {}

  // Developer Management
  async registerDeveloper(data: any) {
    const existing = await this.repository.findDeveloperByEmail(data.email);
    if (existing) {
      throw new AppError("A developer with this email already exists", "ERR_VALIDATION_FAILED", 400);
    }

    const hashedPassword = await passwordService.hash(data.password);
    const developer = await this.repository.createDeveloper({
      email: data.email,
      password: hashedPassword,
    });

    Logger.info(`Developer registered successfully: ${developer.id}`);

    await EventBus.publish(new DeveloperRegisteredEvent({
      id: developer.id,
      email: developer.email,
    }));

    return {
      id: developer.id,
      email: developer.email,
    };
  }

  async loginDeveloper(data: any) {
    const developer = await this.repository.findDeveloperByEmail(data.email);
    if (!developer) {
      await passwordService.dummyVerify();
      throw new AppError("Invalid credentials", "ERR_UNAUTHORIZED", 401);
    }

    const isMatch = await passwordService.verify(data.password, developer.password);
    if (!isMatch) {
      throw new AppError("Invalid credentials", "ERR_UNAUTHORIZED", 401);
    }

    Logger.info(`Developer logged in successfully: ${developer.id}`);
    return {
      id: developer.id,
      email: developer.email,
    };
  }

  // Application Management
  async createApplication(developerId: string, data: any) {
    // Generate unique slug if not provided
    let slug = data.slug || this.generateSlug(data.name);
    let isSlugUnique = false;
    let count = 0;

    while (!isSlugUnique) {
      const existing = await this.repository.findApplicationBySlug(slug);
      if (!existing) {
        isSlugUnique = true;
      } else {
        count++;
        slug = `${data.slug || this.generateSlug(data.name)}-${count}`;
      }
    }

    // Prepare transaction to create application, environments, settings, and keys
    const application = await db.client.$transaction(async (tx) => {
      if (data.organizationId) {
        const member = await tx.organizationMember.findUnique({
          where: {
            organizationId_developerId: {
              organizationId: data.organizationId,
              developerId,
            },
          },
        });
        if (!member) {
          throw new AppError("Access denied. You are not a member of this organization.", "ERR_FORBIDDEN", 403);
        }
        if (member.role === "VIEWER") {
          throw new AppError("Access denied. Viewers cannot create applications.", "ERR_FORBIDDEN", 403);
        }
      }

      const appRecord = await tx.application.create({
        data: {
          developerId,
          organizationId: data.organizationId || null,
          name: data.name,
          slug,
          logoPlaceholder: data.logoPlaceholder || null,
          description: data.description || null,
        },
      });

      // Create Environments: DEVELOPMENT, STAGING, PRODUCTION
      const envTypes = [
        { type: "DEVELOPMENT" as const, slug: "development", name: "Development" },
        { type: "STAGING" as const, slug: "staging", name: "Staging" },
        { type: "PRODUCTION" as const, slug: "production", name: "Production" },
      ];

      for (const envInfo of envTypes) {
        const envRecord = await tx.environment.create({
          data: {
            applicationId: appRecord.id,
            name: envInfo.name,
            slug: envInfo.slug,
            type: envInfo.type,
          },
        });

        // Generate API Keys for this Environment
        const publishablePrefix = envInfo.type === "PRODUCTION" ? "pk_live_" : envInfo.type === "STAGING" ? "pk_staging_" : "pk_test_";
        const secretPrefix = envInfo.type === "PRODUCTION" ? "sk_live_" : envInfo.type === "STAGING" ? "sk_staging_" : "sk_test_";

        const pubKeyToken = publishablePrefix + crypto.randomBytes(24).toString("hex");
        const secKeyToken = secretPrefix + crypto.randomBytes(24).toString("hex");

        await tx.apiKey.createMany({
          data: [
            {
              environmentId: envRecord.id,
              token: pubKeyToken,
              type: "PUBLISHABLE",
              prefix: publishablePrefix,
            },
            {
              environmentId: envRecord.id,
              token: secKeyToken,
              type: "SECRET",
              prefix: secretPrefix,
            },
          ],
        });

        // Create default settings
        await tx.applicationSettings.create({
          data: {
            environmentId: envRecord.id,
            jwtAccessTokenLifetime: 900,  // 15 min
            refreshTokenLifetime: 2592000, // 30 days
            sessionTimeout: 86400,        // 24 hours
            passwordPolicyMinLength: 8,
            passwordPolicyRequireUpper: true,
            passwordPolicyRequireLower: true,
            passwordPolicyRequireNumber: true,
            passwordPolicyRequireSymbol: true,
            emailVerificationRequired: true,
            mfaRequired: false,
          },
        });

        // Seed system reserved roles for this environment
        const systemRoles = [
          { name: "Owner", slug: Roles.OWNER, description: "Platform Owner with full control" },
          { name: "Administrator", slug: Roles.ADMINISTRATOR, description: "Platform Administrator with operational management access" },
          { name: "System", slug: Roles.SYSTEM, description: "Internal automated background process role" },
        ];

        const seededRoles: Record<string, any> = {};

        for (const r of systemRoles) {
          const role = await tx.role.create({
            data: {
              environmentId: envRecord.id,
              name: r.name,
              slug: r.slug,
              description: r.description,
              isSystem: true,
            },
          });
          seededRoles[r.slug] = role;
        }

        // Seed default permissions
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
          const perm = await tx.permission.create({
            data: {
              environmentId: envRecord.id,
              name: p.name,
              displayName: p.displayName,
              description: p.description,
              isSystem: true,
            },
          });
          seededPermissions[p.name] = perm;
        }

        // Bind Permissions to Owner and Administrator roles
        const rolesToAssign = [seededRoles[Roles.OWNER], seededRoles[Roles.ADMINISTRATOR]];
        const rolePermissionsData: any[] = [];
        for (const role of rolesToAssign) {
          for (const permName of Object.keys(seededPermissions)) {
            const perm = seededPermissions[permName];
            rolePermissionsData.push({
              roleId: role.id,
              permissionId: perm.id,
            });
          }
        }
        await tx.rolePermission.createMany({
          data: rolePermissionsData,
        });
      }

      return appRecord;
    }, {
      timeout: 30000,
    });

    Logger.info(`Application created and fully bootstrapped: ${application.id}`);
    const fullApp = await this.repository.findApplicationById(application.id);
    if (fullApp) {
      await EventBus.publish(new ApplicationCreatedEvent({
        id: fullApp.id,
        developerId: fullApp.developerId,
        organizationId: fullApp.organizationId,
        name: fullApp.name,
        slug: fullApp.slug,
      }));
    }
    return fullApp;
  }

  async getApplication(developerId: string, id: string) {
    const app = await this.repository.findApplicationById(id);
    if (!app || app.developerId !== developerId) {
      throw new AppError("Application not found", "ERR_NOT_FOUND", 404);
    }
    return app;
  }

  async listApplications(developerId: string) {
    return this.repository.listApplicationsByDeveloper(developerId);
  }

  async updateApplication(developerId: string, id: string, data: any) {
    await this.getApplication(developerId, id); // Ensure exists and belongs to developer
    return this.repository.updateApplication(id, data);
  }

  async deleteApplication(developerId: string, id: string) {
    await this.getApplication(developerId, id); // Ensure exists and belongs to developer
    await this.repository.updateApplication(id, { deletedAt: new Date() });
    Logger.info(`Application soft deleted: ${id}`);
    return { success: true };
  }

  // Environments
  async getEnvironment(developerId: string, id: string) {
    const env = await this.repository.findEnvironmentById(id);
    if (!env) {
      throw new AppError("Environment not found", "ERR_NOT_FOUND", 404);
    }
    // Verify developer ownership
    const app = await this.repository.findApplicationById(env.applicationId);
    if (!app || app.developerId !== developerId) {
      throw new AppError("Environment not found", "ERR_NOT_FOUND", 404);
    }
    return env;
  }

  // API Key Rotation
  async rotateKeys(developerId: string, environmentId: string) {
    const env = await this.getEnvironment(developerId, environmentId);
    const app = await this.repository.findApplicationById(env.applicationId);

    const rotatedKeys = await db.client.$transaction(async (tx) => {
      // Revoke older keys of this environment
      await tx.apiKey.updateMany({
        where: { environmentId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // Generate fresh set
      const publishablePrefix = env.type === "PRODUCTION" ? "pk_live_" : env.type === "STAGING" ? "pk_staging_" : "pk_test_";
      const secretPrefix = env.type === "PRODUCTION" ? "sk_live_" : env.type === "STAGING" ? "sk_staging_" : "sk_test_";

      const pubKeyToken = publishablePrefix + crypto.randomBytes(24).toString("hex");
      const secKeyToken = secretPrefix + crypto.randomBytes(24).toString("hex");

      const newKeys = await tx.apiKey.createMany({
        data: [
          {
            environmentId,
            token: pubKeyToken,
            type: "PUBLISHABLE",
            prefix: publishablePrefix,
          },
          {
            environmentId,
            token: secKeyToken,
            type: "SECRET",
            prefix: secretPrefix,
          },
        ],
      });

      Logger.info(`API keys rotated for environment: ${environmentId}`);
      return tx.apiKey.findMany({ where: { environmentId, revokedAt: null } });
    });

    await EventBus.publish(new ApiKeyRotatedEvent({
      developerId,
      environmentId,
      organizationId: app?.organizationId || null,
    }));

    return rotatedKeys;
  }

  // Allowed Origins CRUD
  async addAllowedOrigin(developerId: string, environmentId: string, origin: string) {
    await this.getEnvironment(developerId, environmentId); // Validate developer ownership
    const existing = await this.repository.findAllowedOrigin(environmentId, origin);
    if (existing) {
      return existing;
    }
    return this.repository.addAllowedOrigin(environmentId, origin);
  }

  async removeAllowedOrigin(developerId: string, environmentId: string, id: string) {
    await this.getEnvironment(developerId, environmentId); // Validate developer ownership
    await this.repository.removeAllowedOrigin(id);
    return { success: true };
  }

  async listAllowedOrigins(developerId: string, environmentId: string) {
    await this.getEnvironment(developerId, environmentId); // Validate developer ownership
    return this.repository.listAllowedOrigins(environmentId);
  }

  // Application Settings
  async getSettings(developerId: string, environmentId: string) {
    const env = await this.getEnvironment(developerId, environmentId);
    return env.settings;
  }

  async updateSettings(developerId: string, environmentId: string, data: any) {
    await this.getEnvironment(developerId, environmentId); // Validate developer ownership
    return this.repository.updateSettings(environmentId, data);
  }

  // Internal Helper
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}
export default DeveloperService;
