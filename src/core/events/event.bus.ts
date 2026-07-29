import Logger from "../logging/logger";
import { type DomainEvent, type DomainEventHandler } from "./event.types";

export class EventBus {
  private static handlers: Map<string, DomainEventHandler[]> = new Map();

  /**
   * Subscribe a handler to a specific domain event.
   */
  static subscribe<T extends DomainEvent>(eventName: string, handler: DomainEventHandler<T>): void {
    const existing = this.handlers.get(eventName) || [];
    existing.push(handler);
    this.handlers.set(eventName, existing);
    Logger.debug(`Subscribed handler to event: ${eventName}`);
  }

  /**
   * Publish a domain event to all subscribed handlers asynchronously.
   * Isolates errors so a failing handler does not disrupt others or the publisher.
   */
  static async publish<T extends DomainEvent>(event: T): Promise<void> {
    Logger.info(`Publishing event: ${event.eventName}`, { payload: event.payload, timestamp: event.timestamp });
    const handlers = this.handlers.get(event.eventName) || [];

    const promises = handlers.map(async (handler) => {
      try {
        await handler(event);
      } catch (err) {
        Logger.error(`Error executing handler for event '${event.eventName}':`, err);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Unsubscribe a handler from an event.
   */
  static unsubscribe<T extends DomainEvent>(eventName: string, handler: DomainEventHandler<T>): void {
    const existing = this.handlers.get(eventName) || [];
    const filtered = existing.filter((h) => h !== handler);
    this.handlers.set(eventName, filtered);
    Logger.debug(`Unsubscribed handler from event: ${eventName}`);
  }

  /**
   * Clear all registered event handlers (primarily for testing purposes).
   */
  static clearAll(): void {
    this.handlers.clear();
    Logger.debug("Cleared all event handlers from EventBus.");
  }
}
