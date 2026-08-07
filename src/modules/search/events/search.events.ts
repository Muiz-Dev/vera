import { type DomainEvent } from "../../../core/events/event.types";

export interface SearchIndexedPayload {
  environmentId: string;
  documentId: string;
  type: string;
  title: string;
}

export class SearchIndexedEvent implements DomainEvent<SearchIndexedPayload> {
  readonly eventName = "SearchIndexed";
  readonly timestamp = new Date();
  constructor(public readonly payload: SearchIndexedPayload) {}
}
