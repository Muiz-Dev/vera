import Logger from "../logging/logger";
import { EventBus } from "./event.bus";
import { type DomainEventHandler } from "./event.types";

export class EventRegistry {
  private static registeredEvents = new Set<string>();

  /**
   * Registers an event and binds standard hooks, logging, or pre-processing if required.
   */
  static register(eventName: string): void {
    if (this.registeredEvents.has(eventName)) {
      return;
    }
    this.registeredEvents.add(eventName);
    Logger.info(`Event registered in system: ${eventName}`);
  }

  /**
   * Convenience method to register and subscribe.
   */
  static registerAndSubscribe<T>(eventName: string, handler: DomainEventHandler<any>): void {
    this.register(eventName);
    EventBus.subscribe(eventName, handler);
  }

  /**
   * Gets a list of all registered events.
   */
  static getRegisteredEvents(): string[] {
    return Array.from(this.registeredEvents);
  }

  /**
   * Clears the registry of events (for testing).
   */
  static clear(): void {
    this.registeredEvents.clear();
  }
}
