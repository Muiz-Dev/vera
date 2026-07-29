import { z } from "zod";

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1, "Name is required").max(150, "Name cannot exceed 150 characters"),
  slug: z
    .string()
    .min(1)
    .max(150)
    .regex(/^[a-z0-9-_]+$/, "Slug must be lowercase and contain only alphanumeric characters, hyphens, or underscores")
    .optional(),
  description: z.string().max(500, "Description cannot exceed 500 characters").optional().nullable(),
  logoPlaceholder: z.string().max(255).optional().nullable(),
  website: z
    .string()
    .url("Website must be a valid URL")
    .or(z.literal(""))
    .optional()
    .nullable(),
  metadata: z.record(z.any()).optional().default({}),
});

export const UpdateOrganizationSchema = CreateOrganizationSchema.partial();

export const InviteMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["ADMINISTRATOR", "MANAGER", "DEVELOPER", "BILLING", "VIEWER"]).default("DEVELOPER"),
});

export const TransferOwnershipSchema = z.object({
  developerId: z.string().min(1, "Developer ID is required"),
});
