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
});

export type Config = z.infer<typeof ConfigSchema>;
