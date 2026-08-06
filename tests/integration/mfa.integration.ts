import http from "http";
import app, { ModuleRegistry } from "../../src/app";
import { db } from "../../src/core";
import { TestRunner } from "../runner/test-runner";
import { request } from "../runner/http";
import { assert } from "../runner/assertion";
import { DbHelper } from "../fixtures/db-helper";
import { EventBus } from "../../src/core/events/event.bus";
import { TotpMfaStrategy } from "../../src/modules/authentication/services/strategies/totp.strategy";

const runner = new TestRunner("Enterprise MFA Module Integration Suite");
let server: http.Server;
let port: number;
let tenant: { environmentId: string };

const eventsLogged: { eventName: string; payload: any }[] = [];

function setupEventTracking() {
  eventsLogged.length = 0;
  const events = [
    "MfaSetupInitiated",
    "MfaEnabled",
    "MfaDisabled",
    "MfaVerificationSucceeded",
    "MfaVerificationFailed",
    "BackupCodesGenerated",
    "BackupCodeUsed",
    "BackupCodesExhausted",
    "TrustedDeviceAdded",
    "TrustedDeviceRevoked",
  ];

  for (const name of events) {
    EventBus.subscribe(name, (event) => {
      eventsLogged.push({ eventName: name, payload: event.payload });
    });
  }
}

// Local helper to automatically inject tenant context
async function tenantRequest(method: string, path: string, body?: any, headers: Record<string, string> = {}) {
  return request(port, method, path, body, {
    "x-environment-id": tenant.environmentId,
    ...headers,
  });
}

const testEmail = "mfa-integration-user@example.com";
const testPassword = "Password123!";
let identityId: string;
let accessToken: string;
let base32Secret: string;
let provisioningUri: string;
let plaintextBackupCodes: string[] = [];
let activeChallengeId: string;

// Helper to compute active TOTP code for a secret in real-time inside tests
function getValidTotpCode(secret: string, offsetSteps = 0): string {
  const totp = new TotpMfaStrategy();
  const decoded = (totp as any).base32Decode(secret);
  const currentStep = Math.floor(Date.now() / 1000 / 30) + offsetSteps;
  return (totp as any).computeHotp(decoded, currentStep);
}

runner
  .beforeAll(async () => {
    await db.connect();
    await ModuleRegistry.initialize();

    // Clean test database records
    await DbHelper.cleanTestData();

    // Spawn test tenant (Developer, Application, Environment)
    tenant = await DbHelper.setupTestTenant();

    // Setup event logging
    EventBus.clearAll();
    setupEventTracking();

    server = http.createServer(app);
    port = await new Promise<number>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          resolve(addr.port);
        } else {
          resolve(3007);
        }
      });
    });

    // Create and login native test user
    const regRes = await tenantRequest("POST", "/api/v1/auth/register", {
      email: testEmail,
      password: testPassword,
    });
    identityId = regRes.body.data.id;

    // Email verify
    const verif = await db.client.emailVerification.findFirst({ where: { identityId } });
    await tenantRequest("POST", "/api/v1/auth/verify-email", { token: verif!.token });

    const loginRes = await tenantRequest("POST", "/api/v1/auth/login", {
      email: testEmail,
      password: testPassword,
    });
    accessToken = loginRes.body.data.accessToken;
  })
  .afterAll(async () => {
    await DbHelper.cleanTestData();
    server.close();
    await db.disconnect();
  })
  .test("POST /api/v1/auth/mfa/setup initiates TOTP secret and provisioning URI successfully", async () => {
    const res = await tenantRequest("POST", "/api/v1/auth/mfa/setup", { type: "TOTP" }, {
      Authorization: `Bearer ${accessToken}`,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.secret);
    assert.ok(res.body.data.provisioningUri);
    assert.ok(res.body.data.provisioningUri.includes("otpauth://totp/Vera:"));

    base32Secret = res.body.data.secret;
    provisioningUri = res.body.data.provisioningUri;

    // Verify setup events
    const event = eventsLogged.find(e => e.eventName === "MfaSetupInitiated" && e.payload.identityId === identityId);
    assert.ok(event);
  })
  .test("POST /api/v1/auth/mfa/enable verifies code and activates MFA, generating 10 recovery codes", async () => {
    const validCode = getValidTotpCode(base32Secret);

    const res = await tenantRequest("POST", "/api/v1/auth/mfa/enable", {
      type: "TOTP",
      code: validCode,
      deviceName: "Test Developer Machine",
    }, {
      Authorization: `Bearer ${accessToken}`,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.backupCodes);
    assert.equal(res.body.data.backupCodes.length, 10);

    plaintextBackupCodes = res.body.data.backupCodes;

    // Verify database record has enabled = true
    const method = await db.client.mfaMethod.findUnique({
      where: { identityId_type: { identityId, type: "TOTP" } },
    });
    assert.ok(method);
    assert.equal(method!.enabled, true);
    assert.equal(method!.deviceName, "Test Developer Machine");

    // Verify backup codes stored in DB
    const count = await db.client.mfaBackupCode.count({ where: { identityId } });
    assert.equal(count, 10);

    // Verify enable and backup codes generated events
    assert.ok(eventsLogged.find(e => e.eventName === "MfaEnabled" && e.payload.identityId === identityId));
    assert.ok(eventsLogged.find(e => e.eventName === "BackupCodesGenerated" && e.payload.identityId === identityId));
  })
  .test("POST /api/v1/auth/login detects enabled MFA and returns an active challenge instead of tokens", async () => {
    const res = await tenantRequest("POST", "/api/v1/auth/login", {
      email: testEmail,
      password: testPassword,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.mfaRequired, true);
    assert.ok(res.body.data.challengeId);

    activeChallengeId = res.body.data.challengeId;

    // Verify challenge record exists in database
    const dbChallenge = await db.client.mfaChallenge.findUnique({ where: { id: activeChallengeId } });
    assert.ok(dbChallenge);
    assert.ok(dbChallenge!.expiresAt > new Date());
  })
  .test("POST /api/v1/auth/mfa/verify rejects invalid and expired TOTP codes", async () => {
    const res = await tenantRequest("POST", "/api/v1/auth/mfa/verify", {
      challengeId: activeChallengeId,
      code: "111111", // invalid
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);

    // Verify verification failed event logged
    const failedEvent = eventsLogged.find(e => e.eventName === "MfaVerificationFailed" && e.payload.identityId === identityId);
    assert.ok(failedEvent);
  })
  .test("POST /api/v1/auth/mfa/verify with valid TOTP succeeds, registers trusted device, and grants tokens", async () => {
    // Reset lastVerifiedCounter in DB to simulate clock window shift and bypass replay protection
    await db.client.mfaMethod.updateMany({
      where: { identityId, type: "TOTP" },
      data: { lastVerifiedCounter: 0 },
    });

    const validCode = getValidTotpCode(base32Secret);

    const res = await tenantRequest("POST", "/api/v1/auth/mfa/verify", {
      challengeId: activeChallengeId,
      code: validCode,
      deviceFingerprint: "user-browser-chrome-mac",
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.accessToken);
    assert.ok(res.body.data.refreshToken);
    assert.equal(res.body.data.user.email, testEmail);

    // Verify challenge is marked completed in DB
    const challenge = await db.client.mfaChallenge.findUnique({ where: { id: activeChallengeId } });
    assert.ok(challenge!.completedAt);
    assert.ok(challenge!.usedAt);

    // Verify trusted device recorded in DB
    const trustCount = await db.client.trustedDevice.count({ where: { identityId } });
    assert.equal(trustCount, 1);

    // Verify events
    assert.ok(eventsLogged.find(e => e.eventName === "MfaVerificationSucceeded" && e.payload.identityId === identityId));
    assert.ok(eventsLogged.find(e => e.eventName === "TrustedDeviceAdded" && e.payload.identityId === identityId));
  })
  .test("POST /api/v1/auth/login bypasses MFA challenge for a remembered trusted device", async () => {
    const res = await tenantRequest("POST", "/api/v1/auth/login", {
      email: testEmail,
      password: testPassword,
      deviceFingerprint: "user-browser-chrome-mac", // trusted device!
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    // Bypasses step-up, directly returns access tokens!
    assert.ok(res.body.data.accessToken);
    assert.ok(res.body.data.refreshToken);
    assert.equal(res.body.data.user.email, testEmail);
  })
  .test("POST /api/v1/auth/mfa/verify replay attack (re-using same TOTP) within validity window fails", async () => {
    // Reset lastVerifiedCounter in DB to simulate clock window shift
    await db.client.mfaMethod.updateMany({
      where: { identityId, type: "TOTP" },
      data: { lastVerifiedCounter: 0 },
    });

    // 1. Create a challenge
    const chalRes = await tenantRequest("POST", "/api/v1/auth/login", {
      email: testEmail,
      password: testPassword,
    });
    const chalId = chalRes.body.data.challengeId;

    // 2. Fetch code and verify first use (should succeed)
    const validCode = getValidTotpCode(base32Secret);
    const res1 = await tenantRequest("POST", "/api/v1/auth/mfa/verify", {
      challengeId: chalId,
      code: validCode,
    });
    assert.equal(res1.status, 200);

    // 3. Create another challenge immediately
    const chalRes2 = await tenantRequest("POST", "/api/v1/auth/login", {
      email: testEmail,
      password: testPassword,
    });
    const chalId2 = chalRes2.body.data.challengeId;

    // 4. Try re-using the same code (should fail due to replay window validation)
    const res2 = await tenantRequest("POST", "/api/v1/auth/mfa/verify", {
      challengeId: chalId2,
      code: validCode,
    });
    assert.equal(res2.status, 401);
  })
  .test("POST /api/v1/auth/mfa/verify using hashed single-use backup recovery code succeeds", async () => {
    // 1. Create a challenge
    const chalRes = await tenantRequest("POST", "/api/v1/auth/login", {
      email: testEmail,
      password: testPassword,
    });
    const chalId = chalRes.body.data.challengeId;

    // 2. Verify with first backup code
    const backupCode = plaintextBackupCodes[0];
    const res = await tenantRequest("POST", "/api/v1/auth/mfa/verify", {
      challengeId: chalId,
      code: backupCode,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.accessToken);

    // Verify recovery code used event
    const usedEvent = eventsLogged.find(e => e.eventName === "BackupCodeUsed" && e.payload.identityId === identityId);
    assert.ok(usedEvent);

    // 3. Re-using same backup code should fail (single-use constraint)
    const chalRes2 = await tenantRequest("POST", "/api/v1/auth/login", {
      email: testEmail,
      password: testPassword,
    });
    const chalId2 = chalRes2.body.data.challengeId;

    const res2 = await tenantRequest("POST", "/api/v1/auth/mfa/verify", {
      challengeId: chalId2,
      code: backupCode,
    });
    assert.equal(res2.status, 401);
  })
  .test("POST /api/v1/auth/mfa/backup-codes/regenerate regenerates backup codes and invalidates prior ones", async () => {
    // 1. Regenerate
    const res = await tenantRequest("POST", "/api/v1/auth/mfa/backup-codes/regenerate", {
      passwordConfirm: testPassword,
    }, {
      Authorization: `Bearer ${accessToken}`,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.backupCodes);
    assert.equal(res.body.data.backupCodes.length, 10);

    const newBackupCodes = res.body.data.backupCodes;

    // 2. Try using one of the OLD backup codes (should be invalidated and rejected)
    const oldCode = plaintextBackupCodes[5];

    const chalRes = await tenantRequest("POST", "/api/v1/auth/login", {
      email: testEmail,
      password: testPassword,
    });
    const chalId = chalRes.body.data.challengeId;

    const oldUseRes = await tenantRequest("POST", "/api/v1/auth/mfa/verify", {
      challengeId: chalId,
      code: oldCode,
    });
    assert.equal(oldUseRes.status, 401);

    // 3. Try using one of the NEW backup codes (should succeed)
    const newCode = newBackupCodes[0];
    const newUseRes = await tenantRequest("POST", "/api/v1/auth/mfa/verify", {
      challengeId: chalId,
      code: newCode,
    });
    assert.equal(newUseRes.status, 200);
  })
  .test("POST /api/v1/auth/mfa/disable soft-disables MFA methods and invalidates active session tokens", async () => {
    // 1. Disable MFA
    const res = await tenantRequest("POST", "/api/v1/auth/mfa/disable", {
      passwordConfirm: testPassword,
      reason: "Account rotation compliance",
    }, {
      Authorization: `Bearer ${accessToken}`,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    // 2. Verify audit soft-disabled state in DB (method not deleted, enabled = false, disabledAt set)
    const mfaMethod = await db.client.mfaMethod.findUnique({
      where: { identityId_type: { identityId, type: "TOTP" } },
    });
    assert.ok(mfaMethod);
    assert.equal(mfaMethod!.enabled, false);
    assert.ok(mfaMethod!.disabledAt);
    assert.equal(mfaMethod!.disabledBy, "user");
    assert.equal(mfaMethod!.disableReason, "Account rotation compliance");

    // 3. Verify backup codes are physically purged
    const backupCodesCount = await db.client.mfaBackupCode.count({ where: { identityId } });
    assert.equal(backupCodesCount, 0);

    // 4. Verify login does NOT require MFA anymore
    const loginRes = await tenantRequest("POST", "/api/v1/auth/login", {
      email: testEmail,
      password: testPassword,
    });
    assert.equal(loginRes.status, 200);
    assert.ok(loginRes.body.data.accessToken);
    assert.equal(loginRes.body.data.user.email, testEmail);

    // Verify events
    assert.ok(eventsLogged.find(e => e.eventName === "MfaDisabled" && e.payload.identityId === identityId));
  });

export { runner };
