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
import { Permissions } from "../../src/core/constants/permissions";

const runner = new TestRunner("Notification Engine Module Integration Suite");
let server: http.Server;
let port: number;
let tenant: { environmentId: string };

const tokenService = new TokenService();

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
let testDeveloperId: string;
let testDeveloperEmail: string;

runner
  .beforeAll(async () => {
    await db.connect();

    // Clean any prior test data BEFORE initializing modules to ensure templates get seeded cleanly
    await db.client.notificationLog.deleteMany({});
    await db.client.notification.deleteMany({});
    await db.client.notificationTemplate.deleteMany({});

    // Reconstruct the entire platform event listeners and seed templates cleanly from clean state
    EventBus.clearAll();
    await ModuleRegistry.initialize();

    // Spawn test tenant (Developer, Application, Environment)
    tenant = await DbHelper.setupTestTenant();

    await new Promise<void>((resolve, reject) => {
      RequestContext.run({
        requestId: "setup-notif",
        correlationId: "setup-notif-correlation",
        environmentId: tenant.environmentId,
      }, async () => {
        try {
          // Create a regular test identity
          const identity = await db.client.identity.create({
            data: {
              environmentId: tenant.environmentId,
              email: "test-notif-user@example.com",
              status: "ACTIVE",
            },
          });
          testIdentityId = identity.id;

          testAccessToken = tokenService.signAccessToken({
            sub: identity.id,
            email: identity.email,
            environmentId: tenant.environmentId,
          });

          // Fetch the correct developer created in setupTestTenant
          const dev = await db.client.developer.findUnique({
            where: { id: tenant.developerId },
          });
          if (dev) {
            testDeveloperId = dev.id;
            testDeveloperEmail = dev.email;
          } else {
            const freshDev = await db.client.developer.create({
              data: {
                email: "test-notif-developer@example.com",
                password: "password123",
              },
            });
            testDeveloperId = freshDev.id;
            testDeveloperEmail = freshDev.email;
          }

          // Create an administrator identity
          const adminIdentity = await db.client.identity.create({
            data: {
              environmentId: tenant.environmentId,
              email: "test-notif-admin@example.com",
              status: "ACTIVE",
            },
          });

          const adminRole = await db.client.role.findFirst({
            where: { slug: "administrator", environmentId: tenant.environmentId },
          });
          assert.ok(adminRole, "Admin role must exist");

          // Seed Notification Permissions in this Environment
          const notifPerms = [
            { name: Permissions.NOTIFICATION_READ, displayName: "Read Notifications" },
            { name: Permissions.NOTIFICATION_SEND, displayName: "Send Notifications" },
            { name: Permissions.NOTIFICATION_TEMPLATE_READ, displayName: "Read Templates" },
            { name: Permissions.NOTIFICATION_TEMPLATE_WRITE, displayName: "Write Templates" },
          ];

          for (const perm of notifPerms) {
            const pRecord = await db.client.permission.upsert({
              where: { environmentId_name: { environmentId: tenant.environmentId, name: perm.name } },
              update: {},
              create: {
                environmentId: tenant.environmentId,
                name: perm.name,
                displayName: perm.displayName,
                isSystem: false,
              },
            });

            // Grant permission to admin role
            await db.client.rolePermission.upsert({
              where: { roleId_permissionId: { roleId: adminRole!.id, permissionId: pRecord.id } },
              update: {},
              create: {
                roleId: adminRole!.id,
                permissionId: pRecord.id,
              },
            });
          }

          // Assign administrator role to adminIdentity
          await db.client.identityRole.create({
            data: {
              identityId: adminIdentity.id,
              roleId: adminRole!.id,
            },
          });

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

    const testApp = express();
    testApp.use(express.json());
    testApp.use(requestContextMiddleware);

    const { environmentResolverMiddleware } = await import("../../src/core/middleware/environment.middleware");
    testApp.use(environmentResolverMiddleware);

    // Mount application routes
    testApp.use(app);
    testApp.use(errorHandlerMiddleware);

    server = http.createServer(testApp);
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
    // Cleanup notifications/templates
    await db.client.notificationLog.deleteMany({});
    await db.client.notification.deleteMany({});
    await db.client.notificationTemplate.deleteMany({});
    await DbHelper.cleanTestData();
    server.close();
    await db.disconnect();
  })
  .test("Verification of seeded notification templates", async () => {
    const res = await tenantRequest("GET", "/api/v1/notification-templates", undefined, {
      Authorization: `Bearer ${adminAccessToken}`,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.length >= 10); // 9 original templates + 1 Organization Created

    const names = res.body.data.map((t: any) => t.name);
    assert.ok(names.includes("Welcome Email"));
    assert.ok(names.includes("Email Verification"));
    assert.ok(names.includes("Password Reset"));
    assert.ok(names.includes("Login Security Alert"));
    assert.ok(names.includes("Organization Created"));
  })
  .test("Permission Verification: unauthorized and regular users are rejected", async () => {
    // 1. GET /api/v1/notifications without authorization -> 401
    const res1 = await tenantRequest("GET", "/api/v1/notifications");
    assert.equal(res1.status, 401);

    // 2. GET /api/v1/notifications with regular token but missing notification.read -> 403
    const res2 = await tenantRequest("GET", "/api/v1/notifications", undefined, {
      Authorization: `Bearer ${testAccessToken}`,
    });
    assert.equal(res2.status, 403);

    // 3. POST /api/v1/notification-templates with regular token but missing template.write -> 403
    const res3 = await tenantRequest("POST", "/api/v1/notification-templates", {}, {
      Authorization: `Bearer ${testAccessToken}`,
    });
    assert.equal(res3.status, 403);
  })
  .test("API: POST /api/v1/notification-templates creates a custom template", async () => {
    const payload = {
      name: "Custom Test Email",
      subject: "Test Subject: {{customVar}}",
      htmlTemplate: "<p>Hello, {{customVar}}!</p>",
      textTemplate: "Hello, {{customVar}}!",
      variables: ["customVar"],
    };

    const res = await tenantRequest("POST", "/api/v1/notification-templates", payload, {
      Authorization: `Bearer ${adminAccessToken}`,
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.name, "Custom Test Email");
    assert.equal(res.body.data.subject, "Test Subject: {{customVar}}");
  })
  .test("API: PATCH /api/v1/notification-templates/:id updates an existing template", async () => {
    const template = await db.client.notificationTemplate.findUnique({
      where: { name: "Custom Test Email" },
    });
    assert.ok(template);

    const payload = {
      subject: "Updated Test Subject: {{customVar}}",
      enabled: false,
    };

    const res = await tenantRequest("PATCH", `/api/v1/notification-templates/${template!.id}`, payload, {
      Authorization: `Bearer ${adminAccessToken}`,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.subject, "Updated Test Subject: {{customVar}}");
    assert.equal(res.body.data.enabled, false);
  })
  .test("API: POST /api/v1/notifications/test sends email through provider and persists logs", async () => {
    // Re-enable Custom Test Email template
    const template = await db.client.notificationTemplate.findUnique({
      where: { name: "Custom Test Email" },
    });
    await db.client.notificationTemplate.update({
      where: { id: template!.id },
      data: { enabled: true },
    });

    const payload = {
      recipient: "recipient@example.com",
      templateName: "Custom Test Email",
      payload: { customVar: "Vera Developer" },
      provider: "mock",
    };

    const res = await tenantRequest("POST", "/api/v1/notifications/test", payload, {
      Authorization: `Bearer ${adminAccessToken}`,
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, "SENT");
    assert.equal(res.body.data.subject, "Updated Test Subject: Vera Developer");

    // Verify Notification and Logs saved in database
    const notif = await db.client.notification.findUnique({
      where: { id: res.body.data.id },
      include: { logs: true },
    });

    assert.ok(notif);
    assert.equal(notif!.status, "SENT");
    assert.equal(notif!.recipient, "recipient@example.com");
    assert.equal(notif!.logs.length, 1);
    assert.equal(notif!.logs[0].status, "SUCCESS");
  })
  .test("API: POST /api/v1/notifications/test rejects missing template variables", async () => {
    const payload = {
      recipient: "recipient@example.com",
      templateName: "Custom Test Email",
      payload: {}, // missing customVar
    };

    const res = await tenantRequest("POST", "/api/v1/notifications/test", payload, {
      Authorization: `Bearer ${adminAccessToken}`,
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.message.includes("Missing required template variables"));
  })
  .test("API: GET /api/v1/notifications lists all notifications and GET /api/v1/notifications/:id retrieves one", async () => {
    const listRes = await tenantRequest("GET", "/api/v1/notifications", undefined, {
      Authorization: `Bearer ${adminAccessToken}`,
    });

    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.success, true);
    assert.ok(listRes.body.data.length >= 1);

    const firstId = listRes.body.data[0].id;

    const getRes = await tenantRequest("GET", `/api/v1/notifications/${firstId}`, undefined, {
      Authorization: `Bearer ${adminAccessToken}`,
    });

    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.success, true);
    assert.equal(getRes.body.data.id, firstId);
    assert.ok(getRes.body.data.logs.length >= 1);
  })
  .test("API: DELETE /api/v1/notification-templates/:id deletes the template", async () => {
    const template = await db.client.notificationTemplate.findUnique({
      where: { name: "Custom Test Email" },
    });
    assert.ok(template);

    const res = await tenantRequest("DELETE", `/api/v1/notification-templates/${template!.id}`, undefined, {
      Authorization: `Bearer ${adminAccessToken}`,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const deleted = await db.client.notificationTemplate.findUnique({
      where: { id: template!.id },
    });
    assert.equal(deleted, null);
  })
  .test("EventBus Integration: DeveloperRegistered", async () => {
    const testEmail = `dev-registered-${Date.now()}@example.com`;

    // Create a real developer in DB first so foreign key constraints are satisfied!
    const realDeveloper = await db.client.developer.create({
      data: {
        email: testEmail,
        password: "secure_password",
      },
    });

    await EventBus.publish({
      eventName: "DeveloperRegistered",
      timestamp: new Date(),
      payload: {
        id: realDeveloper.id,
        email: testEmail,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const notif = await db.client.notification.findFirst({
      where: { recipient: testEmail, type: "Welcome Email" },
    });
    assert.ok(notif);
    assert.equal(notif!.status, "SENT");
    assert.equal(notif!.developerId, realDeveloper.id);
  })
  .test("EventBus Integration: ApplicationCreated", async () => {
    const appName = "Awesome Testing App 999";
    await EventBus.publish({
      eventName: "ApplicationCreated",
      timestamp: new Date(),
      payload: {
        id: "cuid-app-77",
        developerId: testDeveloperId,
        organizationId: null,
        name: appName,
        slug: "awesome-testing-app",
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const notif = await db.client.notification.findFirst({
      where: { recipient: testDeveloperEmail, type: "Application Created" },
    });
    assert.ok(notif);
    assert.equal(notif!.status, "SENT");
    assert.ok(notif!.subject.includes(appName));
  })
  .test("EventBus Integration: ApiKeyRotated", async () => {
    await EventBus.publish({
      eventName: "ApiKeyRotated",
      timestamp: new Date(),
      payload: {
        developerId: testDeveloperId,
        environmentId: "env-development-1",
        organizationId: null,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const notif = await db.client.notification.findFirst({
      where: { recipient: testDeveloperEmail, type: "API Key Rotated" },
    });
    assert.ok(notif);
    assert.equal(notif!.status, "SENT");
    // Verify variable replacement by looking at subject/payload instead of raw htmlTemplate
    assert.equal(notif!.payload.environmentId, "env-development-1");
  })
  .test("EventBus Integration: OrganizationCreated", async () => {
    const org = await db.client.organization.create({
      data: { name: "Acme Corp Created", slug: `acme-corp-cre-${Date.now()}` },
    });

    await EventBus.publish({
      eventName: "OrganizationCreated",
      timestamp: new Date(),
      payload: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        ownerId: testDeveloperId,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const notif = await db.client.notification.findFirst({
      where: { recipient: testDeveloperEmail, type: "Organization Created" },
    });
    assert.ok(notif);
    assert.equal(notif!.status, "SENT");
    assert.ok(notif!.subject.includes("Acme Corp Created"));
  })
  .test("EventBus Integration: MemberInvited", async () => {
    const testEmail = `invitee-member-${Date.now()}@example.com`;

    // Setup an organization & invitation in database so listener can load them
    const org = await db.client.organization.create({
      data: { name: "Invitor Inc", slug: `invitor-${Date.now()}` },
    });

    const invitation = await db.client.organizationInvitation.create({
      data: {
        organizationId: org.id,
        email: testEmail,
        role: "DEVELOPER",
        token: `tok-${Date.now()}`,
        invitedById: testDeveloperId,
        expiresAt: new Date(Date.now() + 360000),
      },
    });

    await EventBus.publish({
      eventName: "MemberInvited",
      timestamp: new Date(),
      payload: {
        organizationId: org.id,
        invitationId: invitation.id,
        email: testEmail,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const notif = await db.client.notification.findFirst({
      where: { recipient: testEmail, type: "Organization Invitation" },
    });
    assert.ok(notif);
    assert.equal(notif!.status, "SENT");
    assert.equal(notif!.payload.organizationName, "Invitor Inc");
  })
  .test("EventBus Integration: InvitationAccepted", async () => {
    // Verify an accepted invite notifies the admin/owner of the organization
    const adminDevId = testDeveloperId;
    const adminDevEmail = testDeveloperEmail;

    const org = await db.client.organization.create({
      data: { name: "Admins Corp", slug: `admins-corp-${Date.now()}` },
    });

    // Make the admin an owner of the organization in db
    await db.client.organizationMember.create({
      data: {
        organizationId: org.id,
        developerId: adminDevId,
        role: "OWNER",
      },
    });

    // The newly invited developer accepting the invite
    const invitee = await db.client.developer.create({
      data: { email: `invitee-acc-${Date.now()}@example.com`, password: "password123" },
    });

    const invitation = await db.client.organizationInvitation.create({
      data: {
        organizationId: org.id,
        email: invitee.email,
        role: "DEVELOPER",
        token: `tok-acc-${Date.now()}`,
        invitedById: adminDevId,
        expiresAt: new Date(Date.now() + 360000),
      },
    });

    await EventBus.publish({
      eventName: "InvitationAccepted",
      timestamp: new Date(),
      payload: {
        organizationId: org.id,
        invitationId: invitation.id,
        developerId: invitee.id,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Admin should get a notification
    const notif = await db.client.notification.findFirst({
      where: { recipient: adminDevEmail, type: "Invitation Accepted" },
    });
    assert.ok(notif);
    assert.equal(notif!.status, "SENT");
    assert.equal(notif!.payload.email, invitee.email);
  })
  .test("EventBus Integration: PasswordResetRequested", async () => {
    const testEmail = "test-notif-user@example.com";

    await EventBus.publish({
      eventName: "PasswordResetRequested",
      timestamp: new Date(),
      payload: {
        identityId: testIdentityId, // use real identity ID
        email: testEmail,
        token: "reset-token-abc",
        expiresAt: new Date(),
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const notif = await db.client.notification.findFirst({
      where: { recipient: testEmail, type: "Password Reset" },
    });
    assert.ok(notif);
    assert.equal(notif!.status, "SENT");
    assert.ok(notif!.payload.resetLink.includes("reset-token-abc"));
  })
  .test("EventBus Integration: EmailVerificationRequested", async () => {
    const testEmail = "test-notif-user@example.com";

    await EventBus.publish({
      eventName: "EmailVerificationRequested",
      timestamp: new Date(),
      payload: {
        identityId: testIdentityId, // use real identity ID
        email: testEmail,
        token: "verification-token-xyz",
        expiresAt: new Date(),
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const notif = await db.client.notification.findFirst({
      where: { recipient: testEmail, type: "Email Verification" },
    });
    assert.ok(notif);
    assert.equal(notif!.status, "SENT");
    assert.ok(notif!.payload.verificationLink.includes("verification-token-xyz"));
  })
  .test("EventBus Integration: SessionRevoked (Security Alert)", async () => {
    const testEmail = `sec-rev-${Date.now()}@example.com`;

    // Create identity so subscriber can query email address
    let identityId: string = "";
    await new Promise<void>((resolve, reject) => {
      RequestContext.run({
        requestId: "sec-rev-ctx",
        correlationId: "sec-rev-correlation",
        environmentId: tenant.environmentId,
      }, async () => {
        try {
          const identity = await db.client.identity.create({
            data: {
              environmentId: tenant.environmentId,
              email: testEmail,
              status: "ACTIVE",
            },
          });
          identityId = identity.id;
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });

    await EventBus.publish({
      eventName: "SessionRevoked",
      timestamp: new Date(),
      payload: {
        identityId,
        sessionId: "sess-99",
        reason: "Replay attack detected. Revoking complete session.",
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const notif = await db.client.notification.findFirst({
      where: { recipient: testEmail, type: "Login Security Alert" },
    });
    assert.ok(notif);
    assert.equal(notif!.status, "SENT");
    assert.equal(notif!.payload.reason, "Replay attack detected. Revoking complete session.");
  })
  .test("Retry mechanism on failing delivery", async () => {
    const customTemplate = await db.client.notificationTemplate.create({
      data: {
        name: "Failing Smtp Template",
        subject: "Failure test",
        htmlTemplate: "Failure text",
        textTemplate: "Failure text",
        variables: [],
      },
    });

    // Instantiate SmtpProvider with a closed port on localhost to guarantee failure
    const { SmtpProvider } = await import("../../src/modules/notification/providers/smtp.provider");
    const failingProvider = new SmtpProvider({
      host: "127.0.0.1",
      port: 1, // closed/invalid port
    });

    const { ProviderResolver } = await import("../../src/modules/notification/services/provider.resolver");
    const originalResolve = ProviderResolver.prototype.resolve;
    ProviderResolver.prototype.resolve = () => failingProvider;

    const { NotificationDispatcher } = await import("../../src/modules/notification/services/notification.dispatcher");
    const dispatcher = new NotificationDispatcher();

    const notifResult = await dispatcher.dispatch({
      recipient: "fail-test@example.com",
      templateName: "Failing Smtp Template",
      payload: {},
      provider: "smtp",
    });

    // Restore original resolver behavior
    ProviderResolver.prototype.resolve = originalResolve;

    assert.equal(notifResult.status, "FAILED");
    assert.equal(notifResult.retries, 3); // 3 retries (0 -> 1 -> 2 -> 3)

    const log = await db.client.notificationLog.findFirst({
      where: { notificationId: notifResult.id },
    });
    assert.ok(log);
    assert.equal(log!.status, "FAILED");

    // Clean up template
    await db.client.notificationTemplate.delete({ where: { id: customTemplate.id } });
  });

export { runner };
