import { type DomainEvent } from "../../../core/events/event.types";

export interface AuthenticationRegisteredPayload {
  identityId: string;
  email: string | null;
}

export interface AuthenticationLoggedInPayload {
  identityId: string;
  sessionId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuthenticationLoggedOutPayload {
  identityId: string;
  sessionId: string;
}

export interface PasswordChangedPayload {
  identityId: string;
}

export interface PasswordResetRequestedPayload {
  identityId: string;
  email: string;
  token: string;
  expiresAt: Date;
}

export interface PasswordResetCompletedPayload {
  identityId: string;
}

export interface EmailVerificationRequestedPayload {
  identityId: string;
  email: string;
  token: string;
  expiresAt: Date;
}

export interface EmailVerifiedPayload {
  identityId: string;
  email: string | null;
}

export interface RefreshTokenRotatedPayload {
  identityId: string;
  sessionId: string;
  oldTokenHash: string;
  newTokenHash: string;
}

export interface SessionRevokedPayload {
  identityId: string;
  sessionId: string;
  reason: string;
}

export class AuthenticationRegisteredEvent implements DomainEvent<AuthenticationRegisteredPayload> {
  readonly eventName = "AuthenticationRegistered";
  readonly timestamp = new Date();
  constructor(public readonly payload: AuthenticationRegisteredPayload) {}
}

export class AuthenticationLoggedInEvent implements DomainEvent<AuthenticationLoggedInPayload> {
  readonly eventName = "AuthenticationLoggedIn";
  readonly timestamp = new Date();
  constructor(public readonly payload: AuthenticationLoggedInPayload) {}
}

export class AuthenticationLoggedOutEvent implements DomainEvent<AuthenticationLoggedOutPayload> {
  readonly eventName = "AuthenticationLoggedOut";
  readonly timestamp = new Date();
  constructor(public readonly payload: AuthenticationLoggedOutPayload) {}
}

export class PasswordChangedEvent implements DomainEvent<PasswordChangedPayload> {
  readonly eventName = "PasswordChanged";
  readonly timestamp = new Date();
  constructor(public readonly payload: PasswordChangedPayload) {}
}

export class PasswordResetRequestedEvent implements DomainEvent<PasswordResetRequestedPayload> {
  readonly eventName = "PasswordResetRequested";
  readonly timestamp = new Date();
  constructor(public readonly payload: PasswordResetRequestedPayload) {}
}

export class PasswordResetCompletedEvent implements DomainEvent<PasswordResetCompletedPayload> {
  readonly eventName = "PasswordResetCompleted";
  readonly timestamp = new Date();
  constructor(public readonly payload: PasswordResetCompletedPayload) {}
}

export class EmailVerificationRequestedEvent implements DomainEvent<EmailVerificationRequestedPayload> {
  readonly eventName = "EmailVerificationRequested";
  readonly timestamp = new Date();
  constructor(public readonly payload: EmailVerificationRequestedPayload) {}
}

export class EmailVerifiedEvent implements DomainEvent<EmailVerifiedPayload> {
  readonly eventName = "EmailVerified";
  readonly timestamp = new Date();
  constructor(public readonly payload: EmailVerifiedPayload) {}
}

export class RefreshTokenRotatedEvent implements DomainEvent<RefreshTokenRotatedPayload> {
  readonly eventName = "RefreshTokenRotated";
  readonly timestamp = new Date();
  constructor(public readonly payload: RefreshTokenRotatedPayload) {}
}

export class SessionRevokedEvent implements DomainEvent<SessionRevokedPayload> {
  readonly eventName = "SessionRevoked";
  readonly timestamp = new Date();
  constructor(public readonly payload: SessionRevokedPayload) {}
}
