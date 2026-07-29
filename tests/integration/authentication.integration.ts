import http from "http";
import app, { ModuleRegistry } from "../../src/app";
import { db } from "../../src/core";
import { TestRunner } from "../runner/test-runner";
import { request } from "../runner/http";
import { assert } from "../runner/assertion";
import { DbHelper } from "../fixtures/db-helper";
import { EventBus } from "../../src/core/events/event.bus";

const runner = new TestRunner("Authentication Module Integration Suite");
let server: http.Server;
let port: number;
let tenant: { environmentId: string };

const eventsLogged: { eventName: string; payload: any }[] = [];

function setupEventTracking() {
  eventsLogged.length = 0;
  const events = [
    "AuthenticationRegistered",
    "AuthenticationLoggedIn",
    "AuthenticationLoggedOut",
    "PasswordChanged",
    "PasswordResetRequested",
    "PasswordResetCompleted",
    "EmailVerificationRequested",
    "EmailVerified",
    "RefreshTokenRotated",
    "SessionRevoked",
  ];

  for (const name of events) {
    EventBus.subscribe(name, (event) => {
      eventsLogged.push({ eventName: name, payload: event.payload });
    });
  }
}

const testEmail = "auth-test-integration-user@example.com";
const securePassword = "Password123!_AuthTestIntegration";

// Local helper to automatically inject tenant context
async function tenantRequest(method: string, path: string, body?: any) {
  return request(port, method, path, body, {
    "x-environment-id": tenant.environmentId,
  });
}

runner
  .beforeAll(async () => {
    await db.connect();
    await ModuleRegistry.initialize();

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
          resolve(3003);
        }
      });
    });
  })
  .afterAll(async () => {
    // Clean test data after running to be tidy
    await DbHelper.cleanTestData();
    server.close();
    await db.disconnect();
  })
  .test("POST /api/v1/auth/register creates identity & credential, hashes password, saves to DB, and sends verification", async () => {
    const payload = {
      email: testEmail,
      password: securePassword,
      profile: {
        firstName: "Auth",
        lastName: "Tester",
        displayName: "authtester",
      },
    };

    const res = await tenantRequest("POST", "/api/v1/auth/register", payload);
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, "PENDING");

    const identityId = res.body.data.id;

    // Verify programmatically in database
    const dbIdentity = await DbHelper.verifyIdentityExists(identityId);
    assert.equal(dbIdentity.status, "PENDING");

    const dbCredential = await DbHelper.verifyCredentialExists(identityId);
    // Password must be hashed with Argon2id ($argon2id$)
    assert.ok(dbCredential.password.startsWith("$argon2id$"));

    await DbHelper.verifyEmailVerificationTokenStored(identityId);

    // Verify events
    const regEvent = eventsLogged.find(e => e.eventName === "AuthenticationRegistered" && e.payload.identityId === identityId);
    assert.ok(regEvent);

    const verifEvent = eventsLogged.find(e => e.eventName === "EmailVerificationRequested" && e.payload.identityId === identityId);
    assert.ok(verifEvent);
  })
  .test("POST /api/v1/auth/register duplicate email rejection", async () => {
    const payload = {
      email: testEmail,
      password: securePassword,
    };
    const res = await tenantRequest("POST", "/api/v1/auth/register", payload);
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.message.includes("already exists"));
  })
  .test("POST /api/v1/auth/login with invalid password returns 401 with no info leak", async () => {
    const res = await tenantRequest("POST", "/api/v1/auth/login", {
      email: testEmail,
      password: "WrongPassword1!",
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.message, "Invalid email or password");
  })
  .test("POST /api/v1/auth/login with correct password returns tokens & session, logged in DB", async () => {
    const res = await tenantRequest("POST", "/api/v1/auth/login", {
      email: testEmail,
      password: securePassword,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.accessToken);
    assert.ok(res.body.data.refreshToken);

    const identityId = res.body.data.user.id;

    // Programmatic DB Session/Token checks
    const dbSession = await DbHelper.verifySessionExistsForIdentity(identityId);
    assert.ok(dbSession.expiresAt > new Date());
    assert.equal(dbSession.revokedAt, null);

    const dbRefreshToken = await DbHelper.verifyRefreshTokenStored(dbSession.id);
    assert.ok(dbRefreshToken.token.startsWith("$argon2id$"));
    assert.equal(dbRefreshToken.revokedAt, null);

    // Verify events
    const loggedInEvent = eventsLogged.find(e => e.eventName === "AuthenticationLoggedIn" && e.payload.identityId === identityId);
    assert.ok(loggedInEvent);
  })
  .test("POST /api/v1/auth/refresh rotates the Refresh Token & triggers events", async () => {
    // 1. Login to get a fresh token
    const loginRes = await tenantRequest("POST", "/api/v1/auth/login", {
      email: testEmail,
      password: securePassword,
    });
    const oldRefreshToken = loginRes.body.data.refreshToken;

    // 2. Refresh
    const refreshRes = await tenantRequest("POST", "/api/v1/auth/refresh", {
      refreshToken: oldRefreshToken,
    });
    assert.equal(refreshRes.status, 200);
    assert.equal(refreshRes.body.success, true);
    assert.ok(refreshRes.body.data.accessToken);
    assert.ok(refreshRes.body.data.refreshToken);
    assert.notEqual(refreshRes.body.data.refreshToken, oldRefreshToken);

    // Verify event
    const rotatedEvent = eventsLogged.find(e => e.eventName === "RefreshTokenRotated");
    assert.ok(rotatedEvent);
  })
  .test("POST /api/v1/auth/refresh replay attack revokes entire session immediately", async () => {
    // 1. Login to get a fresh token
    const loginRes = await tenantRequest("POST", "/api/v1/auth/login", {
      email: testEmail,
      password: securePassword,
    });
    const oldRefreshToken = loginRes.body.data.refreshToken;

    // 2. Perform legitimate refresh (first use)
    const refreshRes = await tenantRequest("POST", "/api/v1/auth/refresh", {
      refreshToken: oldRefreshToken,
    });
    assert.equal(refreshRes.status, 200);
    const newRefreshToken = refreshRes.body.data.refreshToken;

    // 3. Replay attack: use old token again
    const replayRes = await tenantRequest("POST", "/api/v1/auth/refresh", {
      refreshToken: oldRefreshToken,
    });
    assert.equal(replayRes.status, 401);
    assert.equal(replayRes.body.error.message, "Invalid refresh token. Session compromised.");

    // Verify entire session was revoked
    const sessionRevokedEvent = eventsLogged.find(e => e.eventName === "SessionRevoked");
    assert.ok(sessionRevokedEvent);

    // 4. Verify new refresh token is now rejected because session was revoked
    const secondaryRes = await tenantRequest("POST", "/api/v1/auth/refresh", {
      refreshToken: newRefreshToken,
    });
    assert.equal(secondaryRes.status, 401);
  })
  .test("POST /api/v1/auth/logout invalidates session & refresh token", async () => {
    // 1. Login
    const loginRes = await tenantRequest("POST", "/api/v1/auth/login", {
      email: testEmail,
      password: securePassword,
    });
    const currentRefreshToken = loginRes.body.data.refreshToken;

    // 2. Logout
    const logoutRes = await tenantRequest("POST", "/api/v1/auth/logout", {
      refreshToken: currentRefreshToken,
    });
    assert.equal(logoutRes.status, 200);

    // 3. Verify Refresh is now rejected
    const refreshRes = await tenantRequest("POST", "/api/v1/auth/refresh", {
      refreshToken: currentRefreshToken,
    });
    assert.equal(refreshRes.status, 401);

    // Verify event
    const loggedOutEvent = eventsLogged.find(e => e.eventName === "AuthenticationLoggedOut");
    assert.ok(loggedOutEvent);
  })
  .test("POST /api/v1/auth/forgot-password handles non-existent and existent accounts without info leaks", async () => {
    // Non-existent email
    const res1 = await tenantRequest("POST", "/api/v1/auth/forgot-password", {
      email: "non-existent-integration-user@example.com",
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.body.success, true);

    // Existent email
    const res2 = await tenantRequest("POST", "/api/v1/auth/forgot-password", {
      email: testEmail,
    });
    assert.equal(res2.status, 200);
    assert.equal(res2.body.success, true);

    // Verify reset token stored in DB programmatically
    const identityRecord = await db.client.identity.findFirst({
      where: { email: testEmail, environmentId: tenant.environmentId },
    });
    await DbHelper.verifyPasswordResetTokenStored(identityRecord!.id);

    // Verify Event
    const event = eventsLogged.find(e => e.eventName === "PasswordResetRequested" && e.payload.email === testEmail);
    assert.ok(event);
  })
  .test("POST /api/v1/auth/reset-password updates password, invalidates previous sessions", async () => {
    // 1. Get Reset token from event log
    const event = eventsLogged.find(e => e.eventName === "PasswordResetRequested" && e.payload.email === testEmail);
    assert.ok(event);
    const token = event!.payload.token;

    // 2. Perform reset
    const newPassword = "NewSecurePassword123!_AuthTestIntegration";
    const resetRes = await tenantRequest("POST", "/api/v1/auth/reset-password", {
      token,
      password: newPassword,
    });
    assert.equal(resetRes.status, 200);

    // 3. Verify password reset completion events
    const completedEvent = eventsLogged.find(e => e.eventName === "PasswordResetCompleted");
    assert.ok(completedEvent);

    // 4. Try log in with OLD password (should fail)
    const oldLoginRes = await tenantRequest("POST", "/api/v1/auth/login", {
      email: testEmail,
      password: securePassword,
    });
    assert.equal(oldLoginRes.status, 401);

    // 5. Try log in with NEW password (should succeed)
    const newLoginRes = await tenantRequest("POST", "/api/v1/auth/login", {
      email: testEmail,
      password: newPassword,
    });
    assert.equal(newLoginRes.status, 200);
  })
  .test("POST /api/v1/auth/verify-email activates identity status (PENDING to ACTIVE)", async () => {
    const identityRecord = await db.client.identity.findFirst({
      where: { email: testEmail, environmentId: tenant.environmentId },
    });
    assert.ok(identityRecord);
    assert.equal(identityRecord!.status, "PENDING");

    // Get email verification token from DB
    const verificationRecord = await db.client.emailVerification.findFirst({
      where: { identityId: identityRecord!.id },
    });
    assert.ok(verificationRecord);

    const res = await tenantRequest("POST", "/api/v1/auth/verify-email", {
      token: verificationRecord!.token,
    });
    assert.equal(res.status, 200);

    // Verify identity status is now ACTIVE programmatically
    const dbIdentity = await DbHelper.verifyIdentityExists(identityRecord!.id);
    assert.equal(dbIdentity.status, "ACTIVE");

    // Verify Event
    const event = eventsLogged.find(e => e.eventName === "EmailVerified" && e.payload.identityId === identityRecord!.id);
    assert.ok(event);
  });

export { runner };
