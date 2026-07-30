import type { Application } from "express";
import type { IModule } from "../../core/base/module.interface";
import { db } from "../../core/database";
import Logger from "../../core/logging/logger";
import { EventBus } from "../../core/events/event.bus";
import { NotificationService } from "./services/notification.service";
import { NotificationDispatcher } from "./services/notification.dispatcher";
import { NotificationController } from "./controllers/notification.controller";
import { createNotificationRouter } from "./routes/notification.routes";

const DEFAULT_TEMPLATES = [
  {
    name: "Welcome Email",
    subject: "Welcome to Vera Security!",
    htmlTemplate: "<h1>Welcome to Vera!</h1><p>Hi {{email}},</p><p>We are excited to have you on board the Vera Security Platform.</p>",
    textTemplate: "Welcome to Vera!\n\nHi {{email}},\n\nWe are excited to have you on board the Vera Security Platform.",
    variables: ["email"],
  },
  {
    name: "Email Verification",
    subject: "Verify your email address",
    htmlTemplate: "<h1>Verify your email</h1><p>Please use the following verification link to verify your email address:</p><p><a href=\"{{verificationLink}}\">{{verificationLink}}</a></p>",
    textTemplate: "Verify your email\n\nPlease use the following verification link to verify your email address:\n\n{{verificationLink}}",
    variables: ["verificationLink"],
  },
  {
    name: "Password Reset",
    subject: "Reset your password",
    htmlTemplate: "<h1>Password Reset</h1><p>Please use the following reset link to reset your password:</p><p><a href=\"{{resetLink}}\">{{resetLink}}</a></p>",
    textTemplate: "Password Reset\n\nPlease use the following reset link to reset your password:\n\n{{resetLink}}",
    variables: ["resetLink"],
  },
  {
    name: "Organization Invitation",
    subject: "You have been invited to join {{organizationName}}",
    htmlTemplate: "<h1>Organization Invitation</h1><p>You have been invited to join {{organizationName}} as a {{role}}.</p><p>Please use this link to accept the invitation:</p><p><a href=\"{{invitationLink}}\">{{invitationLink}}</a></p>",
    textTemplate: "Organization Invitation\n\nYou have been invited to join {{organizationName}} as a {{role}}.\n\nPlease use this link to accept the invitation:\n\n{{invitationLink}}",
    variables: ["organizationName", "role", "invitationLink"],
  },
  {
    name: "Invitation Accepted",
    subject: "Invitation accepted for {{organizationName}}",
    htmlTemplate: "<h1>Invitation Accepted</h1><p>The developer with email {{email}} has accepted the invitation to join {{organizationName}}.</p>",
    textTemplate: "Invitation Accepted\n\nThe developer with email {{email}} has accepted the invitation to join {{organizationName}}.",
    variables: ["organizationName", "email"],
  },
  {
    name: "Application Created",
    subject: "Your new application {{applicationName}} was successfully created",
    htmlTemplate: "<h1>Application Created</h1><p>Your new application, <strong>{{applicationName}}</strong>, has been successfully created and bootstrapped.</p>",
    textTemplate: "Application Created\n\nYour new application, {{applicationName}}, has been successfully created and bootstrapped.",
    variables: ["applicationName"],
  },
  {
    name: "API Key Rotated",
    subject: "API Keys rotated for your environment",
    htmlTemplate: "<h1>API Keys Rotated</h1><p>The API keys for environment <strong>{{environmentId}}</strong> were successfully rotated. Please update your service configurations immediately.</p>",
    textTemplate: "API Keys Rotated\n\nThe API keys for environment {{environmentId}} were successfully rotated. Please update your service configurations immediately.",
    variables: ["environmentId"],
  },
  {
    name: "Ownership Transfer",
    subject: "Ownership transferred for {{organizationName}}",
    htmlTemplate: "<h1>Ownership Transferred</h1><p>The ownership of your organization, <strong>{{organizationName}}</strong>, has been successfully transferred to a new owner.</p>",
    textTemplate: "Ownership Transferred\n\nThe ownership of your organization, {{organizationName}}, has been successfully transferred to a new owner.",
    variables: ["organizationName"],
  },
  {
    name: "Login Security Alert",
    subject: "Security Alert: Suspicious session activity detected",
    htmlTemplate: "<h1>Security Alert</h1><p>A suspicious session was detected and revoked.</p><p><strong>Reason:</strong> {{reason}}</p>",
    textTemplate: "Security Alert\n\nA suspicious session was detected and revoked.\n\nReason: {{reason}}",
    variables: ["reason"],
  },
  {
    name: "Organization Created",
    subject: "Organization {{organizationName}} created successfully!",
    htmlTemplate: "<h1>Organization Created</h1><p>Your organization <strong>{{organizationName}}</strong> has been successfully created.</p>",
    textTemplate: "Organization Created\n\nYour organization {{organizationName}} has been successfully created.",
    variables: ["organizationName"],
  },
];

export class NotificationModule implements IModule {
  public readonly name = "NotificationModule";

  private service = new NotificationService();
  private dispatcher = new NotificationDispatcher();
  private controller = new NotificationController(this.service);

  public register(app: Application): void {
    const router = createNotificationRouter(this.controller);
    app.use("/api/v1", router);

    Logger.info("NotificationModule routes registered under /api/v1");
  }

  public async initialize(): Promise<void> {
    Logger.info("Initializing NotificationModule...");
    await this.seedTemplates();
    this.registerEventListeners();
    Logger.info("NotificationModule initialized successfully.");
  }

  private async seedTemplates(): Promise<void> {
    Logger.info("Starting idempotent Notification Template seeding...");
    for (const temp of DEFAULT_TEMPLATES) {
      await db.client.notificationTemplate.upsert({
        where: { name: temp.name },
        update: {}, // Keep original templates if already seeded
        create: {
          name: temp.name,
          subject: temp.subject,
          htmlTemplate: temp.htmlTemplate,
          textTemplate: temp.textTemplate,
          variables: temp.variables,
          enabled: true,
        },
      });
    }
    Logger.info("Notification templates seeded successfully.");
  }

  private registerEventListeners(): void {
    Logger.info("Registering Notification EventBus listeners...");

    // 1. DeveloperRegistered
    EventBus.subscribe("DeveloperRegistered", async (event) => {
      const payload = event.payload;
      await this.dispatcher.dispatch({
        developerId: payload.id,
        templateName: "Welcome Email",
        recipient: payload.email,
        payload: { email: payload.email },
      });
    });

    // 2. EmailVerificationRequested
    EventBus.subscribe("EmailVerificationRequested", async (event) => {
      const payload = event.payload;
      const verificationLink = `https://vera.security/verify-email?token=${payload.token}`;
      await this.dispatcher.dispatch({
        identityId: payload.identityId,
        templateName: "Email Verification",
        recipient: payload.email,
        payload: { verificationLink },
      });
    });

    // 3. PasswordResetRequested
    EventBus.subscribe("PasswordResetRequested", async (event) => {
      const payload = event.payload;
      const resetLink = `https://vera.security/reset-password?token=${payload.token}`;
      await this.dispatcher.dispatch({
        identityId: payload.identityId,
        templateName: "Password Reset",
        recipient: payload.email,
        payload: { resetLink },
      });
    });

    // 4. MemberInvited
    EventBus.subscribe("MemberInvited", async (event) => {
      const payload = event.payload;
      const org = await db.client.organization.findUnique({ where: { id: payload.organizationId } });
      const invite = await db.client.organizationInvitation.findUnique({ where: { id: payload.invitationId } });
      const invitationLink = `https://vera.security/accept-invitation?token=${invite?.token || "placeholder"}`;

      await this.dispatcher.dispatch({
        organizationId: payload.organizationId,
        templateName: "Organization Invitation",
        recipient: payload.email,
        payload: {
          organizationName: org?.name || "Organization",
          role: invite?.role || "DEVELOPER",
          invitationLink,
        },
      });
    });

    // 5. InvitationAccepted
    EventBus.subscribe("InvitationAccepted", async (event) => {
      const payload = event.payload;
      const org = await db.client.organization.findUnique({ where: { id: payload.organizationId } });
      const dev = await db.client.developer.findUnique({ where: { id: payload.developerId } });

      if (dev && org) {
        // Find owner or administrator members to notify
        const admins = await db.client.organizationMember.findMany({
          where: {
            organizationId: payload.organizationId,
            role: { in: ["OWNER", "ADMINISTRATOR"] },
          },
          include: { developer: true },
        });

        for (const admin of admins) {
          if (admin.developer.email) {
            await this.dispatcher.dispatch({
              organizationId: payload.organizationId,
              developerId: payload.developerId,
              templateName: "Invitation Accepted",
              recipient: admin.developer.email,
              payload: {
                organizationName: org.name,
                email: dev.email,
              },
            });
          }
        }
      }
    });

    // 6. ApplicationCreated
    EventBus.subscribe("ApplicationCreated", async (event) => {
      const payload = event.payload;
      const dev = await db.client.developer.findUnique({ where: { id: payload.developerId } });
      if (dev) {
        await this.dispatcher.dispatch({
          developerId: payload.developerId,
          organizationId: payload.organizationId,
          templateName: "Application Created",
          recipient: dev.email,
          payload: {
            applicationName: payload.name,
          },
        });
      }
    });

    // 7. ApiKeyRotated
    EventBus.subscribe("ApiKeyRotated", async (event) => {
      const payload = event.payload;
      const dev = await db.client.developer.findUnique({ where: { id: payload.developerId } });
      if (dev) {
        await this.dispatcher.dispatch({
          developerId: payload.developerId,
          organizationId: payload.organizationId,
          templateName: "API Key Rotated",
          recipient: dev.email,
          payload: {
            environmentId: payload.environmentId,
          },
        });
      }
    });

    // 8. OwnershipTransferred
    EventBus.subscribe("OwnershipTransferred", async (event) => {
      const payload = event.payload;
      const org = await db.client.organization.findUnique({ where: { id: payload.organizationId } });
      const previousOwner = await db.client.developer.findUnique({ where: { id: payload.previousOwnerId } });
      const newOwner = await db.client.developer.findUnique({ where: { id: payload.newOwnerId } });

      if (org) {
        if (previousOwner) {
          await this.dispatcher.dispatch({
            organizationId: payload.organizationId,
            developerId: payload.previousOwnerId,
            templateName: "Ownership Transfer",
            recipient: previousOwner.email,
            payload: {
              organizationName: org.name,
            },
          });
        }
        if (newOwner) {
          await this.dispatcher.dispatch({
            organizationId: payload.organizationId,
            developerId: payload.newOwnerId,
            templateName: "Ownership Transfer",
            recipient: newOwner.email,
            payload: {
              organizationName: org.name,
            },
          });
        }
      }
    });

    // 9. SessionRevoked
    EventBus.subscribe("SessionRevoked", async (event) => {
      const payload = event.payload;
      const lowerReason = (payload.reason || "").toLowerCase();
      const isSecuritySensitive =
        lowerReason.includes("replay") ||
        lowerReason.includes("compromised") ||
        lowerReason.includes("suspicious") ||
        lowerReason.includes("security") ||
        lowerReason.includes("forced logout");

      if (isSecuritySensitive) {
        const identity = await db.client.identity.findUnique({ where: { id: payload.identityId } });
        if (identity && identity.email) {
          await this.dispatcher.dispatch({
            identityId: payload.identityId,
            templateName: "Login Security Alert",
            recipient: identity.email,
            payload: {
              reason: payload.reason,
            },
          });
        }
      }
    });

    // 10. OrganizationCreated
    EventBus.subscribe("OrganizationCreated", async (event) => {
      const payload = event.payload;
      const dev = await db.client.developer.findUnique({ where: { id: payload.ownerId } });
      if (dev) {
        await this.dispatcher.dispatch({
          developerId: payload.ownerId,
          organizationId: payload.id,
          templateName: "Organization Created",
          recipient: dev.email,
          payload: {
            organizationName: payload.name,
          },
        });
      }
    });
  }
}
export default NotificationModule;
