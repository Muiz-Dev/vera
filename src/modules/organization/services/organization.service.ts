import crypto from "crypto";
import { OrganizationRepository } from "../repositories/organization.repository";
import { AppError } from "../../../core/errors";
import Logger from "../../../core/logging/logger";
import { EventBus } from "../../../core/events/event.bus";
import { Events } from "../../../core/constants/events";
import { db } from "../../../core/database";

export class OrganizationService {
  constructor(private readonly repository: OrganizationRepository) {}

  // Helper: Verify membership and retrieve role
  private async getMemberOrThrow(organizationId: string, developerId: string) {
    const member = await this.repository.findMember(organizationId, developerId);
    if (!member) {
      throw new AppError("Access denied. You are not a member of this organization.", "ERR_FORBIDDEN", 403);
    }
    return member;
  }

  // Helper: Verify role access level
  private async verifyRolesOrThrow(organizationId: string, developerId: string, allowedRoles: string[]) {
    const member = await this.getMemberOrThrow(organizationId, developerId);
    if (!allowedRoles.includes(member.role)) {
      throw new AppError("Access denied. Insufficient organization permissions.", "ERR_FORBIDDEN", 403);
    }
    return member;
  }

  // Organization CRUD
  async createOrganization(developerId: string, data: any) {
    let slug = data.slug || this.generateSlug(data.name);
    let isSlugUnique = false;
    let count = 0;

    while (!isSlugUnique) {
      const existing = await this.repository.findOrganizationBySlug(slug);
      if (!existing) {
        isSlugUnique = true;
      } else {
        count++;
        slug = `${data.slug || this.generateSlug(data.name)}-${count}`;
      }
    }

    const organization = await db.client.$transaction(async (tx) => {
      // Create Organization
      const org = await tx.organization.create({
        data: {
          name: data.name,
          slug,
          description: data.description || null,
          logoPlaceholder: data.logoPlaceholder || null,
          website: data.website || null,
          metadata: data.metadata || {},
        },
      });

      // Create initial Member with OWNER role
      await tx.organizationMember.create({
        data: {
          organizationId: org.id,
          developerId,
          role: "OWNER",
        },
      });

      // Log Activity
      await tx.organizationActivity.create({
        data: {
          organizationId: org.id,
          developerId,
          action: Events.ORGANIZATION_CREATED,
          details: { name: org.name, slug: org.slug },
        },
      });

      return org;
    });

    Logger.info(`Organization created successfully: ${organization.id} by developer ${developerId}`);

    // Publish event
    await EventBus.publish({
      eventName: Events.ORGANIZATION_CREATED,
      timestamp: new Date(),
      payload: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        ownerId: developerId,
      },
    });

    return this.repository.findOrganizationById(organization.id);
  }

  async getOrganization(organizationId: string, developerId: string) {
    await this.getMemberOrThrow(organizationId, developerId);
    const org = await this.repository.findOrganizationById(organizationId);
    if (!org) {
      throw new AppError("Organization not found", "ERR_NOT_FOUND", 404);
    }
    return org;
  }

  async listOrganizations(developerId: string) {
    return this.repository.listOrganizationsByDeveloper(developerId);
  }

  async updateOrganization(organizationId: string, developerId: string, data: any) {
    await this.verifyRolesOrThrow(organizationId, developerId, ["OWNER", "ADMINISTRATOR", "MANAGER"]);

    const org = await this.repository.findOrganizationById(organizationId);
    if (!org) {
      throw new AppError("Organization not found", "ERR_NOT_FOUND", 404);
    }

    // If slug is provided and modified, check uniqueness
    let slug = data.slug;
    if (slug && slug !== org.slug) {
      const existing = await this.repository.findOrganizationBySlug(slug);
      if (existing) {
        throw new AppError("Organization slug already exists", "ERR_VALIDATION_FAILED", 400);
      }
    }

    const updated = await this.repository.updateOrganization(organizationId, data);

    // Log Activity
    await this.repository.createActivity({
      organizationId,
      developerId,
      action: Events.ORGANIZATION_UPDATED,
      details: data,
    });

    // Publish event
    await EventBus.publish({
      eventName: Events.ORGANIZATION_UPDATED,
      timestamp: new Date(),
      payload: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
      },
    });

    return updated;
  }

  async deleteOrganization(organizationId: string, developerId: string) {
    await this.verifyRolesOrThrow(organizationId, developerId, ["OWNER"]);

    const org = await this.repository.findOrganizationById(organizationId);
    if (!org) {
      throw new AppError("Organization not found", "ERR_NOT_FOUND", 404);
    }

    await this.repository.updateOrganization(organizationId, {
      status: "DELETED",
      deletedAt: new Date(),
    });

    // Log Activity
    await this.repository.createActivity({
      organizationId,
      developerId,
      action: Events.ORGANIZATION_DELETED,
      details: { name: org.name, slug: org.slug },
    });

    // Publish event
    await EventBus.publish({
      eventName: Events.ORGANIZATION_DELETED,
      timestamp: new Date(),
      payload: {
        id: organizationId,
      },
    });

    return { success: true };
  }

  // Membership Management
  async listMembers(organizationId: string, developerId: string) {
    await this.getMemberOrThrow(organizationId, developerId);
    return this.repository.listMembers(organizationId);
  }

  async removeMember(organizationId: string, actorId: string, memberId: string) {
    const actor = await this.getMemberOrThrow(organizationId, actorId);
    const target = await this.repository.findMember(organizationId, memberId);

    if (!target) {
      throw new AppError("Member not found in organization", "ERR_NOT_FOUND", 404);
    }

    // Role hierarchies for deletion:
    // 1. Cannot remove the OWNER.
    if (target.role === "OWNER") {
      throw new AppError("Cannot remove the organization owner. Transfer ownership first.", "ERR_FORBIDDEN", 403);
    }

    // 2. Self removal (leaving) is allowed for non-owners.
    const isSelfRemoval = actorId === memberId;

    if (!isSelfRemoval) {
      // Admin hierarchy check:
      // OWNER can remove anyone.
      // ADMINISTRATOR can remove MANAGER, DEVELOPER, BILLING, VIEWER.
      // MANAGER can remove DEVELOPER, BILLING, VIEWER.
      if (actor.role === "ADMINISTRATOR") {
        if (target.role === "ADMINISTRATOR") {
          throw new AppError("Administrators cannot remove other administrators.", "ERR_FORBIDDEN", 403);
        }
      } else if (actor.role === "MANAGER") {
        if (target.role === "ADMINISTRATOR" || target.role === "MANAGER") {
          throw new AppError("Managers can only remove Developers, Billing, or Viewers.", "ERR_FORBIDDEN", 403);
        }
      } else if (actor.role !== "OWNER") {
        throw new AppError("Access denied. Insufficient permissions to remove members.", "ERR_FORBIDDEN", 403);
      }
    }

    await this.repository.deleteMember(organizationId, memberId);

    // Log Activity
    await this.repository.createActivity({
      organizationId,
      developerId: actorId,
      action: Events.MEMBER_REMOVED,
      details: { developerId: memberId, email: target.developer.email, role: target.role, isSelfRemoval },
    });

    // Publish event
    await EventBus.publish({
      eventName: Events.MEMBER_REMOVED,
      timestamp: new Date(),
      payload: {
        organizationId,
        developerId: memberId,
        removedById: actorId,
      },
    });

    return { success: true };
  }

  async transferOwnership(organizationId: string, ownerId: string, newOwnerId: string) {
    await this.verifyRolesOrThrow(organizationId, ownerId, ["OWNER"]);

    if (ownerId === newOwnerId) {
      throw new AppError("Cannot transfer ownership to yourself.", "ERR_VALIDATION_FAILED", 400);
    }

    const targetMember = await this.repository.findMember(organizationId, newOwnerId);
    if (!targetMember) {
      throw new AppError("Target developer is not a member of this organization.", "ERR_VALIDATION_FAILED", 400);
    }

    await db.client.$transaction(async (tx) => {
      // Update target member to OWNER
      await tx.organizationMember.update({
        where: {
          organizationId_developerId: {
            organizationId,
            developerId: newOwnerId,
          },
        },
        data: { role: "OWNER" },
      });

      // Demote current owner to ADMINISTRATOR
      await tx.organizationMember.update({
        where: {
          organizationId_developerId: {
            organizationId,
            developerId: ownerId,
          },
        },
        data: { role: "ADMINISTRATOR" },
      });

      // Log Activity
      await tx.organizationActivity.create({
        data: {
          organizationId,
          developerId: ownerId,
          action: Events.OWNERSHIP_TRANSFERRED,
          details: { previousOwnerId: ownerId, newOwnerId },
        },
      });
    });

    // Publish event
    await EventBus.publish({
      eventName: Events.OWNERSHIP_TRANSFERRED,
      timestamp: new Date(),
      payload: {
        organizationId,
        previousOwnerId: ownerId,
        newOwnerId,
      },
    });

    return { success: true };
  }

  // Invitations
  async inviteMember(organizationId: string, actorId: string, data: { email: string; role: string }) {
    await this.verifyRolesOrThrow(organizationId, actorId, ["OWNER", "ADMINISTRATOR", "MANAGER"]);

    // If already a member, reject invite
    const members = await this.repository.listMembers(organizationId);
    const alreadyMember = members.some((m) => m.developer.email.toLowerCase() === data.email.toLowerCase());
    if (alreadyMember) {
      throw new AppError("Developer is already a member of this organization.", "ERR_VALIDATION_FAILED", 400);
    }

    // Check if there is an active pending invitation for this email
    const invitations = await this.repository.listInvitations(organizationId);
    const existingActiveInvite = invitations.find(
      (inv) => inv.email.toLowerCase() === data.email.toLowerCase() && inv.status === "PENDING" && inv.expiresAt > new Date()
    );

    if (existingActiveInvite) {
      throw new AppError("An active invitation already exists for this email address.", "ERR_VALIDATION_FAILED", 400);
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days expiration

    const invitation = await this.repository.createInvitation({
      organizationId,
      email: data.email.toLowerCase(),
      role: data.role,
      token,
      invitedById: actorId,
      expiresAt,
    });

    // Log Activity
    await this.repository.createActivity({
      organizationId,
      developerId: actorId,
      action: Events.MEMBER_INVITED,
      details: { email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt },
    });

    // Publish event
    await EventBus.publish({
      eventName: Events.MEMBER_INVITED,
      timestamp: new Date(),
      payload: {
        organizationId,
        invitationId: invitation.id,
        email: invitation.email,
        role: invitation.role,
        invitedById: actorId,
      },
    });

    return invitation;
  }

  async listInvitations(organizationId: string, developerId: string) {
    await this.verifyRolesOrThrow(organizationId, developerId, ["OWNER", "ADMINISTRATOR", "MANAGER"]);
    return this.repository.listInvitations(organizationId);
  }

  async acceptInvitation(token: string, developerId: string, developerEmail: string) {
    const invite = await this.repository.findInvitationByToken(token);
    if (!invite) {
      throw new AppError("Invalid or expired invitation token.", "ERR_NOT_FOUND", 404);
    }

    if (invite.status !== "PENDING") {
      throw new AppError("This invitation has already been accepted, revoked, or has expired.", "ERR_VALIDATION_FAILED", 400);
    }

    if (invite.expiresAt < new Date()) {
      await this.repository.updateInvitation(invite.id, { status: "EXPIRED" });
      throw new AppError("This invitation has expired.", "ERR_VALIDATION_FAILED", 400);
    }

    if (invite.email.toLowerCase() !== developerEmail.toLowerCase()) {
      throw new AppError("This invitation was sent to a different email address.", "ERR_FORBIDDEN", 403);
    }

    // Verify developer is not already a member (e.g. they were added via another invite/route)
    const existingMember = await this.repository.findMember(invite.organizationId, developerId);
    if (existingMember) {
      await this.repository.updateInvitation(invite.id, { status: "ACCEPTED", acceptedAt: new Date() });
      throw new AppError("You are already a member of this organization.", "ERR_VALIDATION_FAILED", 400);
    }

    await db.client.$transaction(async (tx) => {
      // Accept invitation status
      await tx.organizationInvitation.update({
        where: { id: invite.id },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });

      // Create membership
      await tx.organizationMember.create({
        data: {
          organizationId: invite.organizationId,
          developerId,
          role: invite.role,
        },
      });

      // Create activity log
      await tx.organizationActivity.create({
        data: {
          organizationId: invite.organizationId,
          developerId,
          action: Events.INVITATION_ACCEPTED,
          details: { invitationId: invite.id, email: invite.email, role: invite.role },
        },
      });
    });

    Logger.info(`Invitation accepted successfully by ${developerId} for organization ${invite.organizationId}`);

    // Publish event
    await EventBus.publish({
      eventName: Events.INVITATION_ACCEPTED,
      timestamp: new Date(),
      payload: {
        organizationId: invite.organizationId,
        invitationId: invite.id,
        developerId,
        email: invite.email,
        role: invite.role,
      },
    });

    await EventBus.publish({
      eventName: Events.MEMBER_JOINED,
      timestamp: new Date(),
      payload: {
        organizationId: invite.organizationId,
        developerId,
        email: invite.email,
        role: invite.role,
      },
    });

    return { success: true };
  }

  async revokeInvitation(organizationId: string, actorId: string, invitationId: string) {
    await this.verifyRolesOrThrow(organizationId, actorId, ["OWNER", "ADMINISTRATOR", "MANAGER"]);

    const invite = await this.repository.findInvitationById(invitationId);
    if (!invite || invite.organizationId !== organizationId) {
      throw new AppError("Invitation not found", "ERR_NOT_FOUND", 404);
    }

    if (invite.status !== "PENDING") {
      throw new AppError("Can only revoke pending invitations.", "ERR_VALIDATION_FAILED", 400);
    }

    const updated = await this.repository.updateInvitation(invitationId, {
      status: "REVOKED",
      revokedAt: new Date(),
    });

    // Log Activity
    await this.repository.createActivity({
      organizationId,
      developerId: actorId,
      action: "InvitationRevoked",
      details: { invitationId, email: invite.email },
    });

    return updated;
  }

  async listActivities(organizationId: string, developerId: string) {
    await this.getMemberOrThrow(organizationId, developerId);
    return this.repository.listActivities(organizationId);
  }

  // Internal Helpers
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}
export default OrganizationService;
