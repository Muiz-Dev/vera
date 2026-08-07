# Vera Security Platform — Strategic Roadmap

This document outlines the current state of the Vera identity platform, identifies completed modules and design patterns, defines current contracts, and establishes the strategic product roadmap as Vera transitions from an authentication service to a comprehensive developer identity platform.

---

## 🏛️ Current Architectural & Module Status

Vera is designed as a secure, modular, multi-tenant Express/TypeScript monolith backed by PostgreSQL, Prisma, and an asynchronous in-process Event Bus.

### 1. Completed Core Foundations
*   **Request Context Propagation (`src/core/http/context/`):** Leverages Node's `AsyncLocalStorage` to securely carry transactional metadata (such as `requestId`, `correlationId`, and `environmentId`) through deep asynchronous call stacks without modifying function signatures.
*   **Multi-Tenant Isolation (`src/modules/developer/`):** When a developer creates an `Application`, Vera transactionally provisions three completely isolated environments: `DEVELOPMENT`, `STAGING`, and `PRODUCTION`. All subsequent models (Identities, Roles, Sessions, etc.) are strictly partitioned under `Environment`.
*   **Context-Aware Tenancy Middleware:** Intercepts headers (`x-environment-id`, prefixed API Keys, or Access Token JWT claims) and registers the active `environmentId` directly inside the request context.
*   **Unified Responses & Error Handling:** Standardized response envelopes via `ResponseFormatter` and customized `AppError` mappings handled globally.
*   **In-Process Domain Event Bus (`src/core/events/`):** Decoupled, asynchronous, type-safe event dispatcher for publishing internal domain events.

### 2. Completed Identity & Authentication
*   **Identity Engine (`src/modules/identity/`):** Handles core identities, user profiles, logical soft-deletion, and administration suspensions.
*   **Authentication Engine (`src/modules/authentication/`):** Manages registrations, credentials (hashed with Argon2id), logins, logouts, password resets, and email verifications. Includes strict Refresh Token Rotation (RTR) to prevent session replay/hijacking attacks.
*   **OAuth & Social Authentication:** Integrated Google and GitHub provider adapters with PKCE (S256), state validations, duplicate same-email hijacking prevention, and AES-256-GCM token encryption (`OAuthEncryptionService`).
*   **Enterprise Multi-Factor Authentication (MFA):** Native, zero-dependency implementation of RFC 6238 TOTP (Base32 decoding, +/-30s clock-drift tolerance). Includes Argon2id-hashed alphanumeric single-use backup recovery codes (`XXXX-XXXX`), step-up reusable `MfaChallenge` tracking, and 30-day remembered trusted device cookies.

### 3. Completed Security & Authorization (RBAC)
*   **Decoupled Claims Architecture:** Decouples permissions claims calculations (`PermissionResolver`) from decision-making logic (`PermissionEvaluator` with logging).
*   **Namespaced Permissions:** Strict Zod validation regex enforcing `<domain>.<resource>.<action>` patterns (e.g. `notification.template.write`).
*   **System Protection:** Flags system-reserved roles (`owner`, `administrator`, `system`) as `isSystem: true` to prevent any API mutations or deletions.

### 4. Completed Workspaces & Tooling
*   **Organization Engine (`src/modules/organization/`):** Shared developer-owned workspaces featuring CRUD operations, secure token-based invitations, hierarchical roles (`OWNER` down to `VIEWER`), and `OrganizationActivity` audit logging.
*   **Notification Engine (`src/modules/notification/`):** Event-driven notification dispatch system supporting `Mock`, `SMTP`, and `Resend` providers. Seeds 10 system-reserved communication templates into the database on startup.
*   **Administration Module (`src/modules/administration/`):** Handles statistics aggregation, paginated logs search, and application-level environment settings.

---

## 🔒 Freezing Core Platform Contracts

To ensure stability as developers build against Vera, we formally freeze and version the following architectural and schema interfaces:

### 1. Response Formatter Envelopes
All HTTP API endpoints must strictly adhere to the following response payloads:
```json
// Success Response
{
  "success": true,
  "data": { ... },
  "meta": { ... } // Optional pagination meta
}

// Error Response
{
  "success": false,
  "error": {
    "code": "ERR_NAME_OF_ERROR",
    "message": "Human readable error description",
    "details": [ ... ], // Optional array of validation errors
    "correlationId": "uuid-correlation-id"
  }
}
```

### 2. Namespaced Permission Contract
Custom authorization rules must follow:
*   **Format:** `<domain>.<resource>.<action>`
*   **Validation:** Regex `/^[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+$/`

### 3. API Key Token Structures
All client-facing credentials must adhere to:
*   **Publishable Keys:** `pk_<environment_slug>_<random_bytes>` (e.g. `pk_test_...`, `pk_live_...`)
*   **Secret Keys:** `sk_<environment_slug>_<random_bytes>` (e.g. `sk_test_...`, `sk_live_...`)

---

## 🗺️ Product Roadmap & Priority List

Moving forward, Vera transitions from an authentication project to a full developer-facing Identity Provider (IdP) platform.

### Phase 1 — Platform Health & Test Optimization
*   Verify that all 116 core integration tests pass consistently, ensuring no flakes across sequential suite execution.

### Phase 2 — OAuth2 Authorization Server + OpenID Connect (Highest Priority)
Transform Vera into a complete, standard-compliant OpenID Connect (OIDC) Identity Provider (IdP), allowing applications to support "Login with Vera".
*   **Client Management:** Add database support for third-party `OAuthClient` registrations (client secrets, redirect URIs, scopes, grant types).
*   **Authorization Code Flow:** Implement `/oauth/authorize` with PKCE validation (code challenge/verifier) and consent page routing.
*   **Token Endpoint:** Expose `/oauth/token` to exchange authorization codes or client credentials for access tokens (JWTs) and identity tokens (ID tokens).
*   **OIDC Standard Endpoints:**
    *   `/.well-known/openid-configuration` (well-known configuration endpoint).
    *   `/oauth/certs` or `/.well-known/jwks.json` (JSON Web Key Set exposing public keys for RS256 token verification).
    *   `/oauth/userinfo` (exposing verified claims of the active identity).
    *   `/oauth/revoke` (session and client token invalidation).

### Phase 3 — WebAuthn & Passkeys
Provide modern passwordless and hardware-key security.
*   **Strategy Abstraction:** Implement native FIDO2 registration and assertion protocols.
*   **Biometrics & Hardware Keys:** Add challenge-response checks, parsing of client data and authenticator data, and signature verification (CBOR/COSE).

### Phase 4 — Cryptographically Signed Webhook Engine
Enable developer systems to securely integrate with Vera event-lifecycles.
*   **HMAC-SHA256 Signatures:** Deliver event payloads securely with a signature and timestamp header to block timing and replay attacks.
*   **Reliability:** Implement exponential backoff, retry queues, delivery history tracking, and dead-letter queue handling.

### Phase 5 — Identity Provider Federation (Pluggability)
Refactor and abstract social auth so that developers can plug in custom enterprise and social identity providers as plugins:
```ts
interface IdentityProvider {
  authorize(): Promise<AuthorizeResult>;
  callback(code: string): Promise<CallbackResult>;
  refresh(token: string): Promise<RefreshResult>;
  revoke(token: string): Promise<void>;
  getProfile(credentials: any): Promise<FederatedProfile>;
}
```
*   Enable pluggable providers for Microsoft Entra ID, Okta, custom SAML 2.0, or other social platforms without modifying core monolith layers.

### Phase 6 — OpenAPI Contract & Client SDKs
*   Export a comprehensive OpenAPI 3.0/3.1 specification.
*   Generate or publish native client SDK libraries (`@verahq/node`, `@verahq/react`, and vanilla TS client) to facilitate fast integration.

### Phase 7 — Next.js 15 Developer Dashboard
*   Construct an interactive, beautiful management console using Next.js 15, React, and Tailwind CSS.
*   Enable visual configuration of applications, key rotations, team organization invitations, logs monitoring, and webhooks endpoint registration.

### Phase 8 — Vera Command-Line Interface (CLI)
*   Add a local development utility tool to scaffold applications, migrate test environments, rotate keys, and debug logs directly from terminal.
