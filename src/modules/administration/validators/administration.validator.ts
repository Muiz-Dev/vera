import { z } from "zod";

export const PaginationQuerySchema = z.object({
  page: z.preprocess(
    (val) => (val === undefined || val === "" ? undefined : Number(val)),
    z.number().int().min(1).default(1)
  ),
  limit: z.preprocess(
    (val) => (val === undefined || val === "" ? undefined : Number(val)),
    z.number().int().min(1).max(100).default(10)
  ),
  search: z.string().trim().optional(),
  sortBy: z.string().trim().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const DeveloperQuerySchema = PaginationQuerySchema.extend({});

export const ApplicationQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  organizationId: z.string().trim().optional(),
});

export const OrganizationQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(["ACTIVE", "SUSPENDED", "DELETED"]).optional(),
});

export const NotificationQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(["PENDING", "SENT", "FAILED"]).optional(),
  channel: z.string().trim().optional(),
  provider: z.string().trim().optional(),
});

export const OrgActivityQuerySchema = PaginationQuerySchema.extend({
  organizationId: z.string().trim().optional(),
  action: z.string().trim().optional(),
});

export const NotificationLogQuerySchema = PaginationQuerySchema.extend({
  notificationId: z.string().trim().optional(),
  status: z.string().trim().optional(),
  provider: z.string().trim().optional(),
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
  webhookSecret: z.string().trim().optional().nullable(),
  rateLimitingRequests: z.number().int().min(1).optional(),
  rateLimitingWindow: z.number().int().min(1).optional(),
});
