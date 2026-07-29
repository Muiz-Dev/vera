# Changelog

All notable changes to the **Vera** identity platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-07-29

### Added
- **Core Platform Monolith Foundation:**
  - Integrated high-performance Express server bootstrapping framework in pure ESM and TypeScript.
  - Implemented strict environment configuration loading and validation using Zod.
  - Added centralized database connection pooling using Prisma and custom PG pooling.
  - Formed a centralized global error handler mapped to expressive HTTP standard statuses.
  - Implemented a structured, context-aware logging system wrapped over Pino.
  - Added dynamic request trace context tracking using Node's `AsyncLocalStorage` (`requestId` and `correlationId`).
  - Added Kubernetes-aligned liveness and readiness health checks (`/health`, `/health/live`, `/health/ready`).
  - Designed the unified `ResponseFormatter` JSON structure for all success and error envelopes.
  - Created a modular bootstrap architecture controlled by a centralized `ModuleRegistry`.
- **Identity Engine Foundation Module:**
  - Introduced the base `Identity` and `IdentityProfile` relational models.
  - Added full profile creation (`POST /api/v1/identities`), unique checks, and validation layers.
  - Added specific identity retrievals (`GET /api/v1/identities/:id`) and modifications (`PATCH /api/v1/identities/:id`).
  - Implemented logical soft-deletion (`DELETE /api/v1/identities/:id`) changing state status to `DEACTIVATED` and returning 404s.
  - Added administrative-level identity suspension (`POST /api/v1/identities/:id/suspend`) with custom default reasons.
  - Built a provider-independent asynchronous, in-process Event Bus publishing domain lifecycle events (`IdentityCreated`, `IdentityUpdated`, `IdentitySuspended`, `IdentityDeleted`).
  - Constructed comprehensive stand-alone integration testing suites for standard identity lifecycles and edge boundaries (`test-identity.ts`).
- **Authentication Engine Module:**
  - Implemented secure Argon2id password credential management.
  - Added registration (`POST /api/v1/auth/register`), direct login (`POST /api/v1/auth/login`), and logout (`POST /api/v1/auth/logout`) flows.
  - Integrated JSON Web Tokens (JWT) access validation and secure multi-session tracking.
  - Developed advanced Refresh Token Rotation (RTR) tracking and instant compromised session revocation (theft replay defense).
  - Created safe timing-attack/account-enumeration resistance login patterns.
  - Introduced secure verification token tracking for email verifications and password reset mechanisms.
  - Added comprehensive stand-alone integration testing suites for standard authentication states and replay attack defense (`test-authentication.ts`).
- **Authorization Engine Module (PR #004):**
  - Introduced decoupled Authorization architecture with robust RBAC and permission-based controls.
  - Implemented relational database models for `Role`, `Permission`, `RolePermission`, `IdentityRole`, and `Policy` mapped to snake_case tables.
  - Enforced namespaced permission string format `<domain>.<resource>.<action>` globally with strict Zod regex validation checks.
  - Designed and built separate modular services: `PermissionResolver` (resolution & claims deduplication) and `PermissionEvaluator` (decision checks & audit logging).
  - Centralized type-safe definitions in a unified `src/core/constants/` package for `Roles`, `Permissions`, and `Events`.
  - Built an idempotent startup bootstrapper `AuthorizationBootstrap` that seeds default system roles (`owner`, `administrator`, `system`) and administrative permissions safely.
  - Created reusable middlewares `requireAuthentication()`, `requireRole()`, and `requirePermission()` with Express request claims augmentation (`req.auth`) and AsyncLocalStorage tracking context propagation.
  - Added secure guards on system reserved roles preventing updates or deletions via APIs.
  - Added full support for logical soft deletion on custom roles and cached claim invalidations.
  - Formulated a standard rich metadata payload contract across all domain events.
- **Comprehensive Platform Documentation Logs:**
  - Created sequential engineering implementation reports inside `docs/implementation/` (`001-platform-foundation.md`, `002-identity-engine-foundation.md`, `003-authentication-engine.md`, `004-authorization-engine.md`).
  - Formed standardized Architecture Decision Records in `docs/architecture/decisions/` (`ADR-001` through `ADR-005`).
  - Established index headers inside `docs/implementation/README.md` and `docs/architecture/README.md`.
  - Created security and testing specifications: `docs/security/authorization-model.md`, `docs/security/permission-naming-standard.md`, and `docs/testing/authorization-test-report.md`.
