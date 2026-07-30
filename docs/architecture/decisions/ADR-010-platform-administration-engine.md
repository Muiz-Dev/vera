# ADR-010: Platform Administration Engine

## Status
Approved

## Date
2026-07-30

## Context
As the Vera platform matures, developers and administrators require centralized management endpoints to view system state, monitor audit logs, configure settings, and query resource lists. Rather than forcing clients to call disparate, un-paginated API endpoints or introducing a heavyweight frontend-centric analytics engine, the platform needs a dedicated, unified administrative backend layer.

The core challenge is delivering these features without violating the modular monolithic principles or introducing premature global super-admin authentication states, while maintaining strict developer-level tenancy boundaries.

## Decision
We will introduce a dedicated **Platform Administration Engine** module located under `src/modules/administration/` with routes prefix `/api/v1/administration/*`.

Key architectural components include:

1. **Security & Boundary Enforcement**:
   - No global super-admin is introduced. All administration is scoped to the authenticated Developer using the established `x-developer-id` context.
   - A Developer can only manage resources they own or resources belonging to Organizations where they are a member.
   - Tenancy isolation is maintained by querying resources under the Developer's resolved organization list or owned applications.

2. **Unified Stats Composition**:
   - A single endpoint `/statistics` is exposed to return developer-scoped counts of applications, environments, identities, organizations, members, API keys, notifications, and invitations in parallel.

3. **Database-Level Pagination and Search**:
   - All lists are paginated, searched, and sorted cleanly at the database (Prisma) layer using standard query parameters: `page`, `limit`, `search`, `sortBy`, `sortOrder`.
   - Reusable type-safe `paginate` utility function parses standard request parameters and returns both the chunked data list and pagination metadata inside the standard response `meta` block.

4. **Resource and Audit Log Composition**:
   - Provide read-only paginated listing and searching over existing logs: `OrganizationActivity` and `NotificationLog`.
   - Provide settings read/write operations directly mapped to `ApplicationSettings` under verified environment and developer ownership.

## Alternatives Considered
- **Direct Global Super-Admin Role**: Super-admin controls are deferred to later phases to avoid premature complexity in authentication logic and keep focus on developer workspaces.
- **Scattering Endpoints in Existing Modules**: Placing administrative endpoints in separate modules would lead to scattered and inconsistent UI query architectures. Grouping them in a dedicated composition module keeps administrative queries highly organized and maintainable.

## Consequences
- **Positive**:
  - Delivers high-performance, developer-scoped queries.
  - Reuses existing tables, schemas, and models with zero migration overhead.
  - Implements uniform paginated JSON response blocks conforming to ADR-003.
  - Prepares the platform for the upcoming next-gen React/Next.js dashboard integration (PR #012).
- **Negative**:
  - Slightly increases module orchestration overhead as the Administration module acts as a query-composition layer.
