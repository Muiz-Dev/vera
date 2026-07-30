import http from "http";
import app, { ModuleRegistry } from "../../src/app";
import { db } from "../../src/core";
import { TestRunner } from "../runner/test-runner";
import { request } from "../runner/http";
import { assert } from "../runner/assertion";
import { DbHelper } from "../fixtures/db-helper";

const runner = new TestRunner("Platform Administration Engine Module Integration Suite");
let server: http.Server;
let port: number;

// Emails must start with test-dev- to ensure they are cleaned up by DbHelper.cleanTestData()
const uniqueTag = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
const mainDevEmail = `test-dev-admin-main-${uniqueTag}@example.com`;
const mainDevPassword = "Password123!_AdminMain";
let mainDevId: string;

const otherDevEmail = `test-dev-admin-other-${uniqueTag}@example.com`;
const otherDevPassword = "Password123!_AdminOther";
let otherDevId: string;

let orgId: string;
let appId: string;
let devEnvId: string;
let stagingEnvId: string;
let prodEnvId: string;

runner
  .beforeAll(async () => {
    await db.connect();
    await ModuleRegistry.initialize();

    // Clean prior test data
    await DbHelper.cleanTestData();

    // Setup server
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

    // 1. Register main developer
    const regResMain = await request(port, "POST", "/api/v1/developers/register", {
      email: mainDevEmail,
      password: mainDevPassword,
    });
    if (regResMain.status !== 201) {
      console.error("DEBUG: Failed to register main developer in beforeAll", JSON.stringify(regResMain.body));
    }
    mainDevId = regResMain.body.data.id;

    // 2. Register other developer (for access control / boundary testing)
    const regResOther = await request(port, "POST", "/api/v1/developers/register", {
      email: otherDevEmail,
      password: otherDevPassword,
    });
    if (regResOther.status !== 201) {
      console.error("DEBUG: Failed to register other developer in beforeAll", JSON.stringify(regResOther.body));
    }
    otherDevId = regResOther.body.data.id;

    // 3. Create organization for main developer
    const orgRes = await request(port, "POST", "/api/v1/organizations", {
      name: `Stark Industries ${uniqueTag}`,
      slug: `stark-industries-${uniqueTag}`,
      description: "Arc reactor technologies",
    }, {
      "x-developer-id": mainDevId,
    });
    orgId = orgRes.body.data.id;

    // 4. Create application inside organization
    const appRes = await request(port, "POST", "/api/v1/applications", {
      name: `Jarvis AI System ${uniqueTag}`,
      description: "Artificial Intelligence for Stark Industries",
      organizationId: orgId,
    }, {
      "x-developer-id": mainDevId,
    });
    appId = appRes.body.data.id;

    // Capture environment IDs
    const environments = appRes.body.data.environments;
    devEnvId = environments.find((e: any) => e.type === "DEVELOPMENT").id;
    stagingEnvId = environments.find((e: any) => e.type === "STAGING").id;
    prodEnvId = environments.find((e: any) => e.type === "PRODUCTION").id;
  })
  .afterAll(async () => {
    // Clean test data
    await DbHelper.cleanTestData();
    server.close();
    await db.disconnect();
  })

  .test("GET /api/v1/administration/statistics returns correct statistics counts scoped to developer", async () => {
    const res = await request(port, "GET", "/api/v1/administration/statistics", undefined, {
      "x-developer-id": mainDevId,
    });

    if (res.status !== 200) {
      console.error("DEBUG: Statistics retrieval failed", JSON.stringify(res.body));
    }

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.applications, 1);
    assert.equal(res.body.data.environments, 3); // DEV, STAGING, PROD
    assert.equal(res.body.data.organizations, 1);
    assert.equal(res.body.data.organizationMembers, 1); // Only mainDev is member initially
    assert.equal(res.body.data.apiKeys, 6); // 2 keys per environment * 3 environments
    assert.equal(res.body.data.invitations, 0);
  })

  .test("GET /api/v1/administration/statistics for unassociated developer returns zero counts", async () => {
    const res = await request(port, "GET", "/api/v1/administration/statistics", undefined, {
      "x-developer-id": otherDevId,
    });

    if (res.status !== 200) {
      console.error("DEBUG: Stats for other developer failed", JSON.stringify(res.body));
    }

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.applications, 0);
    assert.equal(res.body.data.environments, 0);
    assert.equal(res.body.data.organizations, 0);
    assert.equal(res.body.data.organizationMembers, 0);
    assert.equal(res.body.data.apiKeys, 0);
  })

  .test("GET /api/v1/administration/developers lists other developers in organizations", async () => {
    // Invite other developer to Stark Industries to establish a relationship
    const inviteRes = await request(port, "POST", `/api/v1/organizations/${orgId}/invitations`, {
      email: otherDevEmail,
      role: "DEVELOPER",
    }, {
      "x-developer-id": mainDevId,
    });
    if (inviteRes.status !== 201) {
      console.error("DEBUG: Invitation failed", JSON.stringify(inviteRes.body));
    }

    // Accept invitation as other developer
    const invitationsRes = await request(port, "GET", `/api/v1/organizations/${orgId}/invitations`, undefined, {
      "x-developer-id": mainDevId,
    });
    const invitationToken = invitationsRes.body.data[0].token;

    const acceptRes = await request(port, "POST", `/api/v1/invitations/${invitationToken}/accept`, undefined, {
      "x-developer-id": otherDevId,
    });
    if (acceptRes.status !== 200) {
      console.error("DEBUG: Accept invitation failed", JSON.stringify(acceptRes.body));
    }

    // Query developers administration endpoint
    const res = await request(port, "GET", "/api/v1/administration/developers?page=1&limit=5", undefined, {
      "x-developer-id": mainDevId,
    });

    if (res.status !== 200) {
      console.error("DEBUG: List developers failed", JSON.stringify(res.body));
    }

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.length >= 2); // Both mainDev and otherDev
    assert.ok(res.body.meta.pagination);
    assert.equal(res.body.meta.pagination.page, 1);
    assert.equal(res.body.meta.pagination.limit, 5);

    // Test Search query parameter
    const searchRes = await request(port, "GET", `/api/v1/administration/developers?search=${otherDevEmail}`, undefined, {
      "x-developer-id": mainDevId,
    });
    assert.equal(searchRes.body.data.length, 1);
    assert.equal(searchRes.body.data[0].email, otherDevEmail);
  })

  .test("GET /api/v1/administration/applications supports searching, filtering, and pagination", async () => {
    const res = await request(port, "GET", "/api/v1/administration/applications?limit=2&sortBy=name&sortOrder=asc", undefined, {
      "x-developer-id": mainDevId,
    });

    if (res.status !== 200) {
      console.error("DEBUG: List apps failed", JSON.stringify(res.body));
    }

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.length, 1); // 1 app created
    assert.ok(res.body.data[0].name.startsWith("Jarvis AI System"));
    assert.ok(res.body.meta.pagination);

    // Search matches app name
    const searchRes = await request(port, "GET", "/api/v1/administration/applications?search=jarvis", undefined, {
      "x-developer-id": mainDevId,
    });
    assert.equal(searchRes.body.data.length, 1);

    // Search does not match
    const missRes = await request(port, "GET", "/api/v1/administration/applications?search=nonexistent", undefined, {
      "x-developer-id": mainDevId,
    });
    assert.equal(missRes.body.data.length, 0);
  })

  .test("GET /api/v1/administration/organizations supports searching, filtering, and pagination", async () => {
    const res = await request(port, "GET", "/api/v1/administration/organizations?search=stark", undefined, {
      "x-developer-id": mainDevId,
    });

    if (res.status !== 200) {
      console.error("DEBUG: List organizations failed", JSON.stringify(res.body));
    }

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.length, 1);
    assert.ok(res.body.data[0].name.startsWith("Stark Industries"));
  })

  .test("GET /api/v1/administration/audit-logs/organization-activities supports filtering and pagination", async () => {
    const res = await request(port, "GET", "/api/v1/administration/audit-logs/organization-activities", undefined, {
      "x-developer-id": mainDevId,
    });

    if (res.status !== 200) {
      console.error("DEBUG: List activities failed", JSON.stringify(res.body));
    }

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    // There should be some activity logs from creating org, inviting member, accepting, etc.
    assert.ok(res.body.data.length >= 2);
    assert.ok(res.body.meta.pagination);

    // Filter by organizationId
    const filteredRes = await request(
      port,
      "GET",
      `/api/v1/administration/audit-logs/organization-activities?organizationId=${orgId}`,
      undefined,
      { "x-developer-id": mainDevId }
    );
    assert.equal(filteredRes.body.data[0].organizationId, orgId);
  })

  .test("GET and PATCH /api/v1/administration/settings/:environmentId manages environment configurations", async () => {
    // 1. Get Settings
    const getRes = await request(port, "GET", `/api/v1/administration/settings/${devEnvId}`, undefined, {
      "x-developer-id": mainDevId,
    });

    if (getRes.status !== 200) {
      console.error("DEBUG: Get settings failed", JSON.stringify(getRes.body));
    }

    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.success, true);
    assert.equal(getRes.body.data.jwtAccessTokenLifetime, 900); // Default value

    // 2. Patch Settings
    const patchRes = await request(port, "PATCH", `/api/v1/administration/settings/${devEnvId}`, {
      jwtAccessTokenLifetime: 1800,
      emailVerificationRequired: false,
    }, {
      "x-developer-id": mainDevId,
    });

    if (patchRes.status !== 200) {
      console.error("DEBUG: Patch settings failed", JSON.stringify(patchRes.body));
    }

    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.success, true);
    assert.equal(patchRes.body.data.jwtAccessTokenLifetime, 1800);
    assert.equal(patchRes.body.data.emailVerificationRequired, false);

    // 3. Verify get retrieves updated values
    const getUpdatedRes = await request(port, "GET", `/api/v1/administration/settings/${devEnvId}`, undefined, {
      "x-developer-id": mainDevId,
    });
    assert.equal(getUpdatedRes.body.data.jwtAccessTokenLifetime, 1800);
  })

  .test("GET and PATCH settings validates developer access boundaries", async () => {
    // Another developer should be forbidden to get Stark Industries' dev env settings
    // Stark Industries now has otherDev as a member, so otherDev actually DOES have access.
    // Let's register a third developer that is not a member of Stark Industries
    const thirdDevEmail = `test-dev-admin-third-${uniqueTag}@example.com`;
    const regResThird = await request(port, "POST", "/api/v1/developers/register", {
      email: thirdDevEmail,
      password: "Password123!_AdminThird",
    });
    const thirdDevId = regResThird.body.data.id;

    const getRes = await request(port, "GET", `/api/v1/administration/settings/${devEnvId}`, undefined, {
      "x-developer-id": thirdDevId,
    });
    assert.equal(getRes.status, 403);

    const patchRes = await request(port, "PATCH", `/api/v1/administration/settings/${devEnvId}`, {
      jwtAccessTokenLifetime: 2400,
    }, {
      "x-developer-id": thirdDevId,
    });
    assert.equal(patchRes.status, 403);
  });

export { runner };
