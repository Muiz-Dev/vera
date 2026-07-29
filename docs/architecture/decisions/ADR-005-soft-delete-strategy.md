# ADR-005: Soft Delete Strategy

## Status
Approved

## Date
2026-07-29

## Context
In professional developer identity platforms, hard-deleting database records (e.g. executing a raw `DELETE` statement) creates massive data integrity issues. For example, if an identity record is hard-deleted, all associated sessions, password credentials, audit logs, authentication history, and payment transactions either break foreign keys or lose their trace reference entirely. However, preserving de-activated records while keeping unique index constraints (like email/phone uniqueness) is highly complex.

## Decision
We adopted a unified **Soft Delete Strategy** for core domain records (like `Identity`).
- Instead of using physical SQL `DELETE` queries, deletion changes the record state in place:
  - `status` field is set to `DEACTIVATED`.
  - `deletedAt` timestamp is populated with `new Date()`.
- Standard read queries (e.g., retrieving identities by ID or unique indices) exclude soft-deleted records.
- Soft-deleted identities are treated as non-existent to external API requests, throwing a standard `NotFoundError` (HTTP 404).
- The deletion event publishes an `IdentityDeleted` payload containing `id` and `deletedAt` for down-stream audit tracking.
- Database cascade deletes are retained in schema relations (e.g., sessions and credentials) so that if a developer physically wipes an identity, it cascades clean, but our application service layer stays strictly on logical soft-deletion.

## Alternatives Considered
- **Physical Hard Delete:** Dropping rows permanently. Rejected because it breaks referential integrity for audit trials, analytics, and security logging.
- **Archive Tables:** Moving deleted records to separate archive tables. Rejected because it adds substantial schema maintenance overhead and complicates data migration scripts.

## Consequences
- **Positive:**
  - Preserves historic logs and transactional data safely.
  - Quick undo/restore capability if needed by administration.
  - Enforces logical separation of status.
- **Negative:**
  - Standard database unique constraints can conflict. If an identity with `email` `test@test.com` is soft-deleted, a new user registering with `test@test.com` will trigger a database unique key collision. (This is managed by handling the conflict state inside our validators/repositories, or in future phases, dynamically nullifying unique fields upon de-activation, or using composite unique index keys combined with `deletedAt`).

## Future Considerations
To address unique index conflicts on soft-deleted rows, we may implement a composite unique index on Prisma (e.g., combination of `email` and a nullable `deletedAt` or dynamic string append, like `deleted_168000000_email@test.com`) during enterprise scaling phases.
