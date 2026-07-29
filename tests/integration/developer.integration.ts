import http from "http";
import app, { ModuleRegistry } from "../../src/app";
import { db } from "../../src/core";
import { TestRunner } from "../runner/test-runner";
import { request } from "../runner/http";
import { assert } from "../runner/assertion";
import { DbHelper } from "../fixtures/db-helper";

const runner = new TestRunner("Developer Platform Module Integration Suite");
let server: http.Server;
let port: number;

const testDevEmail = "test-dev-platform-user@example.com";
const testDevPassword = "Password123!_DevPlatform";
let developerId: string;
let applicationId: string;
let environmentId: string;
let originId: string;

runner
  .beforeAll(async () => {
    await db.connect();
    await ModuleRegistry.initialize();

    // Clean prior test data
    await DbHelper.cleanTestData();

    server = http.createServer(app);
    port = await new Promise<number>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          resolve(addr.port);
        } else {
          resolve(3005);
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
  .test("POST /api/v1/developers/register registers a developer account successfully", async () => {
    const res = await request(port, "POST", "/api/v1/developers/register", {
      email: testDevEmail,
      password: testDevPassword,
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.id);
    assert.equal(res.body.data.email, testDevEmail);
    developerId = res.body.data.id;
  })
  .test("POST /api/v1/developers/login authenticates registered developer successfully", async () => {
    const res = await request(port, "POST", "/api/v1/developers/login", {
      email: testDevEmail,
      password: testDevPassword,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.id, developerId);
    assert.equal(res.body.data.email, testDevEmail);
  })
  .test("POST /api/v1/applications creates application and automatically bootstraps all 3 environments, keys, roles & permissions", async () => {
    const res = await request(port, "POST", "/api/v1/applications", {
      name: "Acme Web App",
      description: "Main customer portal for Acme",
    }, {
      "x-developer-id": developerId,
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.id);
    assert.equal(res.body.data.name, "Acme Web App");
    assert.equal(res.body.data.environments.length, 3); // Dev, Staging, Prod

    applicationId = res.body.data.id;

    // Resolve DEVELOPMENT environmentId
    const devEnv = res.body.data.environments.find((e: any) => e.type === "DEVELOPMENT");
    assert.ok(devEnv);
    assert.equal(devEnv.apiKeys.length, 2); // Publishable & Secret
    assert.ok(devEnv.settings);

    environmentId = devEnv.id;

    // Verify DB states for default seeded system roles in that environment
    const seededRolesCount = await db.client.role.count({
      where: { environmentId, isSystem: true },
    });
    assert.equal(seededRolesCount, 3); // owner, administrator, system
  })
  .test("GET /api/v1/applications lists applications belonging to developer", async () => {
    const res = await request(port, "GET", "/api/v1/applications", undefined, {
      "x-developer-id": developerId,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.length >= 1);
    assert.equal(res.body.data[0].id, applicationId);
  })
  .test("GET /api/v1/applications/:id retrieves specific application with details", async () => {
    const res = await request(port, "GET", `/api/v1/applications/${applicationId}`, undefined, {
      "x-developer-id": developerId,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.id, applicationId);
    assert.equal(res.body.data.environments.length, 3);
  })
  .test("PATCH /api/v1/applications/:id updates application properties successfully", async () => {
    const res = await request(port, "PATCH", `/api/v1/applications/${applicationId}`, {
      name: "Acme Customer Portal",
      description: "Updated description",
    }, {
      "x-developer-id": developerId,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.name, "Acme Customer Portal");
    assert.equal(res.body.data.description, "Updated description");
  })
  .test("GET /api/v1/environments/:environmentId/settings retrieves environment settings", async () => {
    const res = await request(port, "GET", `/api/v1/environments/${environmentId}/settings`, undefined, {
      "x-developer-id": developerId,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.jwtAccessTokenLifetime, 900); // default 15 min
    assert.equal(res.body.data.emailVerificationRequired, true);
  })
  .test("PATCH /api/v1/environments/:environmentId/settings updates environment settings successfully", async () => {
    const res = await request(port, "PATCH", `/api/v1/environments/${environmentId}/settings`, {
      jwtAccessTokenLifetime: 1200,
      emailVerificationRequired: false,
    }, {
      "x-developer-id": developerId,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.jwtAccessTokenLifetime, 1200);
    assert.equal(res.body.data.emailVerificationRequired, false);
  })
  .test("POST /api/v1/environments/:environmentId/origins registers new allowed domain origin", async () => {
    const res = await request(port, "POST", `/api/v1/environments/${environmentId}/origins`, {
      origin: "http://localhost:5173",
    }, {
      "x-developer-id": developerId,
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.id);
    assert.equal(res.body.data.origin, "http://localhost:5173");

    originId = res.body.data.id;
  })
  .test("GET /api/v1/environments/:environmentId/origins lists registered origins", async () => {
    const res = await request(port, "GET", `/api/v1/environments/${environmentId}/origins`, undefined, {
      "x-developer-id": developerId,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].origin, "http://localhost:5173");
  })
  .test("DELETE /api/v1/environments/:environmentId/origins/:id removes registered allowed origin", async () => {
    const res = await request(port, "DELETE", `/api/v1/environments/${environmentId}/origins/${originId}`, undefined, {
      "x-developer-id": developerId,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const listRes = await request(port, "GET", `/api/v1/environments/${environmentId}/origins`, undefined, {
      "x-developer-id": developerId,
    });
    assert.equal(listRes.body.data.length, 0);
  })
  .test("POST /api/v1/environments/:environmentId/keys/rotate rotates active publishable and secret keys", async () => {
    const preRes = await request(port, "GET", `/api/v1/applications/${applicationId}`, undefined, {
      "x-developer-id": developerId,
    });
    const preEnv = preRes.body.data.environments.find((e: any) => e.type === "DEVELOPMENT");
    const prePubToken = preEnv.apiKeys.find((k: any) => k.type === "PUBLISHABLE").token;

    const res = await request(port, "POST", `/api/v1/environments/${environmentId}/keys/rotate`, undefined, {
      "x-developer-id": developerId,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.length, 2);

    const postPubToken = res.body.data.find((k: any) => k.type === "PUBLISHABLE").token;
    assert.notEqual(postPubToken, prePubToken);
    assert.ok(postPubToken.startsWith("pk_test_"));
  })
  .test("DELETE /api/v1/applications/:id soft deletes application successfully", async () => {
    const res = await request(port, "DELETE", `/api/v1/applications/${applicationId}`, undefined, {
      "x-developer-id": developerId,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    // Verify cannot retrieve anymore
    const getRes = await request(port, "GET", `/api/v1/applications/${applicationId}`, undefined, {
      "x-developer-id": developerId,
    });
    assert.equal(getRes.status, 404);
  });

export { runner };
