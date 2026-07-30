import { NotificationProvider } from "./provider.interface";
import type { NotificationSendOptions, ProviderResponse } from "./provider.interface";
import Logger from "../../../core/logging/logger";

export class SendGridProvider extends NotificationProvider {
  async send(options: NotificationSendOptions): Promise<ProviderResponse> {
    Logger.warn("[SendGridProvider] SendGrid provider is not yet fully implemented. Fallback to mock.");
    return {
      success: true,
      messageId: `sendgrid-sim-${Math.random().toString(36).substring(2, 11)}`,
      rawResponse: { simulated: true, note: "SendGrid placeholder" },
    };
  }
}
