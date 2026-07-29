export interface DomainEvent<TPayload = any> {
  eventName: string;
  timestamp: Date;
  payload: TPayload;
}

export type DomainEventHandler<T extends DomainEvent = any> = (event: T) => Promise<void> | void;
