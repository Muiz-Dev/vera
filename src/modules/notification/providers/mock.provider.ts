import { NotificationProvider } from "./provider.interface";
import type { NotificationSendOptions, ProviderResponse } from "./provider.interface";
import Logger from "../../../core/logging/logger";

export class MockProvider extends NotificationProvider {
  async send(options: NotificationSendOptions): Promise<ProviderResponse> {
    Logger.info(`[MockProvider] Simulating sending notification to ${options.to}`, {
      subject: options.subject,
      textLength: options.text.length,
    });

    // Simulate standard latency
    await new Promise((resolve) => setTimeout(resolve, 50));

    const messageId = `mock-msg-${Math.random().toString(36).substring(2, 11)}`;

    return {
      success: true,
      messageId,
      rawResponse: {
        simulated: true,
        recipient: options.to,
        subject: options.subject,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
