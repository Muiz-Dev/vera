# PR #004 — Authorization Engine

## Summary
This implementation report documents the delivery of the complete, robust, enterprise-grade **Authorization Engine** (PR #004). It establishes a decoupled authorization model including RBAC, namespaced permissions, cache abstractions, and modular resolution pipelines, forming the security backbone of Vera.

## Objectives
- Introduce a dedicated, decoupled `authorization` module.
- Support Role-Based and Permission-Based Access Control.
- Decouple authorization completely from authentication.
- Enforce strict namespaced permission strings following the format `<domain>.<resource>.<action>`.
- Isolate permission resolution and evaluation into dedicated `PermissionResolver` and `PermissionEvaluator` services.
- Provide a clean, unified `AuthorizationService` for all platform-wide authorization and assignment tasks.
- Implement reusable, type-safe security middlewares (`requireAuthentication`, `requireRole`, `requirePermission`) with request context metadata (`req.auth`) and AsyncLocalStorage support.
- Deliver extensive testing covering idempotency, concurrency, cache invalidation, and failure modes.

## Architecture Decisions
1. **Strict Decoupling**: Authorization operates entirely on stateless, authenticated principal contexts (`req.auth`). It does not handle credentials, logins, or token issuance.
2. **Resolution/Evaluation Separation**:
   - `PermissionResolver` calculates effective, deduplicated permissions for any identity from its assigned roles.
   - `PermissionEvaluator` resolves decisions (GRANT/DENY) and automatically dispatches audit events.
3. **In-Memory Claims Caching**: Speeds up repeated claim resolutions. Clear/delete invalidation routines are triggered on any mutation to ensure total cache consistency.
4. **Platform Constants Centralization**: Standardized roles, permissions, and events are housed inside a unified type-safe `src/core/constants/` package to prevent typographical errors.
5. **System Reserved Safeguards**: Seeded system-reserved roles (`owner`, `administrator`, `system`) and system-flagged permissions are protected against deletion and mutations via API.

## Database Changes
Added the following relational, soft-delete-supported models mapped to snake_case PostgreSQL tables:
- `Role`: id, name, slug (unique), description, isSystem, deletedAt, createdAt, updatedAt.
- `Permission`: id, name (unique), displayName, description, isSystem, deletedAt, createdAt, updatedAt.
- `RolePermission`: roleId, permissionId, createdAt.
- `IdentityRole`: identityId, roleId, createdAt.
- `Policy`: id, name (unique), description, isSystem, createdAt, updatedAt.

## API Endpoints
- `POST /api/v1/roles` - Creates a custom role.
- `GET /api/v1/roles` - Lists all non-deleted roles.
- `GET /api/v1/roles/:id` - Gets a specific role by ID.
- `PATCH /api/v1/roles/:id` - Updates custom role details (guards system roles).
- `DELETE /api/v1/roles/:id` - Soft deletes a custom role (guards system roles).
- `POST /api/v1/permissions` - Creates a permission withnamespaced regex format enforcement.
- `GET /api/v1/permissions` - Lists all non-deleted permissions.
- `POST /api/v1/role-permissions/:roleId` - Assigns a permission to a role.
- `DELETE /api/v1/role-permissions/:roleId/:permissionId` - Revokes a permission from a role.
- `POST /api/v1/identity-roles/:identityId` - Assigns a role to an identity.
- `DELETE /api/v1/identity-roles/:identityId/:roleId` - Revokes a role from an identity.
- `GET /api/v1/identity-roles/:identityId/permissions` - Returns resolved roles & deduplicated permissions.

## Events Added
- `RoleCreated`
- `RoleUpdated`
- `RoleDeleted`
- `PermissionCreated`
- `PermissionAssigned`
- `PermissionRevoked`
- `RoleAssigned`
- `RoleRemoved`
- `AuthorizationEvaluated`

Every event publishes a rich metadata wrapper containing standard platform properties (`eventId`, `occurredAt`, `actorId`, `correlationId`).

## Dependencies Used
- `@prisma/client` - Direct model access and join tables.
- `express` - Express router and middleware.
- `zod` - Request validation schemas.

## Verification & Testing Performed
Executed serial, database-backed integration suites verifying:
- Idempotency bootstrapping.
- Concurrency and race conditions.
- Claims caching invalidation.
- Middlewares and Request Context propagation.
- System roles protection rules.
- Fault tolerance / failure handling.

All 44 integration tests run and pass with a 100% success rate.
