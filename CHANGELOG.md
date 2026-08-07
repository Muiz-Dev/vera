# Changelog

All notable changes to the **Vera** identity platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.7.0] - 2026-08-07

### Added
- **OAuth2 Authorization Server + OpenID Connect (OIDC) Server (PR #013 - Phase 9):**
  - Introduced the new relational `OAuthClient`, `OAuthAuthCode`, `OAuthIssuedToken`, and `OAuthSigningKey` database models in `schema.prisma`.
  - Implemented standard, RFC-compliant OpenID Connect discovery (`/.well-known/openid-configuration`) and JWKS public key set (`/oauth/certs`) endpoints.
  - Implemented modular `OidcKeyService` managing dynamic, environment-isolated 4096-bit RSA key generation and secure AES-256-GCM private-key encryption at-rest.
  - Developed a robust `OidcServerService` orchestrating the standard OAuth2 Authorization Code flow (with PKCE SHA-256 mandatory for public clients) and Client Credentials flow.
  - Implemented authorization code replay protection that immediately invalidates all issued active tokens under that session if code reuse is detected.
  - Enforced exact redirect URI string matching (exact match only; no wildcards) and standard OIDC ID Token claims (`sub`, `email`, `email_verified`) signed using RS256.
  - Enforced strict environment-level multi-tenant context isolations and active multi-factor authentication (MFA) session checks before auth code issuance.
  - Added a dedicated, comprehensive integration test suite `oidc.integration.ts` covering 100% of standard, public, replay, client credentials, multi-tenant, and error flows.
  - Authored standard ADR-013 and sequential chronological Implementation Report #013.

## [1.6.0] - 2026-08-06

### Added
- **Multi-Factor Authentication (MFA) Engine (PR #012 - Phase 8):**
  - Introduced the new `MfaMethodType` Enum, `MfaMethod`, `MfaBackupCode`, `MfaChallenge`, and `TrustedDevice` database models in `schema.prisma`.
  - Implemented provider-agnostic `MfaStrategy` adapter architecture, and designed a native, zero-dependency `TotpMfaStrategy` executing RFC 6238 TOTP HMAC-SHA1 and Base32 decoding with +/- 30s clock-drift tolerance.
  - Implemented secure challenge-response step-up routing (`MfaChallenge`), returning only unique challenge IDs during standard or social (Google/GitHub) logins when MFA is active.
  - Added secure, readable, alphanumeric backup recovery codes (`XXXX-XXXX`) hashed with `Argon2id` for offline leakage defense, with built-in single-use validation and exhaustion events.
  - Designed secure audit-retaining soft-disable logic, keeping disabled methods to record `disabledAt`, `disabledBy`, and `disableReason`.
  - Implemented SHA-256 hashed trusted remembered devices (`TrustedDevice`), allowing users to trust their browsers for 30 days and skip MFA challenges.
  - Enforced session-revocation security guards, immediately destroying all active sessions, refresh tokens, and outstanding challenges upon disabling MFA.
  - Integrated rich security insights and metrics (adoption rate, TOTP vs WebAuthn users, active trusted devices) in the Administration Module.
  - Published comprehensive audit-trail events on the `EventBus` (MfaChallengeFailed, BackupCodeUsed, BackupCodesExhausted, TrustedDeviceAdded, TrustedDeviceRevoked, etc.).
  - Added `mfa.integration.ts` verifying concurrent challenges, clock drift, code re-use window rejections, recovery codes, and trusted remembered device bypasses.
  - Authored official ADR-012 and chronological Implementation Report #012.

## [1.5.0] - 2026-08-06

### Added
- **OAuth & Social Authentication Engine (PR #011 - Phase 7):**
  - Introduced the new relational `OAuthAccount` database model mapped to the `oauth_accounts` table.
  - Implemented provider-agnostic OAuth provider adapter structure including concrete `GoogleProvider` and `GitHubProvider` modules with built-in PKCE (S256), state validations, and mock-interceptors for testing.
  - Added secure cache-backed transaction store for transient states, PKCE verifiers, and temporary single-use session exchange `oauthCode` tokens.
  - Restored environment-level multi-tenancy securely from cached metadata across stateless browser callback redirects.
  - Added cryptographically secure token encryption and decryption services (`OAuthEncryptionService`) using AES-256-GCM backed by `OAUTH_TOKEN_ENCRYPTION_KEY`.
  - Implemented secure Same-Email Hijacking prevention (Option B), rejecting social registration if matching password-based accounts exist.
  - Added secure factor limits check on unlinking, blocking users from unlinking their sole remaining login method.
  - Exposed domain events: `OAuthAccountLinked`, `OAuthAccountUnlinked`, `OAuthLoginSucceeded`, and `OAuthLoginFailed` on the `EventBus`.
  - Developed a comprehensive integration test suite `oauth.integration.ts` verifying all redirect, callback, exchange, link, unlink, collision, and error capabilities.
  - Authored official ADR-011 and chronological Implementation Report #011.

## [1.4.0] - 2026-07-30

### Added
- **Platform Administration Engine (PR #010 - Phase 8):**
  - Introduced a dedicated, decoupled `AdministrationModule` managing administrative queries and settings.
  - Implemented `/api/v1/administration/statistics` exposing aggregate counts of applications, environments, identities, organizations, members, API keys, notifications, and invitations associated with the developer in parallel.
  - Added a reusable, type-safe, database-level pagination helper supporting `page`, `limit`, `search`, `sortBy`, and `sortOrder` query parameters.
  - Created paginated resource search endpoints for developers, applications, organizations, and notifications.
  - Added paginated viewing over existing audit records including `OrganizationActivity` and `NotificationLog`.
  - Exposed GET/PATCH settings management endpoints on `ApplicationSettings` enforcing strict developer ownership validations across organizations and environments.
  - Created a robust integration test suite `administration.integration.ts` with comprehensive coverage of statistics aggregation, pagination criteria, sorting, searching, and boundary access checks.

## [1.3.0] - 2026-07-30

### Added
- **Notification Engine (PR #009 - Phase 7):**
  - Introduced the base `Notification`, `NotificationTemplate`, and `NotificationLog` database models mapped to snake_case tables.
  - Implemented a modular, completely event-driven communication layer subscribing asynchronously to all platform events.
  - Designed a robust provider abstraction supporting `Mock` (test/dev), `SMTP` (nodemailer transport), and `Resend` (REST fetch-based client) dispatch channels.
  - Added a bootstrap template seeder that idempotently populates 10 default, high-quality personalized email templates (Welcome, Verification, Reset, Org Invitation, Invitation Accepted, Application Created, Key Rotated, Ownership Transfer, Login Security Alert, Organization Created) into the database on startup.
  - Created versioned, permission-secured API endpoints (`GET /api/v1/notifications`, `POST /api/v1/notifications/test`, CRUD on `/api/v1/notification-templates`) enforcing standard RBAC scopes (`notification.read`, `notification.send`, `notification.template.read`, `notification.template.write`).
  - Added built-in exponential backoff retry mechanism (max 3 retries) and automatic logging of request/response payloads in `NotificationLog`.
  - Added a comprehensive integration test suite `notification.integration.ts` with 18 tests verifying 100% of EventBus triggers, templates, RBAC scopes, and retries.
  - Authored standard modular, architectural, testing, and implementation specifications under `/docs`.

## [1.2.0] - 2026-07-29

### Added
- **Organization Engine (PR #007 - Phase 6):**
  - Introduced the base `Organization`, `OrganizationMember`, `OrganizationInvitation`, and `OrganizationActivity` database models.
  - Implemented complete organization CRUD with name, slug, description, logo, website, and customizable metadata support.
  - Implemented strict hierarchical organization roles: `OWNER`, `ADMINISTRATOR`, `MANAGER`, `DEVELOPER`, `BILLING`, and `VIEWER`.
  - Added token-based secure invitation management (`OrganizationInvitation`) with standard email verification, expiry checks, and role mappings.
  - Implemented comprehensive organization activity tracking (`OrganizationActivity`) auditing every administrative and membership action.
  - Added secure membership deletion and self-removal (leave) flows enforcing strict role hierarchies.
  - Integrated Organization Engine with the Developer Platform: updated application bootstrapping to support association under an organization and enforced role restrictions (blocking `VIEWER` roles from bootstrapping apps).
  - Published corresponding domain events (`OrganizationCreated`, `MemberInvited`, `InvitationAccepted`, `MemberRemoved`, etc.) to the asynchronous in-process `EventBus`.
  - Added a dedicated, highly robust integration test suite `organization.integration.ts` with 13 tests verifying 100% of these capabilities.
  - Authored a comprehensive chronological engineering implementation report (`docs/implementation/007-organization-engine.md`).

## [1.1.0] - 2026-07-29

### Added
- **Developer Platform Engine (PR #005):**
  - Introduced the base `Application`, `Environment`, `ApiKey`, `AllowedOrigin`, and `ApplicationSettings` database models.
  - Implemented complete application CRUD operations with slug auto-generation, soft deletion (`deletedAt`), and status checks.
  - Added automatic transactional environment provisioning: when a new application is created, the engine transactionally creates three isolated environments (`DEVELOPMENT`, `STAGING`, `PRODUCTION`).
  - Added secure, random prefixed API key pairs (`PUBLISHABLE`, `SECRET`) generated using cryptographically random bytes with standard prefixes (`pk_test_`, `sk_test_`, `pk_staging_`, `sk_staging_`, `pk_live_`, `sk_live_`).
  - Implemented whitelisted Allowed Origins (`AllowedOrigin`) and per-environment settings (`ApplicationSettings`).
  - Added automatic bootstrapping: on environment creation, default settings, system roles (`owner`, `administrator`, `system`), and default permissions are automatically seeded.
  - Added a global `environmentResolverMiddleware` that parses incoming request headers (`x-environment-id`, `x-api-key`, `x-publishable-key`, `x-secret-key`) or JWT access tokens and propagates the active `environmentId` via Node's `AsyncLocalStorage` (`RequestContext`).
  - Added a new, comprehensive integration test suite `developer.integration.ts` with 13 tests verifying all developer operations.
  - Formulated full developer platform module specifications (`docs/modules/developer-platform.md`), architectural specification (`docs/architecture/developer-platform.md`), and test verification reports (`docs/testing/developer-platform-test-report.md`).

### Changed
- **Multi-Tenant Isolation Refactoring**:
  - Updated existing models (`Identity`, `Role`, `Permission`, `Policy`) to reference `Environment` via a required `environmentId` for absolute data partitioning.
  - Updated Identity, Authentication, and Authorization engines to be completely environment-aware, isolating credential matching, session validation, RTR token rotation, and RBAC evaluations.
  - Refactored all 44+ existing integration tests to be tenant-aware, using a dynamic `DbHelper.setupTestTenant` bootstrap routine that spawns mock developer contexts.

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
