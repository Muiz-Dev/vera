import { db } from "../../../core/database";
import { AppError } from "../../../core/errors";
import Logger from "../../../core/logging/logger";
import { NotificationDispatcher } from "./notification.dispatcher";

export class NotificationService {
  private dispatcher = new NotificationDispatcher();

  // Notification CRUD / Read
  async listNotifications(filters: any = {}) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.recipient) where.recipient = filters.recipient;
    if (filters.developerId) where.developerId = filters.developerId;
    if (filters.identityId) where.identityId = filters.identityId;
    if (filters.organizationId) where.organizationId = filters.organizationId;

    return db.client.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        logs: true,
      },
    });
  }

  async getNotificationById(id: string) {
    const notification = await db.client.notification.findUnique({
      where: { id },
      include: { logs: true },
    });
    if (!notification) {
      throw new AppError("Notification not found", "ERR_NOT_FOUND", 404);
    }
    return notification;
  }

  // Template CRUD
  async listTemplates() {
    return db.client.notificationTemplate.findMany({
      orderBy: { name: "asc" },
    });
  }

  async getTemplateById(id: string) {
    const template = await db.client.notificationTemplate.findUnique({
      where: { id },
    });
    if (!template) {
      throw new AppError("Notification template not found", "ERR_NOT_FOUND", 404);
    }
    return template;
  }

  async createTemplate(data: {
    name: string;
    subject: string;
    htmlTemplate: string;
    textTemplate: string;
    variables?: string[];
    enabled?: boolean;
  }) {
    const existing = await db.client.notificationTemplate.findUnique({
      where: { name: data.name },
    });
    if (existing) {
      throw new AppError("A template with this name already exists", "ERR_VALIDATION_FAILED", 400);
    }

    return db.client.notificationTemplate.create({
      data: {
        name: data.name,
        subject: data.subject,
        htmlTemplate: data.htmlTemplate,
        textTemplate: data.textTemplate,
        variables: data.variables || [],
        enabled: data.enabled !== false,
      },
    });
  }

  async updateTemplate(id: string, data: {
    subject?: string;
    htmlTemplate?: string;
    textTemplate?: string;
    variables?: string[];
    enabled?: boolean;
  }) {
    const template = await this.getTemplateById(id);

    return db.client.notificationTemplate.update({
      where: { id },
      data: {
        subject: data.subject !== undefined ? data.subject : template.subject,
        htmlTemplate: data.htmlTemplate !== undefined ? data.htmlTemplate : template.htmlTemplate,
        textTemplate: data.textTemplate !== undefined ? data.textTemplate : template.textTemplate,
        variables: data.variables !== undefined ? data.variables : template.variables,
        enabled: data.enabled !== undefined ? data.enabled : template.enabled,
      },
    });
  }

  async deleteTemplate(id: string) {
    await this.getTemplateById(id);
    await db.client.notificationTemplate.delete({
      where: { id },
    });
    return { success: true };
  }

  // Test Notification sending
  async sendTestNotification(data: {
    recipient: string;
    templateName: string;
    payload: Record<string, any>;
    provider?: string;
  }) {
    Logger.info(`Sending test notification to ${data.recipient} with template ${data.templateName}`);
    return this.dispatcher.dispatch({
      recipient: data.recipient,
      templateName: data.templateName,
      payload: data.payload,
      provider: data.provider,
    });
  }
}
export default NotificationService;
