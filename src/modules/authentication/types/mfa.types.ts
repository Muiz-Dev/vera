import { MfaMethodType } from "../../../generated/prisma/client";

export interface MfaSecretPayload {
  secret: string;
  provisioningUri?: string;
}

export interface MfaVerificationResult {
  success: boolean;
  nextCounter?: number;
}

export interface MfaStrategy {
  type: MfaMethodType;
  generateSecret(identityId: string, email?: string): Promise<MfaSecretPayload>;
  verifyCode(secret: string, code: string, lastVerifiedCounter?: number): Promise<MfaVerificationResult>;
}
