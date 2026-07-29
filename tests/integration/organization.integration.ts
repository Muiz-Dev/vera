import http from "http";
import app, { ModuleRegistry } from "../../src/app";
import { db } from "../../src/core";
import { TestRunner } from "../runner/test-runner";
import { request } from "../runner/http";
import { assert } from "../runner/assertion";
import { DbHelper } from "../fixtures/db-helper";

const runner = new TestRunner("Organization Engine Module Integration Suite");
let server: http.Server;
let port: number;

// We use test-dev-* emails so DbHelper cleans them up automatically
const ownerEmail = "test-dev-org-owner@example.com";
const adminEmail = "test-dev-org-admin@example.com";
const managerEmail = "test-dev-org-manager@example.com";
const devEmail = "test-dev-org-developer@example.com";
const viewerEmail = "test-dev-org-viewer@example.com";
const otherEmail = "test-dev-org-other@example.com";

const password = "Password123!_OrgEngine";

let ownerId: string;
let adminId: string;
let managerId: string;
let devId: string;
let viewerId: string;
let otherId: string;

let organizationId: string;
let invitationId: string;
let inviteToken: string;

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
          resolve(3006);
        }
      });
    });

    // Register all necessary developers using the active port
    const regOwner = await request(port, "POST", "/api/v1/developers/register", { email: ownerEmail, password });
    ownerId = regOwner.body.data.id;

    const regAdmin = await request(port, "POST", "/api/v1/developers/register", { email: adminEmail, password });
    adminId = regAdmin.body.data.id;

    const regManager = await request(port, "POST", "/api/v1/developers/register", { email: managerEmail, password });
    managerId = regManager.body.data.id;

    const regDev = await request(port, "POST", "/api/v1/developers/register", { email: devEmail, password });
    devId = regDev.body.data.id;

    const regViewer = await request(port, "POST", "/api/v1/developers/register", { email: viewerEmail, password });
    viewerId = regViewer.body.data.id;

    const regOther = await request(port, "POST", "/api/v1/developers/register", { email: otherEmail, password });
    otherId = regOther.body.data.id;
  })
  .afterAll(async () => {
    // Clean test data
    await DbHelper.cleanTestData();
    server.close();
    await db.disconnect();
  })
  .test("POST /api/v1/organizations creates an organization and sets owner successfully", async () => {
    const res = await request(port, "POST", "/api/v1/organizations", {
      name: "Acme Enterprise",
      slug: "acme-ent",
      description: "Enterprise workspace",
      website: "https://acme.example.com",
      metadata: { plan: "enterprise" },
    }, {
      "x-developer-id": ownerId,
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.id);
    assert.equal(res.body.data.name, "Acme Enterprise");
    assert.equal(res.body.data.slug, "acme-ent");
    assert.equal(res.body.data.members.length, 1);
    assert.equal(res.body.data.members[0].developerId, ownerId);
    assert.equal(res.body.data.members[0].role, "OWNER");

    organizationId = res.body.data.id;
  })
  .test("GET /api/v1/organizations lists organizations developer belongs to", async () => {
    const res = await request(port, "GET", "/api/v1/organizations", undefined, {
      "x-developer-id": ownerId,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.length >= 1);
    assert.equal(res.body.data[0].id, organizationId);

    // Other developers should not see this organization
    const resOther = await request(port, "GET", "/api/v1/organizations", undefined, {
      "x-developer-id": otherId,
    });
    assert.equal(resOther.status, 200);
    assert.equal(resOther.body.data.length, 0);
  })
  .test("GET /api/v1/organizations/:id retrieves organization details for member", async () => {
    const res = await request(port, "GET", `/api/v1/organizations/${organizationId}`, undefined, {
      "x-developer-id": ownerId,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.id, organizationId);
    assert.equal(res.body.data.members[0].developer.email, ownerEmail);

    // Non-member should be blocked
    const resOther = await request(port, "GET", `/api/v1/organizations/${organizationId}`, undefined, {
      "x-developer-id": otherId,
    });
    assert.equal(resOther.status, 403);
    assert.equal(resOther.body.success, false);
  })
  .test("POST /api/v1/organizations/:id/invitations allows owner/admins to invite developers", async () => {
    const res = await request(port, "POST", `/api/v1/organizations/${organizationId}/invitations`, {
      email: adminEmail,
      role: "ADMINISTRATOR",
    }, {
      "x-developer-id": ownerId,
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.id);
    assert.equal(res.body.data.email, adminEmail);
    assert.equal(res.body.data.role, "ADMINISTRATOR");
    assert.equal(res.body.data.status, "PENDING");
    assert.ok(res.body.data.token);

    invitationId = res.body.data.id;
    inviteToken = res.body.data.token;

    // Reject duplicate active invitation
    const resDup = await request(port, "POST", `/api/v1/organizations/${organizationId}/invitations`, {
      email: adminEmail,
      role: "ADMINISTRATOR",
    }, {
      "x-developer-id": ownerId,
    });
    assert.equal(resDup.status, 400);
  })
  .test("POST /api/v1/invitations/:token/accept allows invited developer to accept invitation", async () => {
    // Other developer cannot accept this invitation
    const resWrong = await request(port, "POST", `/api/v1/invitations/${inviteToken}/accept`, undefined, {
      "x-developer-id": otherId,
    });
    assert.equal(resWrong.status, 403);

    // Correct developer accepts invitation
    const resAccept = await request(port, "POST", `/api/v1/invitations/${inviteToken}/accept`, undefined, {
      "x-developer-id": adminId,
    });
    assert.equal(resAccept.status, 200);
    assert.equal(resAccept.body.success, true);

    // Check membership is updated
    const resMembers = await request(port, "GET", `/api/v1/organizations/${organizationId}/members`, undefined, {
      "x-developer-id": ownerId,
    });
    assert.equal(resMembers.status, 200);
    assert.equal(resMembers.body.data.length, 2);

    const joinedMember = resMembers.body.data.find((m: any) => m.developerId === adminId);
    assert.ok(joinedMember);
    assert.equal(joinedMember.role, "ADMINISTRATOR");
  })
  .test("ADMINISTRATOR can invite other members, who can join successfully", async () => {
    // Admin invites manager
    const resInvite = await request(port, "POST", `/api/v1/organizations/${organizationId}/invitations`, {
      email: managerEmail,
      role: "MANAGER",
    }, {
      "x-developer-id": adminId,
    });
    assert.equal(resInvite.status, 201);

    // Accept manager invite
    const acceptRes = await request(port, "POST", `/api/v1/invitations/${resInvite.body.data.token}/accept`, undefined, {
      "x-developer-id": managerId,
    });
    assert.equal(acceptRes.status, 200);

    // Admin invites developer
    const resInvite2 = await request(port, "POST", `/api/v1/organizations/${organizationId}/invitations`, {
      email: devEmail,
      role: "DEVELOPER",
    }, {
      "x-developer-id": adminId,
    });
    assert.equal(resInvite2.status, 201);

    // Accept developer invite
    const acceptRes2 = await request(port, "POST", `/api/v1/invitations/${resInvite2.body.data.token}/accept`, undefined, {
      "x-developer-id": devId,
    });
    assert.equal(acceptRes2.status, 200);

    // Admin invites viewer
    const resInvite3 = await request(port, "POST", `/api/v1/organizations/${organizationId}/invitations`, {
      email: viewerEmail,
      role: "VIEWER",
    }, {
      "x-developer-id": adminId,
    });
    assert.equal(resInvite3.status, 201);

    // Accept viewer invite
    const acceptRes3 = await request(port, "POST", `/api/v1/invitations/${resInvite3.body.data.token}/accept`, undefined, {
      "x-developer-id": viewerId,
    });
    assert.equal(acceptRes3.status, 200);
  })
  .test("PATCH /api/v1/organizations/:id enforces role permissions for updating organization settings", async () => {
    // MANAGER can update organization metadata/settings
    const resManager = await request(port, "PATCH", `/api/v1/organizations/${organizationId}`, {
      description: "Updated by Manager",
    }, {
      "x-developer-id": managerId,
    });
    assert.equal(resManager.status, 200);
    assert.equal(resManager.body.data.description, "Updated by Manager");

    // DEVELOPER cannot update settings
    const resDev = await request(port, "PATCH", `/api/v1/organizations/${organizationId}`, {
      description: "Updated by Developer",
    }, {
      "x-developer-id": devId,
    });
    assert.equal(resDev.status, 403);

    // VIEWER cannot update settings
    const resViewer = await request(port, "PATCH", `/api/v1/organizations/${organizationId}`, {
      description: "Updated by Viewer",
    }, {
      "x-developer-id": viewerId,
    });
    assert.equal(resViewer.status, 403);
  })
  .test("POST /api/v1/organizations/:id/invitations rejects invitations sent by DEVELOPER or VIEWER", async () => {
    const resDev = await request(port, "POST", `/api/v1/organizations/${organizationId}/invitations`, {
      email: otherEmail,
      role: "DEVELOPER",
    }, {
      "x-developer-id": devId,
    });
    assert.equal(resDev.status, 403);

    const resViewer = await request(port, "POST", `/api/v1/organizations/${organizationId}/invitations`, {
      email: otherEmail,
      role: "DEVELOPER",
    }, {
      "x-developer-id": viewerId,
    });
    assert.equal(resViewer.status, 403);
  })
  .test("DELETE /api/v1/organizations/:id/members/:developerId enforces hierarchy on member removal", async () => {
    // MANAGER cannot remove ADMINISTRATOR
    const resManagerOnAdmin = await request(port, "DELETE", `/api/v1/organizations/${organizationId}/members/${adminId}`, undefined, {
      "x-developer-id": managerId,
    });
    assert.equal(resManagerOnAdmin.status, 403);

    // ADMINISTRATOR cannot remove OWNER
    const resAdminOnOwner = await request(port, "DELETE", `/api/v1/organizations/${organizationId}/members/${ownerId}`, undefined, {
      "x-developer-id": adminId,
    });
    assert.equal(resAdminOnOwner.status, 403);

    // ADMINISTRATOR can remove DEVELOPER
    const resAdminOnDev = await request(port, "DELETE", `/api/v1/organizations/${organizationId}/members/${devId}`, undefined, {
      "x-developer-id": adminId,
    });
    assert.equal(resAdminOnDev.status, 200);

    // DEVELOPER can leave organization (remove themselves)
    // Let's re-invite and join devId first
    const reInvite = await request(port, "POST", `/api/v1/organizations/${organizationId}/invitations`, {
      email: devEmail,
      role: "DEVELOPER",
    }, {
      "x-developer-id": ownerId,
    });
    await request(port, "POST", `/api/v1/invitations/${reInvite.body.data.token}/accept`, undefined, {
      "x-developer-id": devId,
    });

    // Now developer removes themselves
    const resLeave = await request(port, "DELETE", `/api/v1/organizations/${organizationId}/members/${devId}`, undefined, {
      "x-developer-id": devId,
    });
    assert.equal(resLeave.status, 200);
  })
  .test("POST /api/v1/organizations/:id/transfer-ownership transfers organization ownership successfully", async () => {
    // Non-owner cannot transfer ownership
    const resWrong = await request(port, "POST", `/api/v1/organizations/${organizationId}/transfer-ownership`, {
      developerId: adminId,
    }, {
      "x-developer-id": adminId,
    });
    assert.equal(resWrong.status, 403);

    // OWNER transfers ownership to ADMINISTRATOR (adminId)
    const resTransfer = await request(port, "POST", `/api/v1/organizations/${organizationId}/transfer-ownership`, {
      developerId: adminId,
    }, {
      "x-developer-id": ownerId,
    });
    assert.equal(resTransfer.status, 200);

    // Verify roles: previous OWNER is now ADMINISTRATOR, and target is now OWNER
    const resMembers = await request(port, "GET", `/api/v1/organizations/${organizationId}/members`, undefined, {
      "x-developer-id": adminId,
    });
    const previousOwner = resMembers.body.data.find((m: any) => m.developerId === ownerId);
    const newOwner = resMembers.body.data.find((m: any) => m.developerId === adminId);

    assert.equal(previousOwner.role, "ADMINISTRATOR");
    assert.equal(newOwner.role, "OWNER");

    // Revert ownership to original state for easier remaining tests
    await request(port, "POST", `/api/v1/organizations/${organizationId}/transfer-ownership`, {
      developerId: ownerId,
    }, {
      "x-developer-id": adminId,
    });
  })
  .test("GET /api/v1/organizations/:id/activities lists actions executed on the organization", async () => {
    const res = await request(port, "GET", `/api/v1/organizations/${organizationId}/activities`, undefined, {
      "x-developer-id": ownerId,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.length >= 3);

    // There should be organization created and ownership transferred events logged
    const hasCreated = res.body.data.some((a: any) => a.action === "OrganizationCreated");
    const hasTransferred = res.body.data.some((a: any) => a.action === "OwnershipTransferred");
    assert.ok(hasCreated);
    assert.ok(hasTransferred);
  })
  .test("POST /api/v1/applications respects organization workspace isolation and VIEWER role blocks", async () => {
    // Create application under organization by OWNER
    const resOwnerApp = await request(port, "POST", "/api/v1/applications", {
      name: "Acme Org Application",
      organizationId,
    }, {
      "x-developer-id": ownerId,
    });

    assert.equal(resOwnerApp.status, 201);
    assert.equal(resOwnerApp.body.data.organizationId, organizationId);

    // Create application under organization by VIEWER (should be rejected)
    const resViewerApp = await request(port, "POST", "/api/v1/applications", {
      name: "Unauthorized App",
      organizationId,
    }, {
      "x-developer-id": viewerId,
    });

    assert.equal(resViewerApp.status, 403);
  })
  .test("DELETE /api/v1/organizations/:id soft deletes organization successfully for OWNER", async () => {
    // Non-owner cannot delete
    const resWrong = await request(port, "DELETE", `/api/v1/organizations/${organizationId}`, undefined, {
      "x-developer-id": adminId,
    });
    assert.equal(resWrong.status, 403);

    // Owner deletes organization
    const resDelete = await request(port, "DELETE", `/api/v1/organizations/${organizationId}`, undefined, {
      "x-developer-id": ownerId,
    });
    assert.equal(resDelete.status, 200);

    // Verify cannot retrieve anymore
    const resGet = await request(port, "GET", `/api/v1/organizations/${organizationId}`, undefined, {
      "x-developer-id": ownerId,
    });
    assert.equal(resGet.status, 404);
  });

export { runner };
