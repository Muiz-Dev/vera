import { type DomainEvent } from "../../../core/events/event.types";
import { MfaMethodType } from "../../../generated/prisma/client";

export interface MfaSetupInitiatedPayload {
  identityId: string;
  type: MfaMethodType;
}

export interface MfaEnabledPayload {
  identityId: string;
  type: MfaMethodType;
}

export interface MfaDisabledPayload {
  identityId: string;
  type: MfaMethodType;
  disabledBy: string;
  disableReason?: string;
}

export interface MfaVerificationSucceededPayload {
  identityId: string;
  type: MfaMethodType | "RECOVERY_CODE";
  isBackupCode: boolean;
}

export interface MfaVerificationFailedPayload {
  identityId: string;
  type: MfaMethodType | "RECOVERY_CODE" | "UNKNOWN";
  error: string;
  isBackupCode: boolean;
}

export interface BackupCodesGeneratedPayload {
  identityId: string;
  count: number;
}

export interface BackupCodeUsedPayload {
  identityId: string;
  codeId: string;
}

export interface BackupCodesExhaustedPayload {
  identityId: string;
}

export interface TrustedDeviceAddedPayload {
  identityId: string;
  deviceFingerprint: string;
}

export interface TrustedDeviceRevokedPayload {
  identityId: string;
  deviceFingerprint: string;
}

export class MfaSetupInitiatedEvent implements DomainEvent<MfaSetupInitiatedPayload> {
  readonly eventName = "MfaSetupInitiated";
  readonly timestamp = new Date();
  constructor(public readonly payload: MfaSetupInitiatedPayload) {}
}

export class MfaEnabledEvent implements DomainEvent<MfaEnabledPayload> {
  readonly eventName = "MfaEnabled";
  readonly timestamp = new Date();
  constructor(public readonly payload: MfaEnabledPayload) {}
}

export class MfaDisabledEvent implements DomainEvent<MfaDisabledPayload> {
  readonly eventName = "MfaDisabled";
  readonly timestamp = new Date();
  constructor(public readonly payload: MfaDisabledPayload) {}
}

export class MfaVerificationSucceededEvent implements DomainEvent<MfaVerificationSucceededPayload> {
  readonly eventName = "MfaVerificationSucceeded";
  readonly timestamp = new Date();
  constructor(public readonly payload: MfaVerificationSucceededPayload) {}
}

export class MfaVerificationFailedEvent implements DomainEvent<MfaVerificationFailedPayload> {
  readonly eventName = "MfaVerificationFailed";
  readonly timestamp = new Date();
  constructor(public readonly payload: MfaVerificationFailedPayload) {}
}

export class BackupCodesGeneratedEvent implements DomainEvent<BackupCodesGeneratedPayload> {
  readonly eventName = "BackupCodesGenerated";
  readonly timestamp = new Date();
  constructor(public readonly payload: BackupCodesGeneratedPayload) {}
}

export class BackupCodeUsedEvent implements DomainEvent<BackupCodeUsedPayload> {
  readonly eventName = "BackupCodeUsed";
  readonly timestamp = new Date();
  constructor(public readonly payload: BackupCodeUsedPayload) {}
}

export class BackupCodesExhaustedEvent implements DomainEvent<BackupCodesExhaustedPayload> {
  readonly eventName = "BackupCodesExhausted";
  readonly timestamp = new Date();
  constructor(public readonly payload: BackupCodesExhaustedPayload) {}
}

export class TrustedDeviceAddedEvent implements DomainEvent<TrustedDeviceAddedPayload> {
  readonly eventName = "TrustedDeviceAdded";
  readonly timestamp = new Date();
  constructor(public readonly payload: TrustedDeviceAddedPayload) {}
}

export class TrustedDeviceRevokedEvent implements DomainEvent<TrustedDeviceRevokedPayload> {
  readonly eventName = "TrustedDeviceRevoked";
  readonly timestamp = new Date();
  constructor(public readonly payload: TrustedDeviceRevokedPayload) {}
}
