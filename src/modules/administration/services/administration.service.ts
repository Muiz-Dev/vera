import { db } from "../../../core/database";
import { AppError } from "../../../core/errors";
import { paginate } from "../utils/pagination";

export class AdministrationService {
  /**
   * Helper to fetch organizations the developer is a member of.
   */
  private async getDeveloperOrgIds(developerId: string): Promise<string[]> {
    const memberships = await db.client.organizationMember.findMany({
      where: { developerId },
      select: { organizationId: true },
    });
    return memberships.map((m) => m.organizationId);
  }

  /**
   * Helper to fetch applications the developer has access to.
   */
  private async getDeveloperAppIds(developerId: string, orgIds: string[]): Promise<string[]> {
    const apps = await db.client.application.findMany({
      where: {
        deletedAt: null,
        OR: [
          { developerId },
          { organizationId: { in: orgIds } },
        ],
      },
      select: { id: true },
    });
    return apps.map((a) => a.id);
  }

  /**
   * Helper to fetch environments the developer has access to.
   */
  private async getDeveloperEnvIds(appIds: string[]): Promise<string[]> {
    const envs = await db.client.environment.findMany({
      where: {
        applicationId: { in: appIds },
      },
      select: { id: true },
    });
    return envs.map((e) => e.id);
  }

  /**
   * Helper to check if a developer has access to a specific environment.
   */
  private async validateEnvironmentAccess(developerId: string, environmentId: string): Promise<void> {
    const env = await db.client.environment.findUnique({
      where: { id: environmentId },
      include: { application: true },
    });

    if (!env || env.application.deletedAt !== null) {
      throw new AppError("Environment not found", "ERR_NOT_FOUND", 404);
    }

    const orgIds = await this.getDeveloperOrgIds(developerId);
    const hasAccess =
      env.application.developerId === developerId ||
      (env.application.organizationId !== null && orgIds.includes(env.application.organizationId));

    if (!hasAccess) {
      throw new AppError("Access denied. You do not own this environment.", "ERR_FORBIDDEN", 403);
    }
  }

  /**
   * Fetch developer-scoped statistics.
   */
  async getStatistics(developerId: string) {
    const orgIds = await this.getDeveloperOrgIds(developerId);
    const appIds = await this.getDeveloperAppIds(developerId, orgIds);
    const envIds = await this.getDeveloperEnvIds(appIds);

    const [
      applicationsCount,
      environmentsCount,
      identitiesCount,
      organizationsCount,
      membersCount,
      apiKeysCount,
      notificationsCount,
      invitationsCount,
    ] = await Promise.all([
      db.client.application.count({
        where: {
          deletedAt: null,
          OR: [
            { developerId },
            { organizationId: { in: orgIds } },
          ],
        },
      }),
      db.client.environment.count({
        where: { applicationId: { in: appIds } },
      }),
      db.client.identity.count({
        where: { environmentId: { in: envIds }, deletedAt: null },
      }),
      db.client.organization.count({
        where: { id: { in: orgIds }, deletedAt: null },
      }),
      db.client.organizationMember.count({
        where: { organizationId: { in: orgIds } },
      }),
      db.client.apiKey.count({
        where: { environmentId: { in: envIds }, revokedAt: null },
      }),
      db.client.notification.count({
        where: {
          OR: [
            { developerId },
            { organizationId: { in: orgIds } },
            { identity: { environmentId: { in: envIds } } },
          ],
        },
      }),
      db.client.organizationInvitation.count({
        where: { organizationId: { in: orgIds } },
      }),
    ]);

    return {
      applications: applicationsCount,
      environments: environmentsCount,
      identities: identitiesCount,
      organizations: organizationsCount,
      organizationMembers: membersCount,
      apiKeys: apiKeysCount,
      notifications: notificationsCount,
      invitations: invitationsCount,
    };
  }

  /**
   * List unique developers sharing organizations with the active developer.
   */
  async listDevelopers(developerId: string, params: any) {
    const orgIds = await this.getDeveloperOrgIds(developerId);

    const queryOptions: any = {
      where: {
        organizationMembers: {
          some: {
            organizationId: { in: orgIds },
          },
        },
        email: params.search
          ? { contains: params.search, mode: "insensitive" }
          : undefined,
      },
      select: {
        id: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    };

    return paginate(db.client.developer, queryOptions, params);
  }

  /**
   * List applications with paginated filter & search.
   */
  async listApplications(developerId: string, params: any) {
    const orgIds = await this.getDeveloperOrgIds(developerId);

    const whereClause: any = {
      deletedAt: null,
      OR: [
        { developerId },
        { organizationId: { in: orgIds } },
      ],
    };

    if (params.status) {
      whereClause.status = params.status;
    }

    if (params.organizationId) {
      if (!orgIds.includes(params.organizationId)) {
        throw new AppError("Access denied to organization applications.", "ERR_FORBIDDEN", 403);
      }
      whereClause.organizationId = params.organizationId;
    }

    if (params.search) {
      whereClause.AND = [
        {
          OR: [
            { name: { contains: params.search, mode: "insensitive" } },
            { slug: { contains: params.search, mode: "insensitive" } },
          ],
        },
      ];
    }

    const queryOptions = {
      where: whereClause,
      include: {
        environments: {
          include: {
            apiKeys: true,
            settings: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    };

    return paginate(db.client.application, queryOptions, params);
  }

  /**
   * List organizations with paginated filter & search.
   */
  async listOrganizations(developerId: string, params: any) {
    const orgIds = await this.getDeveloperOrgIds(developerId);

    const whereClause: any = {
      id: { in: orgIds },
      deletedAt: null,
    };

    if (params.status) {
      whereClause.status = params.status;
    }

    if (params.search) {
      whereClause.AND = [
        {
          OR: [
            { name: { contains: params.search, mode: "insensitive" } },
            { slug: { contains: params.search, mode: "insensitive" } },
          ],
        },
      ];
    }

    const queryOptions = {
      where: whereClause,
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
      orderBy: { createdAt: "desc" },
    };

    return paginate(db.client.organization, queryOptions, params);
  }

  /**
   * List notifications with paginated filter & search.
   */
  async listNotifications(developerId: string, params: any) {
    const orgIds = await this.getDeveloperOrgIds(developerId);
    const appIds = await this.getDeveloperAppIds(developerId, orgIds);
    const envIds = await this.getDeveloperEnvIds(appIds);

    const whereClause: any = {
      OR: [
        { developerId },
        { organizationId: { in: orgIds } },
        { identity: { environmentId: { in: envIds } } },
      ],
    };

    if (params.status) {
      whereClause.status = params.status;
    }

    if (params.channel) {
      whereClause.channel = params.channel;
    }

    if (params.provider) {
      whereClause.provider = params.provider;
    }

    if (params.search) {
      whereClause.AND = [
        {
          OR: [
            { recipient: { contains: params.search, mode: "insensitive" } },
            { subject: { contains: params.search, mode: "insensitive" } },
          ],
        },
      ];
    }

    const queryOptions = {
      where: whereClause,
      orderBy: { createdAt: "desc" },
    };

    return paginate(db.client.notification, queryOptions, params);
  }

  /**
   * List organization activities with paginated filter & search.
   */
  async listOrganizationActivities(developerId: string, params: any) {
    const orgIds = await this.getDeveloperOrgIds(developerId);

    const whereClause: any = {
      organizationId: { in: orgIds },
    };

    if (params.organizationId) {
      if (!orgIds.includes(params.organizationId)) {
        throw new AppError("Access denied to organization activities.", "ERR_FORBIDDEN", 403);
      }
      whereClause.organizationId = params.organizationId;
    }

    if (params.action) {
      whereClause.action = params.action;
    }

    if (params.search) {
      whereClause.AND = [
        {
          action: { contains: params.search, mode: "insensitive" },
        },
      ];
    }

    const queryOptions = {
      where: whereClause,
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        developer: {
          select: {
            id: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    };

    return paginate(db.client.organizationActivity, queryOptions, params);
  }

  /**
   * List notification logs with paginated filter & search.
   */
  async listNotificationLogs(developerId: string, params: any) {
    const orgIds = await this.getDeveloperOrgIds(developerId);
    const appIds = await this.getDeveloperAppIds(developerId, orgIds);
    const envIds = await this.getDeveloperEnvIds(appIds);

    const whereClause: any = {
      notification: {
        OR: [
          { developerId },
          { organizationId: { in: orgIds } },
          { identity: { environmentId: { in: envIds } } },
        ],
      },
    };

    if (params.notificationId) {
      whereClause.notificationId = params.notificationId;
    }

    if (params.status) {
      whereClause.status = params.status;
    }

    if (params.provider) {
      whereClause.provider = params.provider;
    }

    const queryOptions = {
      where: whereClause,
      include: {
        notification: true,
      },
      orderBy: { createdAt: "desc" },
    };

    return paginate(db.client.notificationLog, queryOptions, params);
  }

  /**
   * Get environment settings.
   */
  async getEnvironmentSettings(developerId: string, environmentId: string) {
    await this.validateEnvironmentAccess(developerId, environmentId);

    const settings = await db.client.applicationSettings.findUnique({
      where: { environmentId },
    });

    if (!settings) {
      throw new AppError("Settings not found for this environment", "ERR_NOT_FOUND", 404);
    }

    return settings;
  }

  /**
   * Update environment settings.
   */
  async updateEnvironmentSettings(developerId: string, environmentId: string, data: any) {
    await this.validateEnvironmentAccess(developerId, environmentId);

    const settings = await db.client.applicationSettings.update({
      where: { environmentId },
      data,
    });

    return settings;
  }
}
export default AdministrationService;
