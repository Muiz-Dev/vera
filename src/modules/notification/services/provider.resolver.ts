import { configService } from "../../../core/config/config.service";
import { NotificationProvider } from "../providers/provider.interface";
import { MockProvider } from "../providers/mock.provider";
import { SmtpProvider } from "../providers/smtp.provider";
import { ResendProvider } from "../providers/resend.provider";
import { SendGridProvider } from "../providers/sendgrid.provider";
import { SesProvider } from "../providers/ses.provider";
import Logger from "../../../core/logging/logger";

export class ProviderResolver {
  resolve(overrideProvider?: string): NotificationProvider {
    const config = configService.notification;
    const providerType = (overrideProvider || config.provider || "mock").toLowerCase();

    Logger.debug(`Resolving notification provider: ${providerType}`);

    switch (providerType) {
      case "smtp":
        // Fall back to Mock if host is not configured
        if (!config.smtpHost) {
          Logger.warn("[ProviderResolver] SMTP requested but SMTP_HOST is not configured. Falling back to MockProvider.");
          return new MockProvider();
        }
        return new SmtpProvider({
          host: config.smtpHost,
          port: config.smtpPort,
          user: config.smtpUser,
          pass: config.smtpPassword,
          from: config.smtpFrom,
        });

      case "resend":
        // Fall back to Mock if API key is not configured
        if (!config.resendApiKey) {
          Logger.warn("[ProviderResolver] Resend requested but RESEND_API_KEY is not configured. Falling back to MockProvider.");
          return new MockProvider();
        }
        return new ResendProvider(config.resendApiKey, config.smtpFrom);

      case "sendgrid":
        return new SendGridProvider();

      case "ses":
        return new SesProvider();

      case "mock":
      default:
        return new MockProvider();
    }
  }
}
export default ProviderResolver;
