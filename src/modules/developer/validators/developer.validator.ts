import { z } from "zod";

export const RegisterDeveloperSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const LoginDeveloperSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string(),
});

export const CreateApplicationSchema = z.object({
  name: z.string().min(1, "Name is required").trim(),
  slug: z.string().min(1, "Slug must be valid").trim().toLowerCase().optional(),
  logoPlaceholder: z.string().url("Logo placeholder must be a valid URL").optional().or(z.literal("")),
  description: z.string().trim().optional(),
  organizationId: z.string().optional(),
});

export const UpdateApplicationSchema = z.object({
  name: z.string().min(1).trim().optional(),
  logoPlaceholder: z.string().url("Logo placeholder must be a valid URL").optional().or(z.literal("")),
  description: z.string().trim().optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});

export const AddAllowedOriginSchema = z.object({
  origin: z.string().trim().min(1, "Origin is required"),
});

export const UpdateSettingsSchema = z.object({
  jwtAccessTokenLifetime: z.number().int().min(60).max(86400).optional(),
  refreshTokenLifetime: z.number().int().min(3600).max(31536000).optional(),
  sessionTimeout: z.number().int().min(300).max(604800).optional(),
  passwordPolicyMinLength: z.number().int().min(6).max(128).optional(),
  passwordPolicyRequireUpper: z.boolean().optional(),
  passwordPolicyRequireLower: z.boolean().optional(),
  passwordPolicyRequireNumber: z.boolean().optional(),
  passwordPolicyRequireSymbol: z.boolean().optional(),
  emailVerificationRequired: z.boolean().optional(),
  mfaRequired: z.boolean().optional(),
  webhookSecret: z.string().trim().optional(),
  rateLimitingRequests: z.number().int().min(1).optional(),
  rateLimitingWindow: z.number().int().min(1).optional(),
});
