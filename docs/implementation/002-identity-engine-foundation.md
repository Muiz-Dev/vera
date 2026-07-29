# PR #002 — Identity Engine Foundation

## Executive Summary
This implementation report documents the complete architectural delivery of the **Identity Engine Foundation** (PR #002) for Vera. This module introduces a highly robust, secure, and extensible identity management foundation. It implements complete profile registration, retrieval, updating, soft-deletion, and administration-level suspension capabilities. The entire system is built with high separation of concerns, ensuring Identity remains the single source of truth for "who a user is," decoupled completely from Credentials, Sessions, and Authorizations.

## Objectives
- Introduce a dedicated, completely decoupled `identity` module.
- Establish the base relational database structures for `Identity` and `IdentityProfile` records.
- Implement comprehensive CRUD operations for identity profiles with strict, multi-layer validation.
- Enforce secure logical soft-deletion to preserve historical database audit integrity and cascades.
- Add granular state lifecycle operations (specifically the administrator-driven suspension flow).
- Integrate asynchronous, type-safe event-driven updates notifying adjacent modules of identity transitions.
- Build extensive verification suites for standard flows, validation boundaries, and edge failure states.

## Scope
The scope of this PR encompasses:
- Core identity database schema definition and Prisma migration execution.
- Development of the Identity Module registrar, controller layers, business services, and repository layers.
- Integration of custom Zod request schema validation middlewares.
- Definition and in-process publishing of Identity domain lifecycle events.
- Verification and end-to-end integration testing of all operations and validation boundary limits.

## Architecture Decisions
1. **Strict Decoupling of Identity & Credentials:** Authentications, passwords, and sessions live outside of the Identity Engine. Identity only defines identity characteristics (email, phone, status, and profile meta) to ensure peak modularity.
2. **Soft-Deletion over Physical Wipes:** Implemented logical soft-deletion setting `status` to `DEACTIVATED` and populating a `deletedAt` timestamp. Direct API reads automatically block access to soft-deleted records to mimic standard deleting while maintaining audit trailing.
3. **Double-Suspension Prevention:** The suspension state machine blocks re-suspending an already suspended identity, throwing structured validation exceptions.
4. **Normalized Input Data:** Input fields are systematically trimmed and emails downcased prior to unique constraints check or storage.

## Module Structure
The module follows Vera's rigid modular monolith engineering structures:
```text
src/modules/identity/
├── controllers/
│   └── identity.controller.ts     # Handles HTTP inputs, validates parameters, and formats output
├── entities/
│   └── identity.entity.ts         # Type declarations representing safe identity structures
├── events/
│   └── identity.events.ts         # Type-safe Event definitions (Created, Updated, Suspended, Deleted)
├── repositories/
│   └── identity.repository.ts     # Dedicated database access encapsulation using Prisma Client
├── routes/
│   └── identity.routes.ts         # Route declarations mapping endpoints to controller handlers
├── services/
│   └── identity.service.ts        # Coordinates core business rules, unique checks, and events
├── validators/
│   └── identity.validator.ts      # Strict Zod validation definitions for incoming request bodies
├── identity.module.ts             # Central bootstrap binder for the Identity system
└── index.ts                       # Module public exports interface
```

## Database Schema
The database models are defined inside `prisma/schema.prisma` mapping to PostgreSQL:
```prisma
enum IdentityStatus {
  PENDING
  ACTIVE
  SUSPENDED
  DEACTIVATED
}

model Identity {
  id          String           @id @default(cuid())
  email       String?          @unique
  phone       String?          @unique
  status      IdentityStatus   @default(PENDING)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  deletedAt   DateTime?

  profile     IdentityProfile?
  // Relations to authentication modules cascade on delete
}

model IdentityProfile {
  id          String   @id @default(cuid())
  identityId  String   @unique
  identity    Identity @relation(fields: [identityId], references: [id], onDelete: Cascade)

  firstName   String?
  lastName    String?
  avatar      String?
  displayName String?
  metadata    Json?    @default("{}")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

## API Endpoints
All endpoints are versioned and mounted under the `/api/v1` base route:
- `POST /api/v1/identities` - Creates a new identity record and optionally a profile.
- `GET /api/v1/identities/:id` - Retrieves identity details (returns 404 if soft-deleted or non-existent).
- `PATCH /api/v1/identities/:id` - Updates specific fields in profile/identity safely.
- `DELETE /api/v1/identities/:id` - Logically deactivates the identity.
- `POST /api/v1/identities/:id/suspend` - Suspends an active/pending identity (supports empty request bodies).

## Validation Rules
Implemented using rigid `Zod` schemas:
- **Create:** Either `email` or `phone` is strictly required. Emails are automatically downcased and trimmed. Profile fields are strictly formatted; `avatar` must be a fully validated URI string if provided.
- **Update:** Restricts updating read-only coordinates. Supports optional updates on profile parameters.
- **Suspend:** Accepting optional request bodies. If no body or reason is passed, the system defaults to "Suspended by administrator".

## Business Rules
- **Unique Fields Verification:** Before executing a database write for registration or email updates, the engine queries the repositories. If any email or phone collisions are detected, a formatted `ERR_VALIDATION_FAILED` (400) is returned.
- **Graceful Deactivation:** Soft-deletion modifies status to `DEACTIVATED` and locks the record. Retrievals on deactivated records yield `NotFoundError` (404) errors.
- **Administrator Defaults:** The `IdentityService` layer enforces business logic default value generation: when an identity is suspended without a provided string, the service assigns `"Suspended by administrator"` to ensure the Event Bus logs represent accurate context.

## Event Definitions
The following type-safe asynchronous events inherit from the foundational `BaseEvent` and are dispatched over the Event Bus:
- `IdentityCreatedEvent` — Dispatched upon successful identity and profile creation.
- `IdentityUpdatedEvent` — Dispatched upon identity profile changes.
- `IdentitySuspendedEvent` — Dispatched when an administrator suspends a user, carrying `reason` and `suspendedAt` timestamps.
- `IdentityDeletedEvent` — Dispatched when a record is soft-deleted, containing the `deletedAt` metadata.

## Repository Pattern
`IdentityRepository` manages database query composition, insulating services from Prisma query specifics:
- `findById(id)` - Safely fetches active records (where `deletedAt` is `null`).
- `findByEmail(email)` / `findByPhone(phone)` - Standard checks against unique indexes.
- `create(data)` - Performs atomic writes using Prisma nested write inclusions to link the Profile transactionally.
- `update(id, data)` - Handles deep record merging for profiling or state changes.

## Service Responsibilities
`IdentityService` owns application-specific workflows and transactional boundaries. It coordinates database operations across repositories, handles validation exceptions, formats custom server logs, and triggers domain events to decoupling mechanisms.

## Response Format
Matches Vera's unified enterprise envelopes:
- **Success:** Returns HTTP `200` (or `201` for creation) wrapping objects in `{ success: true, data: {...}, meta: { requestId, timestamp } }`.
- **Failure:** Returns standard envelopes containing detailed error structures mapping code classifications (e.g. `ERR_VALIDATION_FAILED`) alongside structured input field details.

## Error Handling
Exceptions are intercepted globally usingExpress error middlewares. Domain logic throws specific implementations of `AppError` (e.g., `NotFoundError`), translating directly to custom HTTP statuses and logging stacks with request IDs for easy telemetry correlation.

## Testing Strategy
Maintained strict automated testing workflows using standalone integration suites:
- Comprehensive tests reside in `test-identity.ts`.
- Avoids external dependencies by spawning virtual ports and initializing automated teardown hooks.

## Integration Test Results
The integration test suite was run and completed with a 100% success rate:
- **Validation Failures:** Correctly rejected registrations missing both email and phone.
- **Success Creation:** Confirmed that nested profile schemas and default states map correctly.
- **Duplicate Violations:** Asserted that email duplicates are intercepted gracefully.
- **Lifecycle Updates:** Tested profile patching.
- **Granular Suspension:** Verified that `/suspend` responds correctly with reason payloads, and successfully applies defaults when invoked with empty `{}` or `undefined` request bodies.
- **Logical Deactivation:** Verified that soft-deletes update fields in-place and subsequently block standard reads (returning 404).

## Security Considerations
- Prevents malicious account scanning and timing vectors by employing unified error responses.
- Guarantees strict field sanitization through strict Zod parsers, filtering unexpected parameters.

## Performance Considerations
- Database reads utilize indexed fields (`email`, `phone`, `id`) for $O(1)$ lookups.
- Profiles are linked and nested transactionally, minimizing database query roundtrips.

## Known Limitations
- Standard database unique key constraints on soft-deleted email fields prevent immediate recycling of deleted email registrations until composite keys are established.

## Deferred Features
- Multi-factor authentication execution and password authentication (moved to the Authentication PR).
- Complex role, permission, and group mapping.

## Next Recommended Phase
- Authentication Engine (Credentials, rotation tokens, password reset, and session states).

## Lessons Learned
- Handling logical soft-delete triggers early ensures clean auditing but requires proactive considerations on unique indexes (such as email uniqueness constraints) during development.
