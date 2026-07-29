export interface CredentialEntity {
  id: string;
  identityId: string;
  password: string; // Argon2id hash
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionEntity {
  id: string;
  identityId: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface RefreshTokenEntity {
  id: string;
  sessionId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface EmailVerificationEntity {
  id: string;
  identityId: string;
  token: string;
  expiresAt: Date;
  verifiedAt: Date | null;
  createdAt: Date;
}

export interface PasswordResetEntity {
  id: string;
  identityId: string;
  token: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface MfaSecretEntity {
  id: string;
  identityId: string;
  secret: string;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
