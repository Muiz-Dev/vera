import { z } from "zod";

export const ConfigSchema = z.object({
  // App Config
  APP_NAME: z.string().default("Vera"),
  APP_VERSION: z.string().default("0.0.1"),
  PORT: z.preprocess((val) => parseInt(val as string, 10), z.number().default(3000)),
  NODE_ENV: z.enum(["development", "production", "test", "staging"]).default("development"),

  // Database Config
  DATABASE_URL: z.preprocess((val) => {
    if (typeof val === "string") {
      return val.replace(/^["']|["']$/g, "");
    }
    return val;
  }, z.string().url()),

  // Logging Config
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Security Config
  JWT_SECRET: z.string().min(8),
  OAUTH_TOKEN_ENCRYPTION_KEY: z.string().min(32).default("supersecretoauthencryptionkey32chars"),

  // OAuth Client Config
  GOOGLE_CLIENT_ID: z.string().default("google-mock-client-id"),
  GOOGLE_CLIENT_SECRET: z.string().default("google-mock-client-secret"),
  GITHUB_CLIENT_ID: z.string().default("github-mock-client-id"),
  GITHUB_CLIENT_SECRET: z.string().default("github-mock-client-secret"),

  // Notification Config
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.preprocess((val) => (val ? parseInt(val as string, 10) : undefined), z.number().optional()),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  NOTIFICATION_PROVIDER: z.enum(["mock", "smtp", "resend", "sendgrid", "ses"]).default("mock"),
  NOTIFICATION_QUEUE_ENABLED: z.preprocess((val) => val === "true" || val === true, z.boolean().default(false)),
});

export type Config = z.infer<typeof ConfigSchema>;
