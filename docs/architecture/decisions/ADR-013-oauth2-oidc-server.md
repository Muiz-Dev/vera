# ADR-013: OAuth2 Authorization Server + OpenID Connect (OIDC) Server on Vera

## Status
Approved

## Date
2026-08-07

## Context
Vera needs to support third-party client integrations and identity federation via OAuth 2.0 and OpenID Connect (OIDC). To support both third-party client-facing flows and server-to-server integrations, we need to build a lightweight, secure, and multi-tenant authorization server within our Express/Prisma monolith architecture. Key requirements include support for standard OIDC endpoints, cryptographically secure 4096-bit RSA key management, single-use authorization codes with used-code replay detection (mitigating replay attacks by revoking all associated tokens), and strict multi-tenant context enforcement.

## Decision
We implemented a lightweight, RFC-compliant OAuth 2.0 and OpenID Connect (OIDC) Server built natively on top of Express and Prisma without heavy external third-party authorization server packages.

Key aspects of the architectural decisions include:
1. **Extended Schema models:** Created `OAuthClient`, `OAuthAuthCode`, `OAuthIssuedToken`, and `OAuthSigningKey` Prisma models to persist authorization states, registered clients, issued credentials, and signing keys.
2. **Secure Key Management:** Generated 4096-bit RSA signing key pairs dynamically per environment, persisting them securely in the database with AES-256-GCM encrypted private keys via `EncryptionService`. Only public keys are exposed via the `/api/v1/oauth/certs` endpoint in standard JWK format.
3. **Decoupled OIDC Server Module:** Implemented `OidcServerService`, `OidcKeyService`, and `OidcController`, completely decoupled from existing authentication code paths.
4. **Token Security Controls:**
   - Enforce exact redirect URI string matching (no wildcards).
   - Enforce SHA-256 PKCE for public clients.
   - Limit authorization code lifetimes to 5 minutes, enforcing single-use policies.
   - Detect authorization code reuse/replay, revoking all active tokens issued under that authorization code immediately.
   - Support standard OpenID Connect ID Tokens containing `sub`, `email`, and `email_verified` claims signed with RS256.
5. **Multi-Tenancy & Isolations:** Bound every route and token validation strictly to target environments (`environmentId` inside RequestContext) using the standard `requireEnvironment` middleware.

## Alternatives Considered
- **Pulling in heavy third-party OAuth2 libraries (e.g. oauth2-server):** Rejected because they are highly coupled, introduce complex middleware layers, lack modular/multi-tenant flexibility, and create heavy package dependencies.

## Consequences
- **Positive:** Lightweight, RFC-compliant, fully isolated OIDC/OAuth2 server. Features military-grade 4096-bit RSA key isolation, secure AES-encrypted storage of private keys, single-use code security, and deep integration with Vera's existing identity, session, logging, and EventBus frameworks.
- **Negative:** Requires ongoing maintenance of protocol endpoints (Authorize, Token, Discovery, JWKS, UserInfo) as requirements expand.

## Future Considerations
- Future integrations can leverage this OIDC engine to support SAML federation, OAuth 2.1 enhancements, WebAuthn Passkeys, and Dynamic Client Registration without requiring any major refactoring.
