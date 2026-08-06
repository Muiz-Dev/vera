import { db } from "../../src/core";
import { Logger } from "../runner/logger";

export const DbHelper = {
  /**
   * Cleans deterministic integration test data using email and phone prefix tags.
   */
  async cleanTestData(): Promise<void> {
    Logger.info("🧹 Programmatically cleansing test integration database records...");

    // We target any test emails or phones matching 'test-integration-*' or clean test patterns
    const deletedIdentities = await db.client.identity.findMany({
      where: {
        OR: [
          { email: { startsWith: "test-integration-" } },
          { email: { startsWith: "auth-test-" } },
          { email: { startsWith: "test-" } },
          { email: { startsWith: "clean-" } },
          { email: { startsWith: "clean2-" } },
          { phone: { startsWith: "+199" } }, // designated test phones
        ],
      },
      select: { id: true },
    });

    const idsToClean = deletedIdentities.map(id => id.id);

    if (idsToClean.length > 0) {
      Logger.info(`Found ${idsToClean.length} test identities to cleanse.`);
      await db.client.identity.deleteMany({
        where: {
          id: { in: idsToClean },
        },
      });
    }

    // Clean up OAuth accounts
    if ((db.client as any).oAuthAccount) {
      await (db.client as any).oAuthAccount.deleteMany();
    }

    // Clean up MFA tables
    if ((db.client as any).mfaMethod) {
      await (db.client as any).mfaMethod.deleteMany();
    }
    if ((db.client as any).mfaBackupCode) {
      await (db.client as any).mfaBackupCode.deleteMany();
    }
    if ((db.client as any).mfaChallenge) {
      await (db.client as any).mfaChallenge.deleteMany();
    }
    if ((db.client as any).trustedDevice) {
      await (db.client as any).trustedDevice.deleteMany();
    }

    // Clean up organization engine tables
    if (db.client.organizationInvitation) {
      await db.client.organizationInvitation.deleteMany();
    }
    if (db.client.organizationActivity) {
      await db.client.organizationActivity.deleteMany();
    }
    if (db.client.organizationMember) {
      await db.client.organizationMember.deleteMany();
    }
    if (db.client.organization) {
      await db.client.organization.deleteMany();
    }

    // Clean up test developers (which cascades to applications, environments, and everything)
    const deletedDevelopers = await db.client.developer.deleteMany({
      where: {
        OR: [
          { email: { startsWith: "test-dev-" } },
        ],
      },
    });

    // Clean up test roles, permissions, policies
    const deletedRoles = await db.client.role.deleteMany({
      where: {
        OR: [
          { slug: { startsWith: "test" } },
        ],
      },
    });

    const deletedPermissions = await db.client.permission.deleteMany({
      where: {
        OR: [
          { name: { startsWith: "test" } },
        ],
      },
    });

    const deletedPolicies = await db.client.policy.deleteMany({
      where: {
        OR: [
          { name: { startsWith: "test" } },
        ],
      },
    });

    if (idsToClean.length > 0 || deletedDevelopers.count > 0 || deletedRoles.count > 0 || deletedPermissions.count > 0 || deletedPolicies.count > 0) {
      Logger.success(`Database cleansed: ${idsToClean.length} identities, ${deletedDevelopers.count} developers, ${deletedRoles.count} roles, ${deletedPermissions.count} permissions, ${deletedPolicies.count} policies deleted.`);
    } else {
      Logger.info("No matching test records found in database to clean.");
    }
  },

  /**
   * Spawns a dedicated Developer, Application, and Environment context for testing.
   */
  async setupTestTenant(): Promise<{
    developerId: string;
    applicationId: string;
    environmentId: string;
    publishableKey: string;
    secretKey: string;
  }> {
    // 1. Create developer
    const devEmail = `test-dev-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
    const developer = await db.client.developer.create({
      data: {
        email: devEmail,
        password: "hashedpasswordplaceholder",
      },
    });

    // 2. Create application utilizing DeveloperService to get standard bootstrapping
    const appName = `Test Application ${Date.now()}`;
    const appSlug = `test-app-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const { DeveloperService } = await import("../../src/modules/developer/services/developer.service");
    const { DeveloperRepository } = await import("../../src/modules/developer/repositories/developer.repository");
    const devService = new DeveloperService(new DeveloperRepository());

    const app = await devService.createApplication(developer.id, {
      name: appName,
      slug: appSlug,
    });

    if (!app) {
      throw new Error("Failed to create and bootstrap application for test tenant");
    }

    const devEnv = app.environments.find((e: any) => e.type === "DEVELOPMENT")!;
    const pubKey = devEnv.apiKeys.find((k: any) => k.type === "PUBLISHABLE")?.token || "";
    const secKey = devEnv.apiKeys.find((k: any) => k.type === "SECRET")?.token || "";

    return {
      developerId: developer.id,
      applicationId: app.id,
      environmentId: devEnv.id,
      publishableKey: pubKey,
      secretKey: secKey,
    };
  },

  /**
   * Direct database verifications.
   */
  async verifyIdentityExists(id: string): Promise<any> {
    const record = await db.client.identity.findUnique({
      where: { id },
      include: { profile: true },
    });
    if (!record) {
      throw new Error(`DB Verification Error: Identity with ID ${id} not found in DB`);
    }
    return record;
  },

  async verifyCredentialExists(identityId: string): Promise<any> {
    const record = await db.client.credential.findUnique({
      where: { identityId },
    });
    if (!record) {
      throw new Error(`DB Verification Error: Credential for Identity ID ${identityId} not found in DB`);
    }
    return record;
  },

  async verifySessionExistsForIdentity(identityId: string): Promise<any> {
    const record = await db.client.session.findFirst({
      where: { identityId },
      orderBy: { createdAt: "desc" },
    });
    if (!record) {
      throw new Error(`DB Verification Error: Session for Identity ID ${identityId} not found in DB`);
    }
    return record;
  },

  async verifyRefreshTokenStored(sessionId: string): Promise<any> {
    const record = await db.client.refreshToken.findFirst({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
    });
    if (!record) {
      throw new Error(`DB Verification Error: Refresh Token for Session ID ${sessionId} not found in DB`);
    }
    return record;
  },

  async verifyPasswordResetTokenStored(identityId: string): Promise<any> {
    const record = await db.client.passwordReset.findFirst({
      where: { identityId },
      orderBy: { createdAt: "desc" },
    });
    if (!record) {
      throw new Error(`DB Verification Error: Password Reset Token for Identity ID ${identityId} not found in DB`);
    }
    return record;
  },

  async verifyEmailVerificationTokenStored(identityId: string): Promise<any> {
    const record = await db.client.emailVerification.findFirst({
      where: { identityId },
      orderBy: { createdAt: "desc" },
    });
    if (!record) {
      throw new Error(`DB Verification Error: Email Verification Token for Identity ID ${identityId} not found in DB`);
    }
    return record;
  },

  async verifyMfaSecretStored(identityId: string): Promise<any> {
    const record = await db.client.mfaSecret.findUnique({
      where: { identityId },
    });
    if (!record) {
      throw new Error(`DB Verification Error: MFA Secret for Identity ID ${identityId} not found in DB`);
    }
    return record;
  },
};
