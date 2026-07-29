import { db } from "../../../core/database";
import type { PrismaClient } from "../../../generated/prisma/client";

export class DeveloperRepository {
  private get prisma(): PrismaClient {
    return db.client;
  }

  // Developer CRUD
  async createDeveloper(data: any) {
    return this.prisma.developer.create({ data });
  }

  async findDeveloperByEmail(email: string) {
    return this.prisma.developer.findUnique({ where: { email } });
  }

  async findDeveloperById(id: string) {
    return this.prisma.developer.findUnique({ where: { id } });
  }

  // Application CRUD
  async createApplication(data: any) {
    return this.prisma.application.create({
      data,
      include: {
        environments: {
          include: {
            apiKeys: true,
            settings: true,
          },
        },
      },
    });
  }

  async findApplicationById(id: string) {
    return this.prisma.application.findFirst({
      where: { id, deletedAt: null },
      include: {
        environments: {
          include: {
            apiKeys: true,
            settings: true,
          },
        },
      },
    });
  }

  async findApplicationBySlug(slug: string) {
    return this.prisma.application.findFirst({
      where: { slug, deletedAt: null },
    });
  }

  async listApplicationsByDeveloper(developerId: string) {
    return this.prisma.application.findMany({
      where: { developerId, deletedAt: null },
      include: {
        environments: {
          include: {
            apiKeys: true,
            settings: true,
          },
        },
      },
    });
  }

  async updateApplication(id: string, data: any) {
    return this.prisma.application.update({
      where: { id },
      data,
      include: {
        environments: {
          include: {
            apiKeys: true,
            settings: true,
          },
        },
      },
    });
  }

  // Environments
  async findEnvironmentById(id: string) {
    return this.prisma.environment.findUnique({
      where: { id },
      include: {
        apiKeys: true,
        settings: true,
        origins: true,
      },
    });
  }

  async findEnvironmentByType(applicationId: string, type: any) {
    return this.prisma.environment.findUnique({
      where: {
        applicationId_type: { applicationId, type },
      },
      include: {
        apiKeys: true,
        settings: true,
        origins: true,
      },
    });
  }

  // API Keys
  async createApiKey(data: any) {
    return this.prisma.apiKey.create({ data });
  }

  async findApiKeyByToken(token: string) {
    return this.prisma.apiKey.findUnique({
      where: { token },
      include: {
        environment: true,
      },
    });
  }

  async revokeApiKey(id: string) {
    return this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async updateApiKeyLastUsed(id: string) {
    return this.prisma.apiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

  // Allowed Origins
  async addAllowedOrigin(environmentId: string, origin: string) {
    return this.prisma.allowedOrigin.create({
      data: { environmentId, origin },
    });
  }

  async removeAllowedOrigin(id: string) {
    return this.prisma.allowedOrigin.delete({
      where: { id },
    });
  }

  async findAllowedOrigin(environmentId: string, origin: string) {
    return this.prisma.allowedOrigin.findUnique({
      where: {
        environmentId_origin: { environmentId, origin },
      },
    });
  }

  async listAllowedOrigins(environmentId: string) {
    return this.prisma.allowedOrigin.findMany({
      where: { environmentId },
    });
  }

  // Application Settings
  async updateSettings(environmentId: string, data: any) {
    return this.prisma.applicationSettings.update({
      where: { environmentId },
      data,
    });
  }
}
export default DeveloperRepository;
