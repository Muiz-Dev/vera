import type { EnvironmentType } from "../../../generated/prisma/client";

export interface CreateApplicationDTO {
  name: string;
  slug?: string;
  logoPlaceholder?: string;
  description?: string;
}

export interface UpdateApplicationDTO {
  name?: string;
  logoPlaceholder?: string;
  description?: string;
  status?: string;
}

export interface AddAllowedOriginDTO {
  origin: string;
}

export interface UpdateSettingsDTO {
  jwtAccessTokenLifetime?: number;
  refreshTokenLifetime?: number;
  sessionTimeout?: number;
  passwordPolicyMinLength?: number;
  passwordPolicyRequireUpper?: boolean;
  passwordPolicyRequireLower?: boolean;
  passwordPolicyRequireNumber?: boolean;
  passwordPolicyRequireSymbol?: boolean;
  emailVerificationRequired?: boolean;
  mfaRequired?: boolean;
  webhookSecret?: string;
  rateLimitingRequests?: number;
  rateLimitingWindow?: number;
}
