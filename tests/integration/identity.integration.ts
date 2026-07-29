import http from "http";
import app, { ModuleRegistry } from "../../src/app";
import { db } from "../../src/core";
import { TestRunner } from "../runner/test-runner";
import { request } from "../runner/http";
import { assert } from "../runner/assertion";
import { DbHelper } from "../fixtures/db-helper";
import { EventBus } from "../../src/core/events/event.bus";

const runner = new TestRunner("Identity Module Integration Suite");
let server: http.Server;
let port: number;
let tenant: { environmentId: string };

const eventsLogged: { eventName: string; payload: any }[] = [];

function setupEventTracking() {
  eventsLogged.length = 0;
  EventBus.subscribe("IdentityCreated", (event) => {
    eventsLogged.push({ eventName: "IdentityCreated", payload: event.payload });
  });
  EventBus.subscribe("IdentityUpdated", (event) => {
    eventsLogged.push({ eventName: "IdentityUpdated", payload: event.payload });
  });
  EventBus.subscribe("IdentitySuspended", (event) => {
    eventsLogged.push({ eventName: "IdentitySuspended", payload: event.payload });
  });
  EventBus.subscribe("IdentityDeleted", (event) => {
    eventsLogged.push({ eventName: "IdentityDeleted", payload: event.payload });
  });
}

const testEmail = "test-integration-identity-user@example.com";
const testPhone = "+1991234567";

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
          resolve(3002);
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
  .test("POST /api/v1/identities fails validation if both email and phone are missing", async () => {
    const res = await tenantRequest("POST", "/api/v1/identities", {
      profile: { firstName: "Test" },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, "ERR_VALIDATION_FAILED");
  })
  .test("POST /api/v1/identities creates an identity and a profile in PENDING status, publishes event, and saves to DB", async () => {
    const payload = {
      email: testEmail,
      phone: testPhone,
      profile: {
        firstName: "Jules",
        lastName: "Verne",
        displayName: "julesverne",
        avatar: "https://example.com/avatar.png",
        metadata: { bio: "Novelist" },
      },
    };

    const res = await tenantRequest("POST", "/api/v1/identities", payload);
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.id);
    assert.equal(res.body.data.status, "PENDING");
    assert.equal(res.body.data.profile.firstName, "Jules");

    const identityId = res.body.data.id;

    // Verify programmatically in database
    const dbIdentity = await DbHelper.verifyIdentityExists(identityId);
    assert.equal(dbIdentity.email, testEmail);
    assert.equal(dbIdentity.phone, testPhone);
    assert.equal(dbIdentity.status, "PENDING");
    assert.equal(dbIdentity.profile.firstName, "Jules");
    assert.equal(dbIdentity.profile.metadata.bio, "Novelist");

    // Verify event published
    const event = eventsLogged.find(e => e.eventName === "IdentityCreated" && e.payload.id === identityId);
    assert.ok(event);
    assert.equal(event?.payload.email, testEmail);
  })
  .test("POST /api/v1/identities duplicate email results in rejection", async () => {
    const payload = {
      email: testEmail,
    };
    const res = await tenantRequest("POST", "/api/v1/identities", payload);
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.message.includes("already exists"));
  })
  .test("GET /api/v1/identities/{id} retrieves the correct identity", async () => {
    // Look up identityId from DB
    const identityRecord = await db.client.identity.findFirst({
      where: { email: testEmail, environmentId: tenant.environmentId },
    });
    assert.ok(identityRecord);

    const res = await tenantRequest("GET", `/api/v1/identities/${identityRecord!.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.id, identityRecord!.id);
    assert.equal(res.body.data.email, testEmail);
  })
  .test("PATCH /api/v1/identities/{id} updates identity and updates DB", async () => {
    const identityRecord = await db.client.identity.findFirst({
      where: { email: testEmail, environmentId: tenant.environmentId },
    });
    assert.ok(identityRecord);

    const updatePayload = {
      profile: {
        firstName: "Jules Updated",
        metadata: { bio: "Sci-fi writer" },
      },
    };

    const res = await tenantRequest("PATCH", `/api/v1/identities/${identityRecord!.id}`, updatePayload);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.profile.firstName, "Jules Updated");

    // Verify in database
    const dbIdentity = await DbHelper.verifyIdentityExists(identityRecord!.id);
    assert.equal(dbIdentity.profile.firstName, "Jules Updated");
    assert.equal(dbIdentity.profile.metadata.bio, "Sci-fi writer");

    // Verify event
    const event = eventsLogged.find(e => e.eventName === "IdentityUpdated" && e.payload.id === identityRecord!.id);
    assert.ok(event);
  })
  .test("POST /api/v1/identities/{id}/suspend with body suspends identity", async () => {
    const identityRecord = await db.client.identity.findFirst({
      where: { email: testEmail, environmentId: tenant.environmentId },
    });
    assert.ok(identityRecord);

    const res = await tenantRequest("POST", `/api/v1/identities/${identityRecord!.id}/suspend`, {
      reason: "Suspicious API patterns",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, "SUSPENDED");

    // Verify database
    const dbIdentity = await DbHelper.verifyIdentityExists(identityRecord!.id);
    assert.equal(dbIdentity.status, "SUSPENDED");

    // Verify event
    const event = eventsLogged.find(e => e.eventName === "IdentitySuspended" && e.payload.id === identityRecord!.id);
    assert.ok(event);
    assert.equal(event?.payload.reason, "Suspicious API patterns");
  })
  .test("POST /api/v1/identities/{id}/suspend double suspend rejects with 400", async () => {
    const identityRecord = await db.client.identity.findFirst({
      where: { email: testEmail, environmentId: tenant.environmentId },
    });
    assert.ok(identityRecord);

    const res = await tenantRequest("POST", `/api/v1/identities/${identityRecord!.id}/suspend`, {
      reason: "Another suspension",
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.message, "Identity is already suspended");
  })
  .test("POST /api/v1/identities/{id}/suspend without body / empty body applies default reason", async () => {
    // Create an active identity to suspend cleanly
    const freshPayload = {
      email: "test-integration-identity-clean@example.com",
    };
    const freshRes = await tenantRequest("POST", "/api/v1/identities", freshPayload);
    const freshId = freshRes.body.data.id;

    const res = await tenantRequest("POST", `/api/v1/identities/${freshId}/suspend`, {});
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const dbIdentity = await DbHelper.verifyIdentityExists(freshId);
    assert.equal(dbIdentity.status, "SUSPENDED");

    const event = eventsLogged.find(e => e.eventName === "IdentitySuspended" && e.payload.id === freshId);
    assert.ok(event);
    assert.equal(event?.payload.reason, "Suspended by administrator");
  })
  .test("DELETE /api/v1/identities/{id} soft deletes identity (sets deletedAt and status to DEACTIVATED)", async () => {
    const identityRecord = await db.client.identity.findFirst({
      where: { email: testEmail, environmentId: tenant.environmentId },
    });
    assert.ok(identityRecord);

    const res = await tenantRequest("DELETE", `/api/v1/identities/${identityRecord!.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, "DEACTIVATED");
    assert.ok(res.body.data.deletedAt);

    // Verify record still exists in DB but is marked as soft-deleted (status = DEACTIVATED and deletedAt is set)
    const rawDbRecord = await db.client.identity.findUnique({
      where: { id: identityRecord!.id },
    });
    assert.ok(rawDbRecord);
    assert.equal(rawDbRecord?.status, "DEACTIVATED");
    assert.ok(rawDbRecord?.deletedAt);

    // GET /api/v1/identities/{id} now fails with 404
    const getRes = await tenantRequest("GET", `/api/v1/identities/${identityRecord!.id}`);
    assert.equal(getRes.status, 404);

    // Verify event
    const event = eventsLogged.find(e => e.eventName === "IdentityDeleted" && e.payload.id === identityRecord!.id);
    assert.ok(event);
  });

export { runner };
