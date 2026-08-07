# ADR-015: Database Engine Module

## Status
Approved

## Date
2026-08-07

## Context
Vera is evolving from an authentication engine into a comprehensive **Developer Operating System** (Developer OS) and platform. As we expand to support multi-tenant Identity, Search, Storage, and Notification engines, our data strategy must match this scale.

Historically, Vera hardcoupled its business logic to a specific data-access library (Prisma) and a specific database engine (PostgreSQL). This approach is insufficient for a platform-level architecture. If the main database is unreachable or offline, the entire system fails. Furthermore, local developer execution (via CLI) is hindered by the requirement of external infrastructure, and we are unable to dynamically provision and synchronize isolated developer data spaces.

To build a truly resilient, scalable, and extensible developer platform, we must elevate data management to a sovereign, first-class peer of the Authentication and Search engines: the **Database Engine**. In this paradigm, database technology, ORMs, and drivers (including Prisma) are treated as replaceable, low-level plugins beneath a high-level, platform-wide contract.

## Decision
We will establish the **Database Engine** as a core, platform-level service of the Vera Developer Operating System. The Database Engine does not merely manage database queries; it **manages DATA as a platform capability**.

```text
                             Vera Platform
                                   │
         ┌───────────────────┬─────┴─────┬───────────────────┐
         ▼                   ▼           ▼                   ▼
   Identity Engine     Search Engine  Database Engine   Sync Engine
                                         │
                                         ▼
                            ┌────────────────────────┐
                            │      Capabilities      │
                            ├────────────────────────┤
                            │ • Data Provisioning    │
                            │ • Schema Management    │
                            │ • Transactions         │
                            │ • Snapshot & Backup    │
                            │ • Replication & Sync   │
                            │ • Health & Discovery   │
                            │ • Observability        │
                            └──────────┬─────────────┘
                                       │
                                Storage Plugins
                                       ▼
                            ┌────────────────────┐
                            │ PostgreSQL Plugin  │
                            │ PGlite Plugin      │
                            │ CockroachDB Plugin │
                            │ Future Storage     │
                            └────────────────────┘
```

### 1. Platform-Level Responsibilities
The Database Engine is the sole sovereign owner of the platform's data state and guarantees the following capabilities:

- **Data Provisioning:** Dynamically generating, partitioning, and provisioning isolated namespaces or data spaces for developer tenants and applications.
- **Connection Lifecycle & Pooling:** Abstracting how connections are opened, maintained, validated, and safely torn down.
- **Schema Management & Migrations:** Programmatically declaring and applying data schemas across any active storage technology without code modifications.
- **Transaction Orchestration:** Exposing unified database transaction boundaries that platform engines can utilize to perform atomic multi-write operations.
- **Backup & Snapshotting:** Generating snapshot packages of active data spaces and supporting point-in-time restoration.
- **Replication & Synchronization:** Coordinating the replication of data between Local (edge/CLI) instances and Cloud instances.
- **Health Monitoring & Discovery:** Continuously auditing data layer health, connectivity, and latency to dynamically route operations.
- **Observability:** Capturing telemetry, logging slow queries, and measuring performance metrics across all active storage.
- **Routing:** Dynamically resolving which active storage provider(s) should fulfill read and write requests according to global platform policies.

### 2. Contract with Other Platform Engines
To maintain strict modular decoupling, other platform engines (Auth, Search, Sync, etc.) **never** communicate with storage libraries or databases directly. They interact solely with the high-level boundaries of the **Database Engine**:

- **Decoupled Contracts:** Other engines express logical data queries or state requests to the Database Engine through high-level platform contracts.
- **Isolation of Concerns:** The Database Engine handles query routing, execution, caching, and transactions transparently. The rest of the platform remains 100% database-agnostic.

### 3. The Plugin Model (Storage Providers)
All database engines, drivers, and ORMs are relegated to **Storage Plugins** beneath the Database Engine's contract.
- A plugin's sole job is to translate the Database Engine's capabilities into specific database commands.
- On startup, the Database Engine dynamically registers the active Storage Plugins based on the running environment.
- Initial plugins include:
  - **Cloud PostgreSQL Storage Plugin:** For production and highly available cloud deployments.
  - **Local WASM Storage Plugin:** Utilizing in-process WASM-compiled engines (e.g., PGlite) to run fully within the Node.js process. This enables 100% offline local development with zero dependencies and zero setup.

### 4. Routing and Offline Resilience Policy
The Database Engine handles offline execution as a routing policy rather than a fallback hack.
- The engine continuously monitors active storage health.
- If a connection failure or network split is discovered (or during local CLI runtime), the engine's router activates the **Local-First Routing Policy**.
- Writes are processed locally and enqueued in a Local Outbox, while the platform remains fully functional.
- When connectivity is restored, the **Sync Engine** coordinates with the Database Engine to replicate and reconcile the changes to the primary Cloud storage.

## Alternatives Considered
1. **Database Access Layer Abstraction (DAO/Repository wrapping):** Designing the database layer around wrapping Prisma or TypeORM. Rejected because it focuses on code-level query abstraction rather than platform-level capabilities (provisioning, replication, telemetry, sync). It forces the platform to evolve around library constraints.
2. **Infrastructure Fallbacks (Docker Compose auto-spins):** Forcing the local CLI/tests to automatically execute shell commands to spin up PostgreSQL containers. Rejected because it requires external software dependencies (Docker), is prone to OS-level failures, and does not support true local-first synchronization architectures.

## Consequences
- **Positive:**
  - **Complete Tech Independence:** Swapping, migrating, or upgrading databases does not impact the core of the platform.
  - **Unmatched Developer Experience:** Developers install the CLI and immediately get a fully functional, self-contained, offline-ready stack with zero infrastructure configuration.
  - **True Multi-Tenancy:** Storage partitioning and database provisioning are treated as core platform capabilities.
- **Negative:**
  - Requires writing a robust provider-agnostic engine boundary, increasing the initial upfront architectural planning and design effort.

## Future Considerations
As the platform expands, the Database Engine will support plugging in distributed database structures or proprietary custom storage solutions (e.g., "VeraDB") without requiring any modifications to the core engines (Identity, Auth, Search, etc.).
