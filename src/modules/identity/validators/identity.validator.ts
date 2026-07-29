import { z } from "zod";

export const CreateIdentitySchema = z.object({
  email: z.string().email().toLowerCase().trim().optional(),
  phone: z.string().trim().optional(),
  profile: z.object({
    firstName: z.string().trim().optional(),
    lastName: z.string().trim().optional(),
    avatar: z.string().url().optional(),
    displayName: z.string().trim().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  }).optional(),
}).superRefine((data, ctx) => {
  if (!data.email && !data.phone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either email or phone must be provided",
      path: ["email"],
    });
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either email or phone must be provided",
      path: ["phone"],
    });
  }
});

export const UpdateIdentitySchema = z.object({
  email: z.string().email().toLowerCase().trim().optional(),
  phone: z.string().trim().optional(),
  profile: z.object({
    firstName: z.string().trim().optional(),
    lastName: z.string().trim().optional(),
    avatar: z.string().url().optional(),
    displayName: z.string().trim().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  }).optional(),
});

export const SuspendIdentitySchema = z.object({
  reason: z.string().min(1, { message: "Reason for suspension cannot be empty" }).optional(),
}).optional();
