import { db } from "../../../core/database";
import { AppError } from "../../../core/errors";
import Logger from "../../../core/logging/logger";
import { ProviderResolver } from "./provider.resolver";
import { TemplateService } from "./template.service";

export interface SendNotificationOptions {
  developerId?: string | null;
  identityId?: string | null;
  organizationId?: string | null;
  templateName: string;
  recipient: string;
  payload: Record<string, any>;
  provider?: string;
}

export class NotificationDispatcher {
  private providerResolver = new ProviderResolver();
  private templateService = new TemplateService();

  async dispatch(options: SendNotificationOptions): Promise<any> {
    // 1. Fetch the enabled template
    const template = await db.client.notificationTemplate.findUnique({
      where: { name: options.templateName },
    });

    if (!template) {
      throw new AppError(`Notification template '${options.templateName}' not found`, "ERR_NOT_FOUND", 404);
    }

    if (!template.enabled) {
      Logger.warn(`Notification template '${options.templateName}' is disabled. Skipping dispatch.`);
      return null;
    }

    // 2. Validate template variables
    let requiredVars: string[] = [];
    try {
      if (typeof template.variables === "string") {
        requiredVars = JSON.parse(template.variables);
      } else if (Array.isArray(template.variables)) {
        requiredVars = template.variables as string[];
      }
    } catch (e) {
      Logger.error(`Failed to parse variables for template ${template.name}`, e);
    }

    this.templateService.validateVariables(requiredVars, options.payload);

    // 3. Render content
    const subject = this.templateService.render(template.subject, options.payload);
    const html = this.templateService.render(template.htmlTemplate, options.payload);
    const text = this.templateService.render(template.textTemplate, options.payload);

    // 4. Resolve provider
    const resolvedProviderName = options.provider;
    const provider = this.providerResolver.resolve(resolvedProviderName);
    const providerName = resolvedProviderName || this.providerResolver.resolve().constructor.name.replace("Provider", "").toUpperCase();

    // 5. Create Notification record in PENDING state
    const notification = await db.client.notification.create({
      data: {
        developerId: options.developerId || null,
        identityId: options.identityId || null,
        organizationId: options.organizationId || null,
        type: options.templateName,
        channel: "EMAIL",
        recipient: options.recipient,
        subject,
        payload: options.payload,
        provider: providerName,
        status: "PENDING",
        retries: 0,
      },
    });

    // 6. Execute send with retry logic
    const maxRetries = 3;
    let attempts = 0;
    let success = false;
    let lastError: string | null = null;
    let messageId: string | undefined;
    let rawResponse: any = null;

    while (attempts <= maxRetries && !success) {
      if (attempts > 0) {
        Logger.info(`Retrying notification ${notification.id} (attempt ${attempts}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, 50 * attempts)); // Backoff
      }

      const response = await provider.send({
        to: options.recipient,
        subject,
        html,
        text,
      });

      success = response.success;
      rawResponse = response.rawResponse;

      if (success) {
        messageId = response.messageId;
      } else {
        lastError = response.error || "Unknown delivery error";
        attempts++;
      }
    }

    // 7. Persist Provider Logs
    await db.client.notificationLog.create({
      data: {
        notificationId: notification.id,
        provider: providerName,
        request: {
          to: options.recipient,
          subject,
          templateName: options.templateName,
          payload: options.payload,
        },
        response: rawResponse || { error: lastError },
        status: success ? "SUCCESS" : "FAILED",
      },
    });

    // 8. Update Notification Record
    const updatedNotification = await db.client.notification.update({
      where: { id: notification.id },
      data: {
        status: success ? "SENT" : "FAILED",
        error: success ? null : lastError,
        retries: Math.max(0, attempts - 1),
        sentAt: success ? new Date() : null,
      },
    });

    return updatedNotification;
  }
}
export default NotificationDispatcher;
