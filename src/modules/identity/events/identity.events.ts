import { type DomainEvent } from "../../../core/events/event.types";

export interface IdentityCreatedPayload {
  id: string;
  email: string | null;
  phone: string | null;
  status: string;
}

export interface IdentityUpdatedPayload {
  id: string;
  email: string | null;
  phone: string | null;
  status: string;
}

export interface IdentityDeletedPayload {
  id: string;
  deletedAt: Date;
}

export interface IdentitySuspendedPayload {
  id: string;
  reason: string;
  suspendedAt: Date;
}

export class IdentityCreatedEvent implements DomainEvent<IdentityCreatedPayload> {
  readonly eventName = "IdentityCreated";
  readonly timestamp = new Date();
  constructor(public readonly payload: IdentityCreatedPayload) {}
}

export class IdentityUpdatedEvent implements DomainEvent<IdentityUpdatedPayload> {
  readonly eventName = "IdentityUpdated";
  readonly timestamp = new Date();
  constructor(public readonly payload: IdentityUpdatedPayload) {}
}

export class IdentityDeletedEvent implements DomainEvent<IdentityDeletedPayload> {
  readonly eventName = "IdentityDeleted";
  readonly timestamp = new Date();
  constructor(public readonly payload: IdentityDeletedPayload) {}
}

export class IdentitySuspendedEvent implements DomainEvent<IdentitySuspendedPayload> {
  readonly eventName = "IdentitySuspended";
  readonly timestamp = new Date();
  constructor(public readonly payload: IdentitySuspendedPayload) {}
}
