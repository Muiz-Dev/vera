# ADR-001: Platform Monolith

## Status
Approved

## Date
2026-07-29

## Context
Vera is an API-first developer identity platform, managing developer profiles, multi-tenant applications, user identities, sessions, authentication states, and organizational models. When designing the initial architecture, we needed to decide between a modern microservices pattern or a monolithic system. Microservices provide clean physical boundaries and decoupled scaling, but add massive operational complexity, deployment overhead, network latency, distributed transaction challenges (Sagas), and synchronization hurdles in the early stages of the product.

## Decision
We adopted a **Modular Monolith** architecture for Vera.
- The entire platform resides within a single codebase/repository (monorepository structure).
- The system runs as a single process in production.
- Business boundaries are enforced logically and structurally rather than physically.
- Each business domain resides in its own self-contained folder under `src/modules/` (e.g., `identity`, `authentication`).
- No module is allowed to import from another module's internal directories. Direct communication is only allowed through well-defined service interfaces and an in-process, asynchronous Event Bus.
- Shares common infrastructural core frameworks situated inside `src/core/` (database service, custom logger, HTTP context, global error handler).

## Alternatives Considered
1. **Distributed Microservices:** Split Identity, Authentication, and Session layers into separate processes. Rejected due to premature optimization, high operational overhead (Kubernetes, API gateways, service discovery), network latency, and the complexity of managing distributed transactions across auth and identity boundaries.
2. **Traditional Monolith (Spaghetti Code):** Group all database interactions together, all routers together, and all controllers together globally. Rejected because it does not scale well as the team size and features grow; code becomes tangled, highly coupled, and impossible to extract if individual domains need independent scaling in the future.

## Consequences
- **Positive:**
  - High developer velocity and single-step local environment setup.
  - Zero network overhead for inter-module communication.
  - Logical modularity allows individual domains (like Authentication) to be easily extracted into isolated microservices in the future if required, without changing the public APIs.
  - Simple deployment and transaction management (e.g. Prisma database transactions function perfectly across unified queries).
- **Negative:**
  - Memory or CPU issues in one module can impact the entire running process.
  - Teams must strictly self-enforce modular boundaries at the code-review level to prevent illegal cross-module imports (spaghetti monolith regression).

## Future Considerations
If a specific module (e.g. JWT Token service or MFA generator) experiences a massive volume of requests, we can extract that module's service and repository layers into a serverless function or standalone microservice while retaining the public-facing HTTP routes intact.
