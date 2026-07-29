import { z } from "zod";

export const RegisterValidator = z.object({
  email: z.string().email("Invalid email format").trim().toLowerCase(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  profile: z
    .object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      avatar: z.string().url("Invalid avatar URL format").optional(),
      displayName: z.string().optional(),
      metadata: z.record(z.any()).optional(),
    })
    .optional(),
});

export const LoginValidator = z.object({
  email: z.string().email("Invalid email format").trim().toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

export const RefreshValidator = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export const LogoutValidator = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export const ForgotPasswordValidator = z.object({
  email: z.string().email("Invalid email format").trim().toLowerCase(),
});

export const ResetPasswordValidator = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
});

export const VerifyEmailValidator = z.object({
  token: z.string().min(1, "Verification token is required"),
});
