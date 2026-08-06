# ADR-012: Enterprise Multi-Factor Authentication (MFA) Engine

## Status
Approved

## Date
2026-08-06

## Context
As part of Vera's mission to deliver a production-grade, secure-by-default identity monolith, we require a Multi-Factor Authentication (MFA) engine. The MFA engine must support Time-based One-Time Passwords (TOTP), secure backup recovery codes, and trusted device remembering. To align with modern identity standards (like Auth0, Clerk, and Okta), the architecture must be future-ready (extensible to WebAuthn/SMS/Email OTP), enforce strict auditability, prevent replay attacks, support MFA step-up challenges, and maintain perfect environment-level multi-tenancy.

## Decision
We implemented a provider-agnostic, strategy-driven, and highly secure **Multi-Factor Authentication (MFA) Engine**:

1. **Strategy Pattern Decoupling:** An `MfaStrategy` interface defines contracts for setup generation and verification. Concrete `TotpMfaStrategy` implements **RFC 6238** natively without any external dependencies using HMAC-SHA-1 and Base32 decoding, allowing clock drift of +/- 30s. WebAuthn or SMS/Email OTP strategies can be added with zero changes to authentication controllers or flow logic.
2. **Challenge-Based Authentication Flow:** Instead of embedding state inside JWT challenge tokens, we introduced a physical `MfaChallenge` database model. When a user with enabled MFA attempts primary (or social) login, they receive a challenge identifier `{ mfaRequired: true, challengeId: "..." }`. Verification occurs by exchanging this specific challenge ID.
3. **Soft-Disable & Auditing:** To preserve auditability, MFA records are never physically deleted. Disabling MFA sets `enabled = false` and records metadata (`disabledAt`, `disabledBy`, `disableReason`) for analytics and fraud detection.
4. **Argon2id Hashing for Recovery Codes:** Backup recovery codes are formatted as user-friendly alphanumeric strings (`XXXX-XXXX`) and hashed using `Argon2id` prior to database storage, guaranteeing protection against offline attacks.
5. **Replay Window Protection:** The engine records `lastVerifiedCounter` (the TOTP step index) in the database upon verification. Subsequent verification attempts in the same time-step window are rejected, preventing code reuse.
6. **Trusted Device Skipping:** Users can opt to trust their device for 30 days. Devices are fingerprinted, hashed using SHA-256, and stored in a `TrustedDevice` table. Future logins from a trusted device skip the MFA challenge.
7. **Session Revocation Safeguards:** Toggling or disabling MFA immediately invalidates all active session tokens, refresh tokens, and outstanding challenges for that user.

## Consequences
- **Positive:**
  - High extensibility: WebAuthn, hardware keys, or SMS OTP can be easily added as strategy adapters.
  - Zero external package dependencies for TOTP.
  - Bulletproof security: Step-up challenges, Argon2id recovery hashes, replay defense, and password confirmation guards.
  - Clear insights: Exposes rich security metrics inside the Admin module.
- **Negative:**
  - Minor database lookup overhead for challenges and trusted devices, but mitigated by efficient compound index schemas.
