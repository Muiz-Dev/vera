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
    };
  }
}

export const configService = new ConfigService();
export default configService;
