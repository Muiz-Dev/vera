import http from "http";
import express from "express";
import app, { ModuleRegistry } from "../../src/app";
import { db, ResponseFormatter, requestContextMiddleware, errorHandlerMiddleware } from "../../src/core";
import { RequestContext } from "../../src/core/http/context/request-context";
import { TestRunner } from "../runner/test-runner";
import { request } from "../runner/http";
import { assert } from "../runner/assertion";
import { DbHelper } from "../fixtures/db-helper";
import { EventBus } from "../../src/core/events/event.bus";
import { TokenService } from "../../src/modules/authentication/services/token.service";
import { authorizationService, requireAuthentication, requirePermission, requireRole } from "../../src/modules/authorization";

const runner = new TestRunner("Authorization Module Integration Suite");
let server: http.Server;
let port: number;
let tenant: { environmentId: string };

const eventsLogged: { eventName: string; payload: any }[] = [];
const tokenService = new TokenService();

function setupEventTracking() {
  eventsLogged.length = 0;
  const events = [
    "RoleCreated",
    "RoleUpdated",
    "RoleDeleted",
    "PermissionCreated",
    "PermissionAssigned",
    "PermissionRevoked",
    "RoleAssigned",
    "RoleRemoved",
    "AuthorizationEvaluated",
  ];

  for (const name of events) {
    EventBus.subscribe(name, (event) => {
      eventsLogged.push({ eventName: name, payload: event.payload });
    });
  }
}

// Local helper to automatically inject tenant context into HTTP requests
async function tenantRequest(method: string, path: string, body?: any, headers: Record<string, string> = {}) {
  return request(port, method, path, body, {
    "x-environment-id": tenant.environmentId,
    ...headers,
  });
}

// Global variables for tests
let testIdentityId: string;
let testAccessToken: string;
let adminAccessToken: string;

runner
  .beforeAll(async () => {
    await db.connect();
    await ModuleRegistry.initialize();

    // Clean any prior test data
    await DbHelper.cleanTestData();

    // Spawn test tenant (Developer, Application, Environment)
    tenant = await DbHelper.setupTestTenant();

    // Setup event tracking
    EventBus.clearAll();
    setupEventTracking();

    await new Promise<void>((resolve, reject) => {
      RequestContext.run({
        requestId: "setup",
        correlationId: "setup-correlation",
        environmentId: tenant.environmentId,
      }, async () => {
        try {
          // Create a test identity (regular user)
          const identity = await db.client.identity.create({
            data: {
              environmentId: tenant.environmentId,
              email: "test-authz-user@example.com",
              status: "ACTIVE",
            },
          });
          testIdentityId = identity.id;

          // Generate access token for the test identity
          testAccessToken = tokenService.signAccessToken({
            sub: identity.id,
            email: identity.email,
            environmentId: tenant.environmentId,
          });

          // Create an administrator identity (for admin endpoint testing)
          const adminIdentity = await db.client.identity.create({
            data: {
              environmentId: tenant.environmentId,
              email: "test-authz-admin@example.com",
              status: "ACTIVE",
            },
          });

          // Find administrator role
          const adminRole = await db.client.role.findFirst({
            where: { slug: "administrator", environmentId: tenant.environmentId },
          });
          assert.ok(adminRole, "Administrator role should have been seeded during bootstrapping.");

          // Assign administrator role to adminIdentity
          await db.client.identityRole.create({
            data: {
              identityId: adminIdentity.id,
              roleId: adminRole!.id,
            },
          });

          // Generate administrator access token
          adminAccessToken = tokenService.signAccessToken({
            sub: adminIdentity.id,
            email: adminIdentity.email,
            environmentId: tenant.environmentId,
          });

          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });

    // Create an isolated test sub-app to cleanly test routes and middlewares with our global error handler
    const testApp = express();
    testApp.use(express.json());
    testApp.use(requestContextMiddleware);

    // Apply global environment resolver middleware
    const { environmentResolverMiddleware } = await import("../../src/core/middleware/environment.middleware");
    testApp.use(environmentResolverMiddleware);

    // Add dummy protected routes for middleware verification
    testApp.get("/api/test-protected-route", requireAuthentication, (req, res) => {
      ResponseFormatter.success(res, { message: "Authenticated!", auth: req.auth });
    });

    testApp.get("/api/test-role-protected-route", requireAuthentication, requireRole("test-role-slug"), (req, res) => {
      ResponseFormatter.success(res, { message: "Role Allowed!" });
    });

    testApp.get("/api/test-perm-protected-route", requireAuthentication, requirePermission("test.resource.action"), (req, res) => {
      ResponseFormatter.success(res, { message: "Permission Allowed!" });
    });

    // Mount our main application routes on testApp
    testApp.use(app);

    // Mount global error handler at the end of the testApp
    testApp.use(errorHandlerMiddleware);

    // Start server on dynamic port using our testApp orchestrator
    server = http.createServer(testApp);
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
    // Clean test data
    await DbHelper.cleanTestData();
    server.close();
    await db.disconnect();
  })
  .test("Role & Permission bootstrapping validation", async () => {
    await new Promise<void>((resolve, reject) => {
      RequestContext.run({
        requestId: "test",
        correlationId: "test-correlation",
        environmentId: tenant.environmentId,
      }, async () => {
        try {
          // Verify system roles exist
          const ownerRole = await db.client.role.findFirst({ where: { slug: "owner", environmentId: tenant.environmentId } });
          const adminRole = await db.client.role.findFirst({ where: { slug: "administrator", environmentId: tenant.environmentId } });
          const systemRole = await db.client.role.findFirst({ where: { slug: "system", environmentId: tenant.environmentId } });

          assert.ok(ownerRole);
          assert.ok(adminRole);
          assert.ok(systemRole);

          assert.equal(ownerRole!.isSystem, true);
          assert.equal(adminRole!.isSystem, true);
          assert.equal(systemRole!.isSystem, true);

          // Verify system permissions exist
          const readRolesPerm = await db.client.permission.findFirst({ where: { name: "authorization.roles.read", environmentId: tenant.environmentId } });
          assert.ok(readRolesPerm);
          assert.equal(readRolesPerm!.isSystem, true);

          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  })
  .test("API: POST /api/v1/roles creates custom role successfully", async () => {
    const payload = {
      name: "Test Role Name",
      slug: "test-role-slug",
      description: "A custom role for testing",
    };

    const res = await tenantRequest("POST", "/api/v1/roles", payload, {
      Authorization: `Bearer ${adminAccessToken}`,
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.name, "Test Role Name");
    assert.equal(res.body.data.slug, "test-role-slug");
    assert.equal(res.body.data.isSystem, false);

    // Verify database record
    const dbRole = await db.client.role.findFirst({ where: { slug: "test-role-slug", environmentId: tenant.environmentId } });
    assert.ok(dbRole);

    // Verify Event
    const event = eventsLogged.find(e => e.eventName === "RoleCreated" && e.payload.roleSlug === "test-role-slug");
    assert.ok(event);
  })
  .test("API: POST /api/v1/roles rejects duplicates", async () => {
    const payload = {
      name: "Test Role Name Duplicate",
      slug: "test-role-slug", // duplicate slug
    };

    const res = await tenantRequest("POST", "/api/v1/roles", payload, {
      Authorization: `Bearer ${adminAccessToken}`,
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.message.includes("already exists"));
  })
  .test("API: PATCH /api/v1/roles/:id updates role metadata", async () => {
    const dbRole = await db.client.role.findFirst({ where: { slug: "test-role-slug", environmentId: tenant.environmentId } });
    assert.ok(dbRole);

    const payload = {
      name: "Test Role Updated Name",
      description: "An updated description",
    };

    const res = await tenantRequest("PATCH", `/api/v1/roles/${dbRole!.id}`, payload, {
      Authorization: `Bearer ${adminAccessToken}`,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.name, "Test Role Updated Name");
    assert.equal(res.body.data.description, "An updated description");

    // Verify Event
    const event = eventsLogged.find(e => e.eventName === "RoleUpdated" && e.payload.roleId === dbRole!.id);
    assert.ok(event);
  })
  .test("API: PATCH /api/v1/roles/:id prevents updating system reserved roles", async () => {
    const adminRole = await db.client.role.findFirst({ where: { slug: "administrator", environmentId: tenant.environmentId } });
    assert.ok(adminRole);

    const res = await tenantRequest("PATCH", `/api/v1/roles/${adminRole!.id}`, {
      name: "Malicious Rename",
    }, {
      Authorization: `Bearer ${adminAccessToken}`,
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.message.toLowerCase().includes("system reserved"));
  })
  .test("API: DELETE /api/v1/roles/:id prevents deleting system reserved roles", async () => {
    const adminRole = await db.client.role.findFirst({ where: { slug: "administrator", environmentId: tenant.environmentId } });
    assert.ok(adminRole);

    const res = await tenantRequest("DELETE", `/api/v1/roles/${adminRole!.id}`, undefined, {
      Authorization: `Bearer ${adminAccessToken}`,
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.message.toLowerCase().includes("system reserved"));
  })
  .test("API: POST /api/v1/permissions creates custom permission successfully", async () => {
    const payload = {
      name: "test.resource.action",
      displayName: "Test Custom Action",
      description: "Test permission representation",
    };

    const res = await tenantRequest("POST", "/api/v1/permissions", payload, {
      Authorization: `Bearer ${adminAccessToken}`,
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.name, "test.resource.action");

    // Verify event
    const event = eventsLogged.find(e => e.eventName === "PermissionCreated" && e.payload.permissionName === "test.resource.action");
    assert.ok(event);
  })
  .test("API: POST /api/v1/permissions enforces strict domain.resource.action validation pattern", async () => {
    const payload = {
      name: "invalid_format_permission",
      displayName: "Malformed Name",
    };

    const res = await tenantRequest("POST", "/api/v1/permissions", payload, {
      Authorization: `Bearer ${adminAccessToken}`,
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.details.name.includes("domain.resource.action"));
  })
  .test("API: POST /api/v1/role-permissions/:roleId assigns permission to role", async () => {
    const dbRole = await db.client.role.findFirst({ where: { slug: "test-role-slug", environmentId: tenant.environmentId } });
    const dbPerm = await db.client.permission.findFirst({ where: { name: "test.resource.action", environmentId: tenant.environmentId } });

    assert.ok(dbRole);
    assert.ok(dbPerm);

    const res = await tenantRequest("POST", `/api/v1/role-permissions/${dbRole!.id}`, {
      permissionId: dbPerm!.id,
    }, {
      Authorization: `Bearer ${adminAccessToken}`,
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);

    // Verify DB entry
    const count = await db.client.rolePermission.count({
      where: { roleId: dbRole!.id, permissionId: dbPerm!.id },
    });
    assert.equal(count, 1);

    // Verify event
    const event = eventsLogged.find(e => e.eventName === "PermissionAssigned" && e.payload.roleId === dbRole!.id);
    assert.ok(event);
  })
  .test("API: POST /api/v1/identity-roles/:identityId assigns role to identity", async () => {
    const dbRole = await db.client.role.findFirst({ where: { slug: "test-role-slug", environmentId: tenant.environmentId } });
    assert.ok(dbRole);

    const res = await tenantRequest("POST", `/api/v1/identity-roles/${testIdentityId}`, {
      roleId: dbRole!.id,
    }, {
      Authorization: `Bearer ${adminAccessToken}`,
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);

    // Verify DB entry
    const count = await db.client.identityRole.count({
      where: { identityId: testIdentityId, roleId: dbRole!.id },
    });
    assert.equal(count, 1);

    // Verify event
    const event = eventsLogged.find(e => e.eventName === "RoleAssigned" && e.payload.identityId === testIdentityId);
    assert.ok(event);
  })
  .test("API: GET /api/v1/identity-roles/:identityId/permissions returns resolved claims", async () => {
    const res = await tenantRequest("GET", `/api/v1/identity-roles/${testIdentityId}/permissions`, undefined, {
      Authorization: `Bearer ${adminAccessToken}`,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.roles.includes("test-role-slug"));
    assert.ok(res.body.data.permissions.includes("test.resource.action"));
  })
  .test("Middleware: requireAuthentication populates req.auth and AsyncLocalStorage context", async () => {
    const res = await tenantRequest("GET", "/api/test-protected-route", undefined, {
      Authorization: `Bearer ${testAccessToken}`,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.auth.identityId, testIdentityId);
    assert.ok(res.body.data.auth.roles.includes("test-role-slug"));
    assert.ok(res.body.data.auth.permissions.includes("test.resource.action"));
  })
  .test("Middleware: requireRole blocks unassigned users and allows assigned users", async () => {
    // 1. Regular user has "test-role-slug" - should pass
    const passRes = await tenantRequest("GET", "/api/test-role-protected-route", undefined, {
      Authorization: `Bearer ${testAccessToken}`,
    });
    assert.equal(passRes.status, 200);
    assert.equal(passRes.body.success, true);

    // 2. We assign a different non-existent role check to the endpoint (handled by our testing setup where we create a brand new user without roles)
    let emptyIdentity: any;
    await new Promise<void>((resolve, reject) => {
      RequestContext.run({
        requestId: "test",
        correlationId: "test-correlation",
        environmentId: tenant.environmentId,
      }, async () => {
        try {
          emptyIdentity = await db.client.identity.create({
            data: {
              environmentId: tenant.environmentId,
              email: "test-authz-empty@example.com",
              status: "ACTIVE",
            },
          });
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });

    const emptyToken = tokenService.signAccessToken({
      sub: emptyIdentity.id,
      email: emptyIdentity.email,
      environmentId: tenant.environmentId,
    });

    const failRes = await tenantRequest("GET", "/api/test-role-protected-route", undefined, {
      Authorization: `Bearer ${emptyToken}`,
    });

    assert.equal(failRes.status, 403);
    assert.equal(failRes.body.success, false);
    assert.ok(failRes.body.error.message.includes("required role"));
  })
  .test("Middleware: requirePermission blocks and allows correctly", async () => {
    // 1. Direct Service Check to verify event publishing
    await new Promise<void>((resolve, reject) => {
      RequestContext.run({
        requestId: "test",
        correlationId: "test-correlation",
        environmentId: tenant.environmentId,
      }, async () => {
        try {
          const hasPerm = await authorizationService.hasPermission(testIdentityId, "test.resource.action");
          assert.equal(hasPerm, true);

          const evalEvent = eventsLogged.find(e => e.eventName === "AuthorizationEvaluated" && e.payload.identityId === testIdentityId);
          assert.ok(evalEvent);
          assert.equal(evalEvent!.payload.decision, "GRANT");
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });

    // 2. Regular user has permission "test.resource.action" - should pass
    const passRes = await tenantRequest("GET", "/api/test-perm-protected-route", undefined, {
      Authorization: `Bearer ${testAccessToken}`,
    });
    assert.equal(passRes.status, 200);
    assert.equal(passRes.body.success, true);

    // 3. User without role should fail
    let emptyIdentity: any;
    await new Promise<void>((resolve, reject) => {
      RequestContext.run({
        requestId: "test",
        correlationId: "test-correlation",
        environmentId: tenant.environmentId,
      }, async () => {
        try {
          emptyIdentity = await db.client.identity.create({
            data: {
              environmentId: tenant.environmentId,
              email: "test-authz-empty2@example.com",
              status: "ACTIVE",
            },
          });
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });

    const emptyToken = tokenService.signAccessToken({
      sub: emptyIdentity.id,
      email: emptyIdentity.email,
      environmentId: tenant.environmentId,
    });

    const failRes = await tenantRequest("GET", "/api/test-perm-protected-route", undefined, {
      Authorization: `Bearer ${emptyToken}`,
    });

    assert.equal(failRes.status, 403);
    assert.equal(failRes.body.success, false);
    assert.ok(failRes.body.error.message.includes("required permission"));
  })
  .test("API: DELETE /api/v1/role-permissions/:roleId/:permissionId revokes permission", async () => {
    const dbRole = await db.client.role.findFirst({ where: { slug: "test-role-slug", environmentId: tenant.environmentId } });
    const dbPerm = await db.client.permission.findFirst({ where: { name: "test.resource.action", environmentId: tenant.environmentId } });

    const res = await tenantRequest("DELETE", `/api/v1/role-permissions/${dbRole!.id}/${dbPerm!.id}`, undefined, {
      Authorization: `Bearer ${adminAccessToken}`,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const count = await db.client.rolePermission.count({
      where: { roleId: dbRole!.id, permissionId: dbPerm!.id },
    });
    assert.equal(count, 0);

    // Verify event
    const event = eventsLogged.find(e => e.eventName === "PermissionRevoked" && e.payload.roleId === dbRole!.id);
    assert.ok(event);
  })
  .test("API: DELETE /api/v1/identity-roles/:identityId/:roleId removes role", async () => {
    const dbRole = await db.client.role.findFirst({ where: { slug: "test-role-slug", environmentId: tenant.environmentId } });

    const res = await tenantRequest("DELETE", `/api/v1/identity-roles/${testIdentityId}/${dbRole!.id}`, undefined, {
      Authorization: `Bearer ${adminAccessToken}`,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const count = await db.client.identityRole.count({
      where: { identityId: testIdentityId, roleId: dbRole!.id },
    });
    assert.equal(count, 0);

    // Verify event
    const event = eventsLogged.find(e => e.eventName === "RoleRemoved" && e.payload.identityId === testIdentityId);
    assert.ok(event);
  })
  .test("API: DELETE /api/v1/roles/:id performs soft delete successfully", async () => {
    const dbRole = await db.client.role.findFirst({ where: { slug: "test-role-slug", environmentId: tenant.environmentId } });
    assert.ok(dbRole);

    await new Promise<void>((resolve, reject) => {
      RequestContext.run({
        requestId: "test",
        correlationId: "test-correlation",
        environmentId: tenant.environmentId,
      }, async () => {
        try {
          // Re-assign role to testIdentityId for soft delete claim exclusion test
          await authorizationService.assignRole(testIdentityId, dbRole!.id);
          const hasRoleBefore = await authorizationService.hasRole(testIdentityId, "test-role-slug");
          assert.equal(hasRoleBefore, true);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });

    const res = await tenantRequest("DELETE", `/api/v1/roles/${dbRole!.id}`, undefined, {
      Authorization: `Bearer ${adminAccessToken}`,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.deletedAt);

    await new Promise<void>((resolve, reject) => {
      RequestContext.run({
        requestId: "test",
        correlationId: "test-correlation",
        environmentId: tenant.environmentId,
      }, async () => {
        try {
          // Repository must not return soft deleted roles in effective claims
          const hasRoleAfter = await authorizationService.hasRole(testIdentityId, "test-role-slug");
          assert.equal(hasRoleAfter, false);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });

    // Verify event
    const event = eventsLogged.find(e => e.eventName === "RoleDeleted" && e.payload.roleId === dbRole!.id);
    assert.ok(event);
  })
  .test("Idempotent Bootstrapping Verification", async () => {
    const { RoleRepository } = await import("../../src/modules/authorization/repositories/role.repository");
    const { PermissionRepository } = await import("../../src/modules/authorization/repositories/permission.repository");
    const { AuthorizationBootstrap } = await import("../../src/modules/authorization/bootstrap/authorization.bootstrap");

    const roleRepo = new RoleRepository();
    const permRepo = new PermissionRepository();
    const bootstrap = new AuthorizationBootstrap(authorizationService, roleRepo, permRepo);

    // Call seed consecutively to simulate multiple container startups
    await bootstrap.seed();
    await bootstrap.seed();

    const systemRoles = await db.client.role.findMany({
      where: { isSystem: true, deletedAt: null, environmentId: tenant.environmentId },
    });

    // Count should be exactly 3 (owner, administrator, system)
    assert.equal(systemRoles.length, 3);
  })
  .test("Concurrency and Race Condition Prevention", async () => {
    const promises = Array.from({ length: 5 }).map(() =>
      tenantRequest("POST", "/api/v1/roles", {
        name: "Concurrent Unique Role",
        slug: "test-concurrent-slug",
      }, {
        Authorization: `Bearer ${adminAccessToken}`,
      })
    );

    const responses = await Promise.all(promises);

    const successes = responses.filter(r => r.status === 201);
    const conflicts = responses.filter(r => r.status === 400);

    // Database unique constraints guarantee exactly 1 succeeds, while others gracefully fail with 400 Bad Request
    assert.equal(successes.length, 1);
    assert.equal(conflicts.length, 4);
  })
  .test("Deep Cache Consistency and Invalidation", async () => {
    await new Promise<void>((resolve, reject) => {
      RequestContext.run({
        requestId: "test",
        correlationId: "test-correlation",
        environmentId: tenant.environmentId,
      }, async () => {
        try {
          // 1. Resolve effective permissions for our testIdentityId -> empty cache
          const initialClaims = await authorizationService.getEffectivePermissions(testIdentityId);
          assert.equal(initialClaims.permissions.includes("test.cache.perm"), false);

          // 2. Create custom role & permission
          const testRole = await authorizationService.createRole({ name: "Cache Role", slug: "test-cache-role" });
          const testPerm = await authorizationService.createPermission({
            name: "test.cache.perm",
            displayName: "Cache Permission",
          });

          // 3. Assign permission to role
          await authorizationService.assignPermission(testRole.id, testPerm.id);

          // 4. Assign role to identity -> invalidates cached permissions for testIdentityId
          await authorizationService.assignRole(testIdentityId, testRole.id);

          // 5. Query effective claims again -> must resolve immediately as true because of cache invalidation
          const updatedClaims = await authorizationService.getEffectivePermissions(testIdentityId);
          assert.equal(updatedClaims.permissions.includes("test.cache.perm"), true);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  })
  .test("Robust Failure and Standardized Validation Enforcements", async () => {
    // 1. Assign non-existent role -> 404
    const res1 = await tenantRequest("POST", `/api/v1/identity-roles/${testIdentityId}`, {
      roleId: "non-existent-role-id",
    }, {
      Authorization: `Bearer ${adminAccessToken}`,
    });
    assert.equal(res1.status, 404);
    assert.equal(res1.body.success, false);

    // 2. Assign non-existent permission -> 404
    const res2 = await tenantRequest("POST", "/api/v1/role-permissions/non-existent-role-id", {
      permissionId: "non-existent-perm-id",
    }, {
      Authorization: `Bearer ${adminAccessToken}`,
    });
    assert.equal(res2.status, 404);

    // 3. Malformed payload format on role creation -> 400 Zod failure
    const res3 = await tenantRequest("POST", "/api/v1/roles", {
      name: "", // empty name
      slug: "invalid slug with spaces",
    }, {
      Authorization: `Bearer ${adminAccessToken}`,
    });
    assert.equal(res3.status, 400);
    assert.equal(res3.body.success, false);
    assert.equal(res3.body.error.code, "ERR_VALIDATION_FAILED");
  });

export { runner };
