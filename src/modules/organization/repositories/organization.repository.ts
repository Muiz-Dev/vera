import { db } from "../../../core/database";
import type { PrismaClient } from "../../../generated/prisma/client";

export class OrganizationRepository {
  private get prisma(): PrismaClient {
    return db.client;
  }

  // Organization CRUD
  async createOrganization(data: any) {
    return this.prisma.organization.create({
      data,
      include: {
        members: true,
      },
    });
  }

  async findOrganizationById(id: string) {
    return this.prisma.organization.findFirst({
      where: { id, deletedAt: null },
      include: {
        members: {
          include: {
            developer: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
      },
    });
  }

  async findOrganizationBySlug(slug: string) {
    return this.prisma.organization.findFirst({
      where: { slug, deletedAt: null },
    });
  }

  async listOrganizationsByDeveloper(developerId: string) {
    return this.prisma.organization.findMany({
      where: {
        deletedAt: null,
        members: {
          some: {
            developerId,
          },
        },
      },
      include: {
        members: {
          include: {
            developer: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
      },
    });
  }

  async updateOrganization(id: string, data: any) {
    return this.prisma.organization.update({
      where: { id },
      data,
      include: {
        members: true,
      },
    });
  }

  // Membership Management
  async createMember(organizationId: string, developerId: string, role: string) {
    return this.prisma.organizationMember.create({
      data: {
        organizationId,
        developerId,
        role,
      },
      include: {
        developer: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });
  }

  async findMember(organizationId: string, developerId: string) {
    return this.prisma.organizationMember.findUnique({
      where: {
        organizationId_developerId: {
          organizationId,
          developerId,
        },
      },
      include: {
        developer: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });
  }

  async listMembers(organizationId: string) {
    return this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: {
        developer: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });
  }

  async updateMemberRole(organizationId: string, developerId: string, role: string) {
    return this.prisma.organizationMember.update({
      where: {
        organizationId_developerId: {
          organizationId,
          developerId,
        },
      },
      data: { role },
    });
  }

  async deleteMember(organizationId: string, developerId: string) {
    return this.prisma.organizationMember.delete({
      where: {
        organizationId_developerId: {
          organizationId,
          developerId,
        },
      },
    });
  }

  // Invitations Management
  async createInvitation(data: {
    organizationId: string;
    email: string;
    role: string;
    token: string;
    invitedById: string;
    expiresAt: Date;
  }) {
    return this.prisma.organizationInvitation.create({
      data,
    });
  }

  async findInvitationByToken(token: string) {
    return this.prisma.organizationInvitation.findUnique({
      where: { token },
      include: {
        organization: true,
      },
    });
  }

  async findInvitationById(id: string) {
    return this.prisma.organizationInvitation.findUnique({
      where: { id },
    });
  }

  async listInvitations(organizationId: string) {
    return this.prisma.organizationInvitation.findMany({
      where: { organizationId },
    });
  }

  async updateInvitation(id: string, data: any) {
    return this.prisma.organizationInvitation.update({
      where: { id },
      data,
    });
  }

  // Activity Log
  async createActivity(data: {
    organizationId: string;
    developerId?: string | null;
    action: string;
    details?: any;
  }) {
    return this.prisma.organizationActivity.create({
      data,
    });
  }

  async listActivities(organizationId: string) {
    return this.prisma.organizationActivity.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
  }
}
export default OrganizationRepository;
