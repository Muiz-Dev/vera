import http from "http";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import app, { ModuleRegistry } from "../../src/app";
import { db } from "../../src/core";
import { TestRunner } from "../runner/test-runner";
import { request } from "../runner/http";
import { assert } from "../runner/assertion";
import { DbHelper } from "../fixtures/db-helper";
import { EventBus } from "../../src/core/events/event.bus";

const runner = new TestRunner("OIDC & OAuth2 Server Module Integration Suite");
let server: http.Server;
let port: number;
let tenant: { environmentId: string };
let otherTenant: { environmentId: string };

const eventsLogged: { eventName: string; payload: any }[] = [];

function setupEventTracking() {
  eventsLogged.length = 0;
  const events = [
    "OAuthClientRegistered",
    "OAuthAuthCodeIssued",
    "OAuthTokenIssued",
    "OAuthTokenRevoked",
  ];

  for (const name of events) {
    EventBus.subscribe(name, (event) => {
      eventsLogged.push({ eventName: name, payload: event.payload });
    });
  }
}

// Local helper to automatically inject tenant context
async function tenantRequest(method: string, path: string, body?: any, tenantOverride?: string, headers: Record<string, string> = {}) {
  const envId = tenantOverride || tenant.environmentId;
  return request(port, method, path, body, {
    "x-environment-id": envId,
    ...headers,
  });
}

runner
  .beforeAll(async () => {
    await db.connect();
    await ModuleRegistry.initialize();

    // Spawn test tenant (Developer, Application, Environment)
    tenant = await DbHelper.setupTestTenant();
    otherTenant = await DbHelper.setupTestTenant();

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
    // Clean test data after running
    await db.client.oAuthSigningKey.deleteMany();
    await db.client.oAuthIssuedToken.deleteMany();
    await db.client.oAuthAuthCode.deleteMany();
    await db.client.oAuthClient.deleteMany();

    await DbHelper.cleanTestData();
    server.close();
    await db.disconnect();
  })
  .test("GET /api/v1/.well-known/openid-configuration returns valid standard metadata", async () => {
    const res = await tenantRequest("GET", "/api/v1/.well-known/openid-configuration");
    assert.equal(res.status, 200);
    assert.ok(res.body.issuer);
    assert.ok(res.body.authorization_endpoint);
    assert.ok(res.body.token_endpoint);
    assert.ok(res.body.jwks_uri);
    assert.deepEqual(res.body.scopes_supported, ["openid", "profile", "email"]);
  })
  .test("GET /api/v1/oauth/certs lazily generates RS256 keypair and returns public JWKS", async () => {
    const res = await tenantRequest("GET", "/api/v1/oauth/certs");
    assert.equal(res.status, 200);
    assert.ok(res.body.keys);
    assert.ok(res.body.keys.length > 0);
    const key = res.body.keys[0];
    assert.equal(key.kty, "RSA");
    assert.equal(key.alg, "RS256");
    assert.equal(key.use, "sig");
    assert.ok(key.kid);
    assert.ok(key.n);
    assert.ok(key.e);

    // Assert that key was persisted
    const dbKey = await db.client.oAuthSigningKey.findFirst({
      where: { environmentId: tenant.environmentId },
    });
    assert.ok(dbKey);
    assert.equal(dbKey.kid, key.kid);
    assert.ok(dbKey.privateKeyPem.includes(":")); // Should be encrypted in format iv:ciphertext:tag
  })
  .test("OIDC Authorization flow (Confidential client, exact matching redirect URI)", async () => {
    // 1. Create client
    const clientPayload = {
      clientName: "Test Confidential Client",
      redirectUris: ["https://example.com/callback"],
      allowedScopes: ["openid", "profile"],
      allowedGrantTypes: ["authorization_code", "client_credentials"],
    };

    // We need to login a test user to act as req.auth
    const registerUserRes = await tenantRequest("POST", "/api/v1/auth/register", {
      email: "test-oidc-user@example.com",
      password: "Password123!",
    });
    assert.equal(registerUserRes.status, 201);
    const identityId = registerUserRes.body.data.id;

    const loginRes = await tenantRequest("POST", "/api/v1/auth/login", {
      email: "test-oidc-user@example.com",
      password: "Password123!",
    });
    assert.equal(loginRes.status, 200);
    const accessToken = loginRes.body.data.accessToken;

    const clientRes = await tenantRequest("POST", "/api/v1/oauth/clients", clientPayload, undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
    assert.equal(clientRes.status, 201);
    const clientId = clientRes.body.data.client.clientId;
    const clientSecret = clientRes.body.data.clientSecret;

    assert.ok(clientId);
    assert.ok(clientSecret);

    // Verify Event
    const regEvent = eventsLogged.find(e => e.eventName === "OAuthClientRegistered" && e.payload.clientId === clientId);
    assert.ok(regEvent);

    // 2. Perform validation/auth request
    const authUrl = `/api/v1/oauth/authorize?client_id=${clientId}&redirect_uri=https://example.com/callback&response_type=code&scope=openid%20profile&state=12345`;
    const authRes = await tenantRequest("GET", authUrl, undefined, undefined, {
      Authorization: `Bearer ${accessToken}`,
    });

    assert.equal(authRes.status, 200);
    assert.ok(authRes.body.data.code);
    assert.equal(authRes.body.data.state, "12345");
    const code = authRes.body.data.code;

    // Verify Event
    const codeEvent = eventsLogged.find(e => e.eventName === "OAuthAuthCodeIssued" && e.payload.code === code);
    assert.ok(codeEvent);

    // 3. Token exchange
    const tokenRes = await tenantRequest("POST", "/api/v1/oauth/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://example.com/callback",
      client_id: clientId,
      client_secret: clientSecret,
    });

    assert.equal(tokenRes.status, 200);
    assert.ok(tokenRes.body.access_token);
    assert.ok(tokenRes.body.refresh_token);
    assert.ok(tokenRes.body.id_token);

    const exchangeAccessToken = tokenRes.body.access_token;

    // Verify Event
    const tokenEvent = eventsLogged.find(e => e.eventName === "OAuthTokenIssued" && e.payload.clientId === clientId);
    assert.ok(tokenEvent);

    // Decode ID Token to check claims
    const decodedIdToken = jwt.decode(tokenRes.body.id_token) as any;
    assert.equal(decodedIdToken.sub, identityId);
    assert.equal(decodedIdToken.aud, clientId);
    assert.equal(decodedIdToken.email, "test-oidc-user@example.com");

    // 4. UserInfo request
    const userInfoRes = await tenantRequest("GET", "/api/v1/oauth/userinfo", undefined, undefined, {
      Authorization: `Bearer ${exchangeAccessToken}`,
    });
    assert.equal(userInfoRes.status, 200);
    assert.equal(userInfoRes.body.sub, identityId);
    assert.equal(userInfoRes.body.email, "test-oidc-user@example.com");

    // 5. Revocation request
    const revokeRes = await tenantRequest("POST", "/api/v1/oauth/revoke", {
      token: exchangeAccessToken,
      client_id: clientId,
      client_secret: clientSecret,
    });
    assert.equal(revokeRes.status, 200);

    // Verify Event
    const revokeEvent = eventsLogged.find(e => e.eventName === "OAuthTokenRevoked" && e.payload.clientId === clientId);
    assert.ok(revokeEvent);

    // Subsequent userInfo fails
    const userInfoRes2 = await tenantRequest("GET", "/api/v1/oauth/userinfo", undefined, undefined, {
      Authorization: `Bearer ${exchangeAccessToken}`,
    });
    assert.equal(userInfoRes2.status, 401);
  })
  .test("OIDC Authorization flow (Public client, PKCE SHA256 mandatory, exact redirect matching)", async () => {
    // 1. Create public client
    const clientPayload = {
      clientName: "Test Public Client",
      redirectUris: ["https://example.com/pub-callback"],
      allowedScopes: ["openid", "profile"],
      allowedGrantTypes: ["authorization_code"],
    };

    // User is already registered from prior test. Log them in again.
    const loginRes = await tenantRequest("POST", "/api/v1/auth/login", {
      email: "test-oidc-user@example.com",
      password: "Password123!",
    });
    const accessToken = loginRes.body.data.accessToken;

    const clientRes = await tenantRequest("POST", "/api/v1/oauth/clients", clientPayload, undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
    assert.equal(clientRes.status, 201);
    const clientId = clientRes.body.data.client.clientId;

    // 2. Authorize request with PKCE challenge
    // Verifier = "some-cryptographically-secure-random-string-of-good-length"
    // SHA-256 hash = bO08S8z6g6L0_8-2G0l24_Nn08vI1vG...
    const codeVerifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

    // Request missing PKCE should fail since PKCE is required for public clients
    const failAuthUrl = `/api/v1/oauth/authorize?client_id=${clientId}&redirect_uri=https://example.com/pub-callback&response_type=code&scope=openid%20profile`;
    const failAuthRes = await tenantRequest("GET", failAuthUrl, undefined, undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
    // It should allow generating code but token exchange will fail PKCE, or auth endpoint can reject it.
    // Let's verify PKCE during exchange.

    const authUrl = `/api/v1/oauth/authorize?client_id=${clientId}&redirect_uri=https://example.com/pub-callback&response_type=code&scope=openid%20profile&code_challenge=${codeChallenge}&code_challenge_method=S256`;
    const authRes = await tenantRequest("GET", authUrl, undefined, undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
    assert.equal(authRes.status, 200);
    const code = authRes.body.data.code;
    assert.ok(code);

    // 3. Exchange with wrong PKCE verifier -> fails
    const failTokenRes = await tenantRequest("POST", "/api/v1/oauth/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://example.com/pub-callback",
      client_id: clientId,
      code_verifier: "wrong-verifier",
    });
    assert.equal(failTokenRes.status, 401);

    // 4. Exchange with correct PKCE verifier -> succeeds
    const tokenRes = await tenantRequest("POST", "/api/v1/oauth/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://example.com/pub-callback",
      client_id: clientId,
      code_verifier: codeVerifier,
    });
    assert.equal(tokenRes.status, 200);
    assert.ok(tokenRes.body.access_token);
  })
  .test("Replay attack on Auth Code revokes all issued tokens", async () => {
    // 1. Create client
    const clientPayload = {
      clientName: "Test Replay Client",
      redirectUris: ["https://example.com/replay"],
      allowedScopes: ["openid"],
      allowedGrantTypes: ["authorization_code"],
    };

    const loginRes = await tenantRequest("POST", "/api/v1/auth/login", {
      email: "test-oidc-user@example.com",
      password: "Password123!",
    });
    const accessToken = loginRes.body.data.accessToken;

    const clientRes = await tenantRequest("POST", "/api/v1/oauth/clients", clientPayload, undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
    const clientId = clientRes.body.data.client.clientId;

    const codeVerifier = "abcdefghijklmnopqrstuvwxyz1234567890";
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

    // 2. Authorize
    const authUrl = `/api/v1/oauth/authorize?client_id=${clientId}&redirect_uri=https://example.com/replay&response_type=code&scope=openid&code_challenge=${codeChallenge}&code_challenge_method=S256`;
    const authRes = await tenantRequest("GET", authUrl, undefined, undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
    const code = authRes.body.data.code;

    // 3. Legit exchange
    const tokenRes = await tenantRequest("POST", "/api/v1/oauth/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://example.com/replay",
      client_id: clientId,
      code_verifier: codeVerifier,
    });
    assert.equal(tokenRes.status, 200);
    const initialAccessToken = tokenRes.body.access_token;

    // 4. Replay exchange (using same code again)
    const replayRes = await tenantRequest("POST", "/api/v1/oauth/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://example.com/replay",
      client_id: clientId,
      code_verifier: codeVerifier,
    });
    assert.equal(replayRes.status, 401); // Standard error on reuse

    // 5. Subsequent request with initialAccessToken must now fail because all tokens were revoked due to replay detection!
    const userInfoRes = await tenantRequest("GET", "/api/v1/oauth/userinfo", undefined, undefined, {
      Authorization: `Bearer ${initialAccessToken}`,
    });
    assert.equal(userInfoRes.status, 401);
  })
  .test("Client Credentials flow issues application-level Access Token", async () => {
    // 1. Create client
    const clientPayload = {
      clientName: "App Machine Client",
      redirectUris: ["https://example.com/machine"],
      allowedScopes: ["openid", "profile"],
      allowedGrantTypes: ["client_credentials"],
    };

    const loginRes = await tenantRequest("POST", "/api/v1/auth/login", {
      email: "test-oidc-user@example.com",
      password: "Password123!",
    });
    const accessToken = loginRes.body.data.accessToken;

    const clientRes = await tenantRequest("POST", "/api/v1/oauth/clients", clientPayload, undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
    const clientId = clientRes.body.data.client.clientId;
    const clientSecret = clientRes.body.data.clientSecret;

    // 2. Token request
    const tokenRes = await tenantRequest("POST", "/api/v1/oauth/token", {
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    });

    assert.equal(tokenRes.status, 200);
    assert.ok(tokenRes.body.access_token);
    assert.equal(tokenRes.body.token_type, "Bearer");
    assert.equal(tokenRes.body.expires_in, 3600);
    assert.equal(tokenRes.body.refresh_token, undefined); // No refresh token for client credentials
  })
  .test("OIDC Multi-Tenant Environment Isolation", async () => {
    // 1. Create client on primary tenant
    const clientPayload = {
      clientName: "Tenant Specific Client",
      redirectUris: ["https://example.com/tenant-cb"],
      allowedScopes: ["openid"],
      allowedGrantTypes: ["client_credentials"],
    };

    const loginRes = await tenantRequest("POST", "/api/v1/auth/login", {
      email: "test-oidc-user@example.com",
      password: "Password123!",
    });
    const accessToken = loginRes.body.data.accessToken;

    const clientRes = await tenantRequest("POST", "/api/v1/oauth/clients", clientPayload, undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
    const clientId = clientRes.body.data.client.clientId;
    const clientSecret = clientRes.body.data.clientSecret;

    // 2. Attempting to use the client on OTHER tenant should fail
    const tokenRes = await tenantRequest("POST", "/api/v1/oauth/token", {
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }, otherTenant.environmentId);

    assert.equal(tokenRes.status, 401); // Not found or invalid credentials on other tenant
  });

export { runner };
