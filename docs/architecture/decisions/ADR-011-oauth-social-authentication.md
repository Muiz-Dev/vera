# ADR-011: OAuth & Social Authentication Engine

## Status
Approved

## Date
2026-08-06

## Context
Applications integrated with Vera require the ability to authenticate users (Identities) using third-party social providers like Google and GitHub. This reduces registration friction, simplifies authentication, and eliminates the need for passwords. To build a robust and extensible engine, we need an architecture that supports multi-tenancy, isolates data per environment, provides high security (CSRF & PKCE protection), handles same-email collisions securely, and allows developers to easily plug in new identity providers without changing core logic.

## Decision
We implemented a provider-agnostic, tenant-aware, completely decoupled **OAuth & Social Authentication Engine** integrated directly into the `AuthenticationModule`:

1. **Provider Adapter Architecture:** An `OAuthProvider` interface defines core contracts (`getAuthorizationUrl`, `exchangeCode`, `getUserProfile`). Specific implementations (`GoogleProvider`, `GitHubProvider`) are registered inside `OAuthService`. Additional providers can be added seamlessly by implementing the interface.
2. **Short-Lived Cached Transactions:** Verification state, PKCE `code_verifier`, and metadata are stored in the memory cache layer (`MemoryCacheService`) with a 10-minute TTL. This provides fast, stateless, and secure transaction tracking, immediately invalidated upon validation (replay protection).
3. **Restoring Tenancy on Callback:** Since provider callback redirects are handled by the browser, Vera cannot rely on headers or cookies for resolving `environmentId` during the callback step. Therefore, the target `environmentId` is cached inside the state transaction metadata and dynamically restored into Node's `AsyncLocalStorage` (`RequestContext`) during the callback execution.
4. **Exchange Code Return Pattern:** Instead of returning sensitive session tokens directly in callback query parameters, Vera creates the session and generates a short-lived, single-use `oauthCode`. The browser is redirected back to the client application's final `redirectUri` with this code (e.g. `?code=xxxx`). The client then exchanges this code via a secure backchannel request (`POST /api/v1/auth/oauth/token`) to receive standard JWTs and session data.
5. **No Same-Email Auto-Linking (Option B):** Same-email matches are not auto-linked to prevent account hijacking. If an email/password account already exists, social registration with that email is rejected, and the user must explicitly link the social provider from an active logged-in session.
6. **Provider Token Encryption:** External provider access and refresh tokens are encrypted using AES-256-GCM prior to database storage. A dedicated `OAUTH_TOKEN_ENCRYPTION_KEY` is introduced as a required environment variable.

## Consequences
- **Positive:**
  - High extensibility: Zero changes are required to core auth flows when adding new social providers.
  - Enhanced security: PKCE, state tracking, token encryption, single-use auth codes, and Option B same-email protection guarantee production-grade security.
  - Clear multi-tenancy: Complete environment-level isolation throughout the flow.
- **Negative:**
  - Minor performance impact for token encryption/decryption, but mitigated by using native Node crypto libraries.
