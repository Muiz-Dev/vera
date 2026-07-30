import { type DomainEvent } from "../../../core/events/event.types";
import { Events } from "../../../core/constants/events";

export interface DeveloperRegisteredPayload {
  id: string;
  email: string;
}

export interface ApplicationCreatedPayload {
  id: string;
  developerId: string;
  organizationId: string | null;
  name: string;
  slug: string;
}

export interface ApiKeyRotatedPayload {
  developerId: string;
  environmentId: string;
  organizationId?: string | null;
}

export class DeveloperRegisteredEvent implements DomainEvent<DeveloperRegisteredPayload> {
  readonly eventName = Events.DEVELOPER_REGISTERED;
  readonly timestamp = new Date();
  constructor(public readonly payload: DeveloperRegisteredPayload) {}
}

export class ApplicationCreatedEvent implements DomainEvent<ApplicationCreatedPayload> {
  readonly eventName = Events.APPLICATION_CREATED;
  readonly timestamp = new Date();
  constructor(public readonly payload: ApplicationCreatedPayload) {}
}

export class ApiKeyRotatedEvent implements DomainEvent<ApiKeyRotatedPayload> {
  readonly eventName = Events.API_KEY_ROTATED;
  readonly timestamp = new Date();
  constructor(public readonly payload: ApiKeyRotatedPayload) {}
}
