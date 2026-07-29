import { z } from "zod";

export const CreateRoleSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  slug: z.string().trim().toLowerCase().min(1, "Slug is required"),
  description: z.string().trim().nullable().optional(),
});

export const UpdateRoleSchema = z.object({
  name: z.string().trim().min(1).optional(),
  slug: z.string().trim().toLowerCase().min(1).optional(),
  description: z.string().trim().nullable().optional(),
});

export const CreatePermissionSchema = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Permission name is required")
    .regex(
      /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/,
      "Permission name must follow the 'domain.resource.action' convention (e.g., authorization.roles.create)"
    ),
  displayName: z.string().trim().min(1, "Display name is required"),
  description: z.string().trim().nullable().optional(),
});

export const AssignPermissionSchema = z.object({
  permissionId: z.string().min(1, "Permission ID is required"),
});

export const AssignRoleSchema = z.object({
  roleId: z.string().min(1, "Role ID is required"),
});
