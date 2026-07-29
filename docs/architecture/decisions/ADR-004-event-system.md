# ADR-004: Event System

## Status
Approved

## Date
2026-07-29

## Context
Modules inside Vera need to communicate and react to lifecycle occurrences in other modules (e.g., when an `Identity` status changes, the `Authentication` session state or third-party webhooks must react accordingly). If modules import other services directly to execute secondary triggers, they become highly coupled (e.g. `IdentityService` importing `MailService`, `SessionService`, `WebhookService`, etc.). This creates circular dependencies, breaks modular boundaries, and violates the single responsibility principle.

## Decision
We implemented a core, decoupled, provider-independent, type-safe **Event Bus** (`EventBus` under `src/core/events/`) for asynchronous domain event dispatching.
- The default implementation operates **in-process** using Node's standard event mechanisms.
- Communication is structured:
  - Modules compile explicit, immutable event classes extending a base `BaseEvent` (e.g., `IdentityCreatedEvent`, `AuthenticationLoggedInEvent`).
  - Event payloads are type-safe and validated.
  - The module triggering the occurrence publishes the event cleanly: `await EventBus.publish(new Event(...))`.
  - Other modules subscribe to relevant topics using `EventBus.subscribe("TopicName", handler)`.
- The publisher module has no knowledge of who is listening, fully insulating business domains.

## Alternatives Considered
- **Direct Service Injection (Direct Calling):** Injecting listener services directly into the publishing service. Rejected because it couples business code and limits future horizontal scale.
- **Immediate Distributed Broker (Kafka/RabbitMQ):** Starting with a fully-fledged message broker. Rejected because it introduces major infrastructure complexity, connection-retry overhead, and local testing burdens early in the development cycle.

## Consequences
- **Positive:**
  - True decoupling: Adding or removing side effects (e.g., triggering a welcome email on `IdentityCreated`) does not impact the publisher module.
  - High observability: Events can be centrally tracked, audited, and logged.
  - Testability: Unit and integration tests can subscribe to events to assert correctness without executing or mocking actual secondary infrastructure.
- **Negative:**
  - Introduce eventual consistency considerations.
  - Harder to trace runtime dependency code paths using traditional static-analysis.

## Future Considerations
The `EventBus` interface is designed to remain broker-agnostic. In the future, we can easily swap the underlying in-process transport with external distributed systems like Kafka, RabbitMQ, or AWS EventBridge without changing any domain/business code.
