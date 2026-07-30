import nodemailer from "nodemailer";
import { NotificationProvider } from "./provider.interface";
import type { NotificationSendOptions, ProviderResponse } from "./provider.interface";
import Logger from "../../../core/logging/logger";

export interface SmtpConfig {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  from?: string;
}

export class SmtpProvider extends NotificationProvider {
  private transporter: nodemailer.Transporter | null = null;
  private fromAddress: string;

  constructor(config: SmtpConfig) {
    super();
    this.fromAddress = config.from || "Vera Security <no-reply@vera.security>";
    if (config.host) {
      this.transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port || 587,
        secure: config.port === 465,
        auth: config.user && config.pass ? {
          user: config.user,
          pass: config.pass,
        } : undefined,
      });
    }
  }

  async send(options: NotificationSendOptions): Promise<ProviderResponse> {
    if (!this.transporter) {
      Logger.warn("[SmtpProvider] SMTP credentials not fully configured. Falling back to success simulation.");
      return {
        success: true,
        messageId: `smtp-sim-${Math.random().toString(36).substring(2, 11)}`,
        rawResponse: { simulated: true, note: "Transporter not initialized due to missing config" },
      };
    }

    try {
      const info = await this.transporter.sendMail({
        from: options.from || this.fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      Logger.info(`[SmtpProvider] Email sent successfully to ${options.to}`, { messageId: info.messageId });

      return {
        success: true,
        messageId: info.messageId,
        rawResponse: info,
      };
    } catch (error: any) {
      Logger.error(`[SmtpProvider] Failed to send email to ${options.to}:`, error);
      return {
        success: false,
        error: error.message || "Unknown SMTP error",
        rawResponse: error,
      };
    }
  }
}
