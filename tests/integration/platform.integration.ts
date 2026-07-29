import http from "http";
import app, { ModuleRegistry } from "../../src/app";
import { db } from "../../src/core";
import { TestRunner } from "../runner/test-runner";
import { request } from "../runner/http";
import { assert } from "../runner/assertion";
import { DbHelper } from "../fixtures/db-helper";
import { EventBus } from "../../src/core/events/event.bus";

const runner = new TestRunner("Vera Platform End-to-End Orchestrated Flow Suite");
let server: http.Server;
let port: number;

const eventsLogged: { eventName: string; payload: any }[] = [];

function setupEventTracking() {
  eventsLogged.length = 0;
  const events = [
    "IdentityCreated",
    "IdentityUpdated",
    "IdentitySuspended",
    "IdentityDeleted",
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

runner
  .beforeAll(async () => {
    await ModuleRegistry.initialize();
    await db.connect();

    // Clean test data before running
    await DbHelper.cleanTestData();

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
          resolve(3004);
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
  .test("Complete End-to-End Cross-Module Orchestrated Verification Flow", async () => {
    const email = "test-integration-platform-e2e-user@example.com";
    const password = "Password123!_PlatformE2E";
    let identityId = "";
    let verificationToken = "";
    let refreshToken = "";
    let accessToken = "";

    // 1. HEALTH CHECKS
    const healthLive = await request(port, "GET", "/health/live");
    assert.equal(healthLive.status, 200);

    const healthReady = await request(port, "GET", "/health/ready");
    assert.equal(healthReady.status, 200);

    // 2. REGISTRATION
    const regRes = await request(port, "POST", "/api/v1/auth/register", {
      email,
      password,
      profile: {
        firstName: "Platform",
        lastName: "E2E",
        displayName: "platforme2e",
      },
    });
    assert.equal(regRes.status, 201);
    identityId = regRes.body.data.id;
    assert.ok(identityId);

    // Assert Domain Events triggered
    const regEvent = eventsLogged.find(e => e.eventName === "AuthenticationRegistered");
    const verifReqEvent = eventsLogged.find(e => e.eventName === "EmailVerificationRequested");
    assert.ok(regEvent);
    assert.ok(verifReqEvent);
    verificationToken = verifReqEvent!.payload.token;

    // Direct Database State Verifications
    await DbHelper.verifyIdentityExists(identityId);
    await DbHelper.verifyCredentialExists(identityId);
    await DbHelper.verifyEmailVerificationTokenStored(identityId);

    // 3. EMAIL VERIFICATION (Activates account)
    const verifRes = await request(port, "POST", "/api/v1/auth/verify-email", {
      token: verificationToken,
    });
    assert.equal(verifRes.status, 200);

    // Assert Database status changed to ACTIVE
    const identityDb = await DbHelper.verifyIdentityExists(identityId);
    assert.equal(identityDb.status, "ACTIVE");

    // Assert event published
    assert.ok(eventsLogged.find(e => e.eventName === "EmailVerified"));

    // 4. LOGIN (Generates access token & session)
    const loginRes = await request(port, "POST", "/api/v1/auth/login", {
      email,
      password,
    });
    assert.equal(loginRes.status, 200);
    accessToken = loginRes.body.data.accessToken;
    refreshToken = loginRes.body.data.refreshToken;
    assert.ok(accessToken);
    assert.ok(refreshToken);

    // Assert DB Session & Refresh Token
    const sessionDb = await DbHelper.verifySessionExistsForIdentity(identityId);
    await DbHelper.verifyRefreshTokenStored(sessionDb.id);
    assert.ok(eventsLogged.find(e => e.eventName === "AuthenticationLoggedIn"));

    // 5. UPDATE IDENTITY PROFILE
    const updateRes = await request(port, "PATCH", `/api/v1/identities/${identityId}`, {
      profile: {
        firstName: "Platform E2E Updated",
      },
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.profile.firstName, "Platform E2E Updated");

    // Assert DB profile updated & Event triggered
    const updatedIdentityDb = await DbHelper.verifyIdentityExists(identityId);
    assert.equal(updatedIdentityDb.profile.firstName, "Platform E2E Updated");
    assert.ok(eventsLogged.find(e => e.eventName === "IdentityUpdated"));

    // 6. REFRESH TOKEN ROTATION
    const refreshRes = await request(port, "POST", "/api/v1/auth/refresh", {
      refreshToken,
    });
    assert.equal(refreshRes.status, 200);
    const newRefreshToken = refreshRes.body.data.refreshToken;
    assert.notEqual(newRefreshToken, refreshToken);
    assert.ok(eventsLogged.find(e => e.eventName === "RefreshTokenRotated"));

    // 7. SECURITY: REPLAY PROTECTION
    const replayRes = await request(port, "POST", "/api/v1/auth/refresh", {
      refreshToken, // using the old, already rotated refresh token
    });
    assert.equal(replayRes.status, 401);
    assert.equal(replayRes.body.error.message, "Invalid refresh token. Session compromised.");
    assert.ok(eventsLogged.find(e => e.eventName === "SessionRevoked"));

    // 8. LOGOUT
    // Re-login to get a fresh session
    const finalLoginRes = await request(port, "POST", "/api/v1/auth/login", {
      email,
      password,
    });
    const activeRefreshToken = finalLoginRes.body.data.refreshToken;

    const logoutRes = await request(port, "POST", "/api/v1/auth/logout", {
      refreshToken: activeRefreshToken,
    });
    assert.equal(logoutRes.status, 200);
    assert.ok(eventsLogged.find(e => e.eventName === "AuthenticationLoggedOut"));
  });

export { runner };
