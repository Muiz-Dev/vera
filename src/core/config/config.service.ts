import "dotenv/config";
import { ConfigSchema } from "./config.schema";
import type { Config } from "./config.schema";

class ConfigService {
  private config: Config;

  constructor() {
    this.config = this.validate(process.env);
  }

  private validate(env: Record<string, unknown>): Config {
    const result = ConfigSchema.safeParse(env);

    if (!result.success) {
      console.error("❌ Invalid environment configuration:");
      console.error(JSON.stringify(result.error.format(), null, 2));
      process.exit(1);
    }

    return result.data;
  }

  get app() {
    return {
      name: this.config.APP_NAME,
      version: this.config.APP_VERSION,
      port: this.config.PORT,
      env: this.config.NODE_ENV,
    };
  }

  get database() {
    return {
      url: this.config.DATABASE_URL,
    };
  }

  get logging() {
    return {
      level: this.config.LOG_LEVEL,
    };
  }

  get security() {
    return {
      jwtSecret: this.config.JWT_SECRET,
      oauthTokenEncryptionKey: this.config.OAUTH_TOKEN_ENCRYPTION_KEY,
      oauth: {
        google: {
          clientId: this.config.GOOGLE_CLIENT_ID,
          clientSecret: this.config.GOOGLE_CLIENT_SECRET,
        },
        github: {
          clientId: this.config.GITHUB_CLIENT_ID,
          clientSecret: this.config.GITHUB_CLIENT_SECRET,
        },
      },
    };
  }

  get notification() {
    return {
      smtpHost: this.config.SMTP_HOST,
      smtpPort: this.config.SMTP_PORT,
      smtpUser: this.config.SMTP_USER,
      smtpPassword: this.config.SMTP_PASSWORD,
      smtpFrom: this.config.SMTP_FROM,
      resendApiKey: this.config.RESEND_API_KEY,
      provider: this.config.NOTIFICATION_PROVIDER,
      queueEnabled: this.config.NOTIFICATION_QUEUE_ENABLED,
    };
  }
}

export const configService = new ConfigService();
export default configService;
