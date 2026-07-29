# ADR-002: Module Registry

## Status
Approved

## Date
2026-07-29

## Context
In a modular monolith system, we require a clean, predictable, and maintainable mechanism to register, initialize, and bootstrap individual modules during the Express server startup lifecycle. Without a dedicated registry, the bootstrap process in `server.ts` or `app.ts` becomes bloated with manual routing setup, manual dependency injection, and duplicate database connectivity hooks. This creates massive coupling and violates open-closed principles when introducing new modules (e.g. Authentication, Authorization).

## Decision
We implemented a centralized, type-safe **Module Registry** (`ModuleRegistry`) pattern under `src/core/modules/` (or structured through standard startup modules).
- Each module implements a standardized interface (`IModule` or a base registry module definition) containing:
  - `name`: Unique name of the module.
  - `initialize()`: Asynchronous setup logic (e.g., repository binding, background task startup).
  - `routes`: Registers and exposes the module's HTTP endpoints to the global Express router.
- The `ModuleRegistry` sequentially loops through registered modules in a deterministic bootstrap phase:
  1. Setup shared platform foundation (Config, DB Connection, context middleware).
  2. Register modules into the container.
  3. Initialize all modules asynchronously.
  4. Mount module-specific routes under versioned prefixes (e.g. `/api/v1/auth`).
  5. Start HTTP Listener.
- Modules register themselves in the registry inside `app.ts` cleanly.

## Alternatives Considered
- **Manual Bootstrapping in `app.ts`:** Directly instantiating controllers, services, repositories, and invoking `app.use()` in a massive, unorganized file. Rejected because it scales terribly, is highly prone to merge conflicts, and hides dependency initialization ordering.
- **Dynamic File Scanning (Autoloading):** Autoloading files using directory scanning to dynamically register folders under `/modules`. Rejected because it introduces implicit behavior, makes debugging hard, violates type safety, and complicates standard bundlers (like ESBuild / TSX).

## Consequences
- **Positive:**
  - High observability: Module registry prints clear logs of registration, route attachment, and initialization order.
  - Enforced dependency flow: Service dependency graphs are instantiated cleanly inside the module's initialization phase.
  - Fail-fast: If a module fails to initialize (e.g., bad config, failing connection), the entire server process fails to boot safely.
- **Negative:**
  - Standardized boilerplate is required for every new module introduced.

## Future Considerations
As the platform expands, the Module Registry can act as a lightweight Dependency Injection (DI) container, allowing modules to retrieve references to other modules' exported public interfaces dynamically.
