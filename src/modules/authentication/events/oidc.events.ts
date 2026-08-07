import { type DomainEvent } from "../../../core/events/event.types";

export interface OAuthClientRegisteredPayload {
  clientId: string;
  clientName: string;
  environmentId: string;
}

export interface OAuthAuthCodeIssuedPayload {
  clientId: string;
  identityId: string;
  environmentId: string;
  code: string;
}

export interface OAuthTokenIssuedPayload {
  clientId: string;
  identityId: string | null;
  environmentId: string;
  grantType: string;
  accessTokenHash: string;
}

export interface OAuthTokenRevokedPayload {
  clientId: string;
  environmentId: string;
  tokenHash: string;
}

export class OAuthClientRegisteredEvent implements DomainEvent<OAuthClientRegisteredPayload> {
  readonly eventName = "OAuthClientRegistered";
  readonly timestamp = new Date();
  constructor(public readonly payload: OAuthClientRegisteredPayload) {}
}

export class OAuthAuthCodeIssuedEvent implements DomainEvent<OAuthAuthCodeIssuedPayload> {
  readonly eventName = "OAuthAuthCodeIssued";
  readonly timestamp = new Date();
  constructor(public readonly payload: OAuthAuthCodeIssuedPayload) {}
}

export class OAuthTokenIssuedEvent implements DomainEvent<OAuthTokenIssuedPayload> {
  readonly eventName = "OAuthTokenIssued";
  readonly timestamp = new Date();
  constructor(public readonly payload: OAuthTokenIssuedPayload) {}
}

export class OAuthTokenRevokedEvent implements DomainEvent<OAuthTokenRevokedPayload> {
  readonly eventName = "OAuthTokenRevoked";
  readonly timestamp = new Date();
  constructor(public readonly payload: OAuthTokenRevokedPayload) {}
}
