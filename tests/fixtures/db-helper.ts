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
      // Foreign key cascade deletes are defined on the models, so deleting the parent identities
      // will recursively clean up Profiles, Credentials, Sessions, RefreshTokens, EmailVerifications,
      // PasswordResets, and MfaSecrets.
      await db.client.identity.deleteMany({
        where: {
          id: { in: idsToClean },
        },
      });
      Logger.success("Database cleansed of all matching test records.");
    } else {
      Logger.info("No matching test records found in database to clean.");
    }
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
