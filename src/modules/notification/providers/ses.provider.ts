import { NotificationProvider } from "./provider.interface";
import type { NotificationSendOptions, ProviderResponse } from "./provider.interface";
import Logger from "../../../core/logging/logger";

export class SesProvider extends NotificationProvider {
  async send(options: NotificationSendOptions): Promise<ProviderResponse> {
    Logger.warn("[SesProvider] Amazon SES provider is not yet fully implemented. Fallback to mock.");
    return {
      success: true,
      messageId: `ses-sim-${Math.random().toString(36).substring(2, 11)}`,
      rawResponse: { simulated: true, note: "SES placeholder" },
    };
  }
}
