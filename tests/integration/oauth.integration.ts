import http from "http";
import app, { ModuleRegistry } from "../../src/app";
import { db } from "../../src/core";
import { TestRunner } from "../runner/test-runner";
import { request } from "../runner/http";
import { assert } from "../runner/assertion";
import { DbHelper } from "../fixtures/db-helper";
import { EventBus } from "../../src/core/events/event.bus";

const runner = new TestRunner("OAuth & Social Authentication Module Integration Suite");
let server: http.Server;
let port: number;
let tenant: { environmentId: string };

const eventsLogged: { eventName: string; payload: any }[] = [];

function setupEventTracking() {
  eventsLogged.length = 0;
  const events = [
    "OAuthAccountLinked",
    "OAuthAccountUnlinked",
    "OAuthLoginSucceeded",
    "OAuthLoginFailed",
    "AuthenticationLoggedIn",
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

runner
  .beforeAll(async () => {
    await db.connect();
    await ModuleRegistry.initialize();

    // Spawn test tenant (Developer, Application, Environment)
    tenant = await DbHelper.setupTestTenant();

    // Register a mock origin first to pass redirect URI verification
    await db.client.allowedOrigin.create({
      data: {
        environmentId: tenant.environmentId,
        origin: "https://my-client-app.com",
      },
    });

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
          resolve(3006);
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
  .test("GET /api/v1/auth/oauth/:provider redirects to provider with state and PKCE", async () => {
    const res = await tenantRequest("GET", "/api/v1/auth/oauth/google?redirect_uri=https://my-client-app.com/callback&state=my-client-state");

    assert.equal(res.status, 302);
    const location = res.headers.location;
    assert.ok(location);
    assert.ok(location.includes("accounts.google.com"));
    assert.ok(location.includes("state="));
    assert.ok(location.includes("code_challenge="));
  })
  .test("GET /api/v1/auth/oauth/:provider rejects unregistered redirect_uri", async () => {
    const res = await tenantRequest("GET", "/api/v1/auth/oauth/google?redirect_uri=https://unauthorized-attacker.com/callback");

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, "ERR_FORBIDDEN");
  })
  .test("GET /api/v1/auth/oauth/:provider/callback registers new Identity dynamically on first social sign-in (Google)", async () => {
    // 1. Start the flow to save the state transaction
    const startRes = await tenantRequest("GET", "/api/v1/auth/oauth/google?redirect_uri=https://my-client-app.com/callback&state=client-state-123");
    const location = startRes.headers.location!;
    const state = new URL(location).searchParams.get("state")!;

    // 2. Perform callback simulating provider authorization code callback
    // With mock mode, passing code "user-john" yields john@example.com
    const callbackRes = await tenantRequest("GET", `/api/v1/auth/oauth/google/callback?code=user-john&state=${state}`);

    if (callbackRes.status === 500) {
      console.log("500 Error body:", JSON.stringify(callbackRes.body, null, 2));
    }
    assert.equal(callbackRes.status, 302);
    const finalRedirect = callbackRes.headers.location!;
    assert.ok(finalRedirect.startsWith("https://my-client-app.com/callback"));

    const finalUrl = new URL(finalRedirect);
    const oauthCode = finalUrl.searchParams.get("code")!;
    const clientState = finalUrl.searchParams.get("state")!;
    assert.ok(oauthCode);
    assert.equal(clientState, "client-state-123");

    // 3. Exchange temporary oauthCode for standard Vera JWT session tokens
    const tokenRes = await tenantRequest("POST", "/api/v1/auth/oauth/token", { code: oauthCode });
    assert.equal(tokenRes.status, 200);
    assert.equal(tokenRes.body.success, true);
    assert.ok(tokenRes.body.data.accessToken);
    assert.ok(tokenRes.body.data.refreshToken);
    assert.equal(tokenRes.body.data.user.email, "user-john@example.com");

    const identityId = tokenRes.body.data.user.id;

    // Verify programmatically that Identity and Profile exist in DB
    const identity = await db.client.identity.findUnique({
      where: { id: identityId },
      include: { profile: true },
    });
    assert.ok(identity);
    assert.equal(identity.status, "ACTIVE"); // Verified Google account auto-activates!
    assert.equal(identity.email, "user-john@example.com");
    assert.equal(identity.profile?.displayName, "Google User user-john");

    // Verify events
    const linkedEvent = eventsLogged.find(e => e.eventName === "OAuthAccountLinked" && e.payload.identityId === identityId);
    assert.ok(linkedEvent);
    assert.equal(linkedEvent.payload.provider, "google");

    const successEvent = eventsLogged.find(e => e.eventName === "OAuthLoginSucceeded" && e.payload.identityId === identityId);
    assert.ok(successEvent);
  })
  .test("GET /api/v1/auth/oauth/:provider/callback reuse of same state throws error (Replay Protection)", async () => {
    // 1. Start flow to cache state
    const startRes = await tenantRequest("GET", "/api/v1/auth/oauth/google?redirect_uri=https://my-client-app.com/callback");
    const state = new URL(startRes.headers.location!).searchParams.get("state")!;

    // 2. Callback first use (should succeed)
    const callbackRes1 = await tenantRequest("GET", `/api/v1/auth/oauth/google/callback?code=replay-test&state=${state}`);
    assert.equal(callbackRes1.status, 302);

    // 3. Callback second use with same state (should fail)
    const callbackRes2 = await tenantRequest("GET", `/api/v1/auth/oauth/google/callback?code=replay-test&state=${state}`);
    assert.equal(callbackRes2.status, 400);
    assert.equal(callbackRes2.body.success, false);
    assert.equal(callbackRes2.body.error.code, "ERR_VALIDATION_FAILED");
  })
  .test("POST /api/v1/auth/oauth/token reuse of same auth code throws error (Single-use Protection)", async () => {
    // 1. Start flow to cache state
    const startRes = await tenantRequest("GET", "/api/v1/auth/oauth/google?redirect_uri=https://my-client-app.com/callback");
    const state = new URL(startRes.headers.location!).searchParams.get("state")!;

    // 2. Callback to generate code
    const callbackRes = await tenantRequest("GET", `/api/v1/auth/oauth/google/callback?code=code-replay&state=${state}`);
    const oauthCode = new URL(callbackRes.headers.location!).searchParams.get("code")!;

    // 3. Exchange first time (should succeed)
    const exchangeRes1 = await tenantRequest("POST", "/api/v1/auth/oauth/token", { code: oauthCode });
    assert.equal(exchangeRes1.status, 200);

    // 4. Exchange second time with same code (should fail)
    const exchangeRes2 = await tenantRequest("POST", "/api/v1/auth/oauth/token", { code: oauthCode });
    assert.equal(exchangeRes2.status, 401);
  })
  .test("GET /api/v1/auth/oauth/:provider/callback logs in existing linked user instead of duplicate registration", async () => {
    // John is already registered from previous test. Let's log him in again.
    const startRes = await tenantRequest("GET", "/api/v1/auth/oauth/google?redirect_uri=https://my-client-app.com/callback");
    const state = new URL(startRes.headers.location!).searchParams.get("state")!;

    const callbackRes = await tenantRequest("GET", `/api/v1/auth/oauth/google/callback?code=user-john&state=${state}`);
    assert.equal(callbackRes.status, 302);

    const oauthCode = new URL(callbackRes.headers.location!).searchParams.get("code")!;
    const tokenRes = await tenantRequest("POST", "/api/v1/auth/oauth/token", { code: oauthCode });
    assert.equal(tokenRes.status, 200);
    assert.equal(tokenRes.body.data.user.email, "user-john@example.com");
  })
  .test("GET /api/v1/auth/oauth/:provider/callback rejects registration if email already exists with password (Option B)", async () => {
    // 1. Create native email/password user
    const nativeEmail = "native-user@example.com";
    await tenantRequest("POST", "/api/v1/auth/register", {
      email: nativeEmail,
      password: "Password123!",
    });

    // 2. Attempt Google Login with same email
    const startRes = await tenantRequest("GET", "/api/v1/auth/oauth/google?redirect_uri=https://my-client-app.com/callback");
    const state = new URL(startRes.headers.location!).searchParams.get("state")!;

    // Code "native-user" yields native-user@example.com mock profile
    const callbackRes = await tenantRequest("GET", `/api/v1/auth/oauth/google/callback?code=native-user&state=${state}`);

    // Should throw validation error to protect user hijacking
    assert.equal(callbackRes.status, 400);
    assert.equal(callbackRes.body.success, false);
    assert.ok(callbackRes.body.error.message.includes("already exists"));

    // Verify event
    const failedEvent = eventsLogged.find(e => e.eventName === "OAuthLoginFailed" && e.payload.error.includes("already exists"));
    assert.ok(failedEvent);
  })
  .test("POST /api/v1/auth/oauth/link explicitly links an OAuth account to authenticated session", async () => {
    // 1. Login native email/password user
    const loginRes = await tenantRequest("POST", "/api/v1/auth/login", {
      email: "native-user@example.com",
      password: "Password123!",
    });
    const accessToken = loginRes.body.data.accessToken;

    // 2. Link GitHub social account
    // code "native-user" yields native-user@example.com profile
    const linkRes = await tenantRequest(
      "POST",
      "/api/v1/auth/oauth/link",
      {
        provider: "github",
        code: "native-user",
        redirectUri: "https://my-client-app.com/callback",
      },
      { Authorization: `Bearer ${accessToken}` }
    );

    assert.equal(linkRes.status, 200);
    assert.equal(linkRes.body.success, true);
    assert.ok(linkRes.body.data.message.includes("successfully linked"));

    // Verify linked accounts endpoint
    const accountsRes = await tenantRequest(
      "GET",
      "/api/v1/auth/oauth/accounts",
      undefined,
      { Authorization: `Bearer ${accessToken}` }
    );
    assert.equal(accountsRes.status, 200);
    assert.equal(accountsRes.body.data.length, 1);
    assert.equal(accountsRes.body.data[0].provider, "github");
    assert.equal(accountsRes.body.data[0].email, "native-user@example.com");
  })
  .test("DELETE /api/v1/auth/oauth/link/:provider rejects unlinking if it is the sole remaining factor", async () => {
    // We create a user that ONLY has Google link, no password.
    // 1. Register Google-only user
    const startRes = await tenantRequest("GET", "/api/v1/auth/oauth/google?redirect_uri=https://my-client-app.com/callback");
    const state = new URL(startRes.headers.location!).searchParams.get("state")!;
    const callbackRes = await tenantRequest("GET", `/api/v1/auth/oauth/google/callback?code=social-only&state=${state}`);
    const oauthCode = new URL(callbackRes.headers.location!).searchParams.get("code")!;
    const tokenRes = await tenantRequest("POST", "/api/v1/auth/oauth/token", { code: oauthCode });
    const accessToken = tokenRes.body.data.accessToken;

    // 2. Try unlinking google (should fail as it is the sole factor)
    const unlinkRes = await tenantRequest(
      "DELETE",
      "/api/v1/auth/oauth/link/google",
      undefined,
      { Authorization: `Bearer ${accessToken}` }
    );
    assert.equal(unlinkRes.status, 400);
    assert.equal(unlinkRes.body.success, false);
    assert.ok(unlinkRes.body.error.message.includes("sole remaining login method"));
  })
  .test("DELETE /api/v1/auth/oauth/link/:provider succeeds if there is another login factor", async () => {
    // The "native-user" has BOTH password AND GitHub link. Let's unlink GitHub.
    const loginRes = await tenantRequest("POST", "/api/v1/auth/login", {
      email: "native-user@example.com",
      password: "Password123!",
    });
    const accessToken = loginRes.body.data.accessToken;

    const unlinkRes = await tenantRequest(
      "DELETE",
      "/api/v1/auth/oauth/link/github",
      undefined,
      { Authorization: `Bearer ${accessToken}` }
    );
    assert.equal(unlinkRes.status, 200);
    assert.equal(unlinkRes.body.success, true);

    // Verify unlinked event
    const unlinkedEvent = eventsLogged.find(e => e.eventName === "OAuthAccountUnlinked" && e.payload.provider === "github");
    assert.ok(unlinkedEvent);
  });

export { runner };
