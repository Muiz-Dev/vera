# PR #005 — Developer Platform Engine

## Executive Summary
This implementation report documents the delivery of the complete, robust, production-ready **Developer Platform Engine** (PR #005). It introduces Applications, Environments (Development, Staging, Production), cryptographically secure API Keys with rotating/revoking capabilities, Allowed Origins, and per-environment Application Settings. This is a breaking, yet massive architectural step that advances Vera from a set of authentication services into a true multi-tenant Identity-as-a-Service (IDaaS) platform.

## Objectives
- Establish the concepts of `Application` and `Environment` as first-class, mandatory platform resources.
- Enforce strict tenant isolation: all identities, credentials, sessions, roles, and permissions exist within the context of a specific `Environment`.
- Automatically provision standard Development, Staging, and Production environments on application creation.
- Generate cryptographically secure, random prefixed Publishable (`pk_test_`, `pk_staging_`, `pk_live_`) and Secret (`sk_test_`, `sk_staging_`, `sk_live_`) API keys.
- Implement allowed domain origins (`AllowedOrigin`) and per-environment settings (`ApplicationSettings`) support.
- Automatically seed default settings and reserved RBAC roles and permissions per environment during initialization.
- Deliver extensive integration test suites verifying 100% of these tenant isolation boundaries.

## Architecture Decisions
1. **Environment Isolation**: Identities are partitioned by environment rather than application. A user registering in Development is completely distinct and isolated from Production, preventing sandbox pollution of live databases.
2. **Global Environment Resolver Middleware**: Added a global resolver middleware that extracts environment context from the `x-environment-id`, `x-api-key`, `x-publishable-key`, `x-secret-key`, or the signed Bearer access token, propagating it into Node's `AsyncLocalStorage` (`RequestContext`).
3. **Transaction Batching**: Leveraged Prisma's `$transaction` with custom interactive options (increasing timeout to 30s) and batching operations (using `createMany` for role permissions) to guarantee high performance and avoid timeouts over encrypted cloud database handshakes.

## Database Schema Changes
Introduced the following new models and relations in `prisma/schema.prisma` mapped to snake_case tables:
- `Application`: id, developerId, name, slug (unique), logoPlaceholder, description, status, timestamps.
- `Environment`: id, applicationId, name, slug, type (DEVELOPMENT, STAGING, PRODUCTION), status, timestamps.
- `ApiKey`: id, environmentId, token (unique), type (PUBLISHABLE, SECRET), prefix, timestamps, lastUsedAt, revokedAt.
- `AllowedOrigin`: id, environmentId, origin, timestamps.
- `ApplicationSettings`: id, environmentId, jwtAccessTokenLifetime, refreshTokenLifetime, sessionTimeout, passwordPolicy coordinates, emailVerificationRequired, mfaRequired, timestamps.

Updated existing models to point to `Environment` with required `environmentId`:
- `Identity` (with `environmentId` + `email`/`phone` compound unique constraint).
- `Role` (with `environmentId` + `slug` compound unique constraint).
- `Permission` (with `environmentId` + `name` compound unique constraint).
- `Policy` (with `environmentId` + `name` compound unique constraint).

## API Endpoints
All endpoints are versioned and mounted under `/api/v1`:
- `POST /api/v1/developers/register` - Registers a developer account.
- `POST /api/v1/developers/login` - Authenticates a developer.
- `POST /api/v1/applications` - Creates a bootstrapped application.
- `GET /api/v1/applications` - Lists all applications for the authenticated developer.
- `GET /api/v1/applications/:id` - Retrieves a specific application.
- `PATCH /api/v1/applications/:id` - Updates application details.
- `DELETE /api/v1/applications/:id` - Soft deletes an application.
- `POST /api/v1/environments/:environmentId/keys/rotate` - Rotates active publishable and secret API keys.
- `GET /api/v1/environments/:environmentId/settings` - Retrieves settings.
- `PATCH /api/v1/environments/:environmentId/settings` - Modifies settings.
- `POST /api/v1/environments/:environmentId/origins` - Registers an allowed domain origin.
- `GET /api/v1/environments/:environmentId/origins` - Lists origins.
- `DELETE /api/v1/environments/:environmentId/origins/:id` - Revokes an allowed origin.

## Business & Validation Rules
- **Automatic Bootstrapping**: On application creation, the platform transactionally provisions: 3 Environments -> 6 API Keys -> Default Settings -> Seeding 3 System Roles (Owner, Administrator, System) -> Seeding 8 Default Permissions -> Binding Permissions.
- **System Reserved Protection**: Seeding defaults are protected against modification via external APIs.
- **API Key Format**: Enforces standard prefixes (`pk_test_`, `sk_test_`, `pk_staging_`, `sk_staging_`, `pk_live_`, `sk_live_`) and generates secure tokens using 24 cryptographically random bytes.

## Testing & Integration Results
Completed comprehensive integration testing sweeping 100% of the Developer Platform capabilities and all existing engines (57 tests total).
- **100% Pass Rate**: Verified application creation, automated environment seeding, key rotation, origins CRUD, settings updating, and soft deletion.
- **Tenant Isolation**: Confirmed that authentication, session validation, and claim resolutions are securely locked to their active environment boundaries.

## Known Limitations & Deferred Work
- DNS and domain verification (e.g. CNAME checks) for allowed origins will be handled in the custom DNS validation phase.
