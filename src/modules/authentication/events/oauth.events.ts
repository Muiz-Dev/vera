import { type DomainEvent } from "../../../core/events/event.types";

export interface OAuthAccountLinkedPayload {
  identityId: string;
  provider: string;
  providerUserId: string;
}

export interface OAuthAccountUnlinkedPayload {
  identityId: string;
  provider: string;
  providerUserId: string;
}

export interface OAuthLoginSucceededPayload {
  identityId: string;
  provider: string;
  providerUserId: string;
}

export interface OAuthLoginFailedPayload {
  provider: string;
  providerUserId?: string;
  error: string;
}

export class OAuthAccountLinkedEvent implements DomainEvent<OAuthAccountLinkedPayload> {
  readonly eventName = "OAuthAccountLinked";
  readonly timestamp = new Date();
  constructor(public readonly payload: OAuthAccountLinkedPayload) {}
}

export class OAuthAccountUnlinkedEvent implements DomainEvent<OAuthAccountUnlinkedPayload> {
  readonly eventName = "OAuthAccountUnlinked";
  readonly timestamp = new Date();
  constructor(public readonly payload: OAuthAccountUnlinkedPayload) {}
}

export class OAuthLoginSucceededEvent implements DomainEvent<OAuthLoginSucceededPayload> {
  readonly eventName = "OAuthLoginSucceeded";
  readonly timestamp = new Date();
  constructor(public readonly payload: OAuthLoginSucceededPayload) {}
}

export class OAuthLoginFailedEvent implements DomainEvent<OAuthLoginFailedPayload> {
  readonly eventName = "OAuthLoginFailed";
  readonly timestamp = new Date();
  constructor(public readonly payload: OAuthLoginFailedPayload) {}
}
