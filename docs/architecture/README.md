# Vera Architecture Decision Records (ADRs)

Welcome to the Vera Architecture Decision Records directory.

We document major engineering and design decisions using **Architecture Decision Records (ADRs)**. This ensures that any past, present, or future contributor can understand not just *what* code was written, but *why* those specific patterns, constraints, and technologies were selected.

All new ADRs should follow our standard [ADR-TEMPLATE.md](decisions/ADR-TEMPLATE.md) to maintain consistency in our logs.

## Active Architecture Decisions

The following records describe the baseline architecture of the Vera platform:

### [ADR-001: Platform Monolith](decisions/ADR-001-platform-monolith.md)
* **Status:** Approved
* **Summary:** Establishes Vera as a **Modular Monolith** running in a single process. Avoids physical microservice partitioning early on to optimize development velocity, local testing, and database transactions while maintaining logical code boundaries.

### [ADR-002: Module Registry](decisions/ADR-002-module-registry.md)
* **Status:** Approved
* **Summary:** Introduces the `ModuleRegistry` boot sequence. Enforces strict initialization ordering (Config → Database → Module Bootstrapping → Express routing) to allow safe, modular extension without bloating core bootstrapping code.

### [ADR-003: Response Envelope](decisions/ADR-003-response-envelope.md)
* **Status:** Approved
* **Summary:** Standardizes response structures across all HTTP endpoints. Guarantees that clients receive a uniform envelope format `{ success, data, meta: { requestId, timestamp } }` for simple state integration and debugging.

### [ADR-004: Event System](decisions/ADR-004-event-system.md)
* **Status:** Approved
* **Summary:** Implements a provider-independent, type-safe, asynchronous **Event Bus**. Enables loose coupling between modules by executing side-effects (such as email dispatching or session invalidation) asynchronously via domain events rather than direct service imports.

### [ADR-005: Soft Delete Strategy](decisions/ADR-005-soft-delete-strategy.md)
* **Status:** Approved
* **Summary:** Establishes a standard logical soft-deletion strategy for key database records (like `Identity`). Sets status coordinates to `DEACTIVATED` and populates `deletedAt` to protect data-relational audit integrity while returning HTTP 404 to clients.

---

## Architectural Process
When a pull request introduces a structural change (such as adopting an external message queue, changing the session token library, or partitioning databases):
1. Draft a new ADR using the `decisions/ADR-TEMPLATE.md` structure.
2. Submit the ADR alongside the code changes in the PR.
3. Once approved, merge both the ADR and the code together to expand the permanent architecture log of the project.
