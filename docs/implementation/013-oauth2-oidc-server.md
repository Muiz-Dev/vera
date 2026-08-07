# Implementation Report — OAuth2 Authorization Server + OpenID Connect (OIDC) Server (PR #013)

## Executive Summary
This report documents the design, implementation, and verification of the **OAuth2 Authorization Server + OpenID Connect (OIDC) Server** (PR #013) in the Vera platform. This capability enables Vera to act as an RFC-compliant Identity Provider (IdP), allowing third-party client integrations and secure token federation via standard OAuth2 and OpenID Connect flows.

---

## Objectives
1. **Decoupled Monolith Integration:** Implement full OIDC and OAuth2 capabilities as a new decoupled router and sub-layer under authentication without modifying existing password-based or social routes.
2. **Standard-Compliant Endpoint Support:** Provide comprehensive support for standard OIDC endpoints: Discovery (`/.well-known/openid-configuration`), Public JSON Web Key Sets (`/oauth/certs`), Authorization (`/oauth/authorize`), Token Exchange (`/oauth/token`), User Information (`/oauth/userinfo`), and Token Revocation (`/oauth/revoke`).
3. **Robust Signatures & Secure RSA Persistence:** Perform RS256 token signatures with key-ID headers. Maintain environment-isolated signing keys by lazily generating 4096-bit RSA keypairs on first initialization, encrypting private keys at-rest with AES-256-GCM via `EncryptionService`, and exposing only public keys in standard JWK format.
4. **Replay & Code Theft Mitigation:** Prevent authorization code theft by marking codes as single-use, enforcing a strict 5-minute lifetime, and automatically revoking all active issued access/refresh tokens if a used code is submitted twice (Replay Protection).
5. **Multi-Tenant Isolation:** Enforce tenancy context on every standard endpoint by leveraging the existing `requireEnvironment` middleware.

---

## Database Schema Changes
Introduced four new relational database models in `prisma/schema.prisma` mapped to snake_case tables:
- `OAuthClient`: client credentials, metadata (name, client ID, clientSecret hash, redirect URIs, scopes, grant types), and status.
- `OAuthAuthCode`: authorization codes, single-use status, PKCE code challenges, scopes, redirect URI, identity mapping, and expiration.
- `OAuthIssuedToken`: active credentials tracking, hashes of issued access/refresh tokens, and revocation flags.
- `OAuthSigningKey`: environment-isolated 4096-bit RSA signing key pairs (encrypted private keys, public PEMs, and unique key IDs).

Relations updated on existing models:
- `Environment` and `Identity` models updated with relationships to `OAuthClient[]`, `OAuthAuthCode[]`, `OAuthIssuedToken[]`, and `OAuthSigningKey[]`.

---

## API Endpoints

| Method | Path | Description | Access Control |
|---|---|---|---|
| **GET** | `/api/v1/.well-known/openid-configuration` | Returns discovery metadata of standard OIDC properties. | Public |
| **GET** | `/api/v1/oauth/certs` | Exposes standard JSON Web Key Set (JWKS) public keys. | Public |
| **GET** | `/api/v1/oauth/authorize` | Validates client/scopes/PKCE and issues authorization code. | Active authentication |
| **POST** | `/api/v1/oauth/token` | Exchanges authorization code or client credentials for tokens. | Public |
| **GET** | `/api/v1/oauth/userinfo` | Returns sub, email, and email_verified claims for token. | Bearer Token Auth |
| **POST** | `/api/v1/oauth/revoke` | Revokes access or refresh tokens issued by the server. | Client Auth |
| **POST** | `/api/v1/oauth/clients` | Creates a new third-party client registration (facilitates tests). | Active authentication |

---

## Domain Events Published
- `OAuthClientRegistered`: `{ clientId, clientName, environmentId }`
- `OAuthAuthCodeIssued`: `{ clientId, identityId, environmentId, code }`
- `OAuthTokenIssued`: `{ clientId, identityId, environmentId, grantType, accessTokenHash }`
- `OAuthTokenRevoked`: `{ clientId, environmentId, tokenHash }`

---

## Testing & Verification Results
Introduced `tests/integration/oidc.integration.ts` with comprehensive coverage for:
- Discovery metadata structure and dynamic URL mapping.
- Public JWKS key set outputs, active signing-key persistence, and private key encryption.
- Confidential client flow: code issuance, redirect verification, token exchange, and UserInfo querying.
- Public client flow: strict PKCE S256 parameters and validation logic.
- Code reuse detection (Replay Attack): revoking all active credentials on subsequent attempts to use an authorization code.
- Client credentials flow: application-level access token generation.
- Token revocation and multi-tenant environment isolation.

All **123 integration tests passed successfully with 100% green status** across the entire platform.
