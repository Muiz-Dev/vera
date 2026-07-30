import { NotificationProvider } from "./provider.interface";
import type { NotificationSendOptions, ProviderResponse } from "./provider.interface";
import Logger from "../../../core/logging/logger";

export class ResendProvider extends NotificationProvider {
  private apiKey?: string;
  private fromAddress: string;

  constructor(apiKey?: string, from?: string) {
    super();
    this.apiKey = apiKey;
    this.fromAddress = from || "Vera Security <no-reply@vera.security>";
  }

  async send(options: NotificationSendOptions): Promise<ProviderResponse> {
    if (!this.apiKey) {
      Logger.warn("[ResendProvider] RESEND_API_KEY is not configured. Falling back to success simulation.");
      return {
        success: true,
        messageId: `resend-sim-${Math.random().toString(36).substring(2, 11)}`,
        rawResponse: { simulated: true, note: "API key not configured" },
      };
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: options.from || this.fromAddress,
          to: [options.to],
          subject: options.subject,
          html: options.html,
          text: options.text,
        }),
      });

      const data = await response.json() as any;

      if (!response.ok) {
        throw new Error(data.message || `Resend HTTP error ${response.status}`);
      }

      Logger.info(`[ResendProvider] Email sent successfully via Resend to ${options.to}`, { id: data.id });

      return {
        success: true,
        messageId: data.id,
        rawResponse: data,
      };
    } catch (error: any) {
      Logger.error(`[ResendProvider] Failed to send email to ${options.to}:`, error);
      return {
        success: false,
        error: error.message || "Unknown Resend error",
        rawResponse: error,
      };
    }
  }
}
