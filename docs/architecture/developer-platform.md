# Developer Platform Architectural Specification

## Status
Approved

## Context
Vera is designed to serve as a multi-tenant cloud Identity-as-a-Service (IDaaS) platform. In earlier phases, `Identity` and RBAC models existed globally, meaning there was no separation between different customers' applications or testing vs production data. To achieve production readiness, the system must support Applications and separate isolated Environments.

## Design Decisions

### 1. Environment-Level Isolation Scope
Instead of nesting user databases at the Application level, we partition all tenant-scoped tables (`Identity`, `Role`, `Permission`, `Policy`, etc.) by `Environment`.

#### Rationale:
- Developers need guarantees that Staging automated tests cannot pollute or write to Production.
- Users can have the same email address across different environments (e.g. `tester@example.com` exists in Dev and Staging with different passwords and permissions).
- Prevents cross-environment token leakage or security breaches.

### 2. Context Propagation via AsyncLocalStorage
We leverage Node's `AsyncLocalStorage` (`RequestContext`) to propagate the active `environmentId` throughout the thread-safe request execution flow.

#### Rationale:
- Avoids refactoring every service and repository method signature to pass `environmentId`.
- Centralizes security: since the database access layer fetches `environmentId` directly from `RequestContext.environmentId`, developers cannot accidentally forget to pass the filter in their queries, completely eliminating cross-tenant leakage.

### 3. API Key Format and Prefix Standards
API Keys must be cryptographically secure and easily distinguishable by developers and log systems.
- **Publishable Keys**: Used in client SDKs.
  - Prefix: `pk_test_`, `pk_staging_`, `pk_live_`
- **Secret Keys**: Used on secure servers.
  - Prefix: `sk_test_`, `sk_staging_`, `sk_live_`
- **Token**: Prefix followed by 24 cryptographically random bytes (48 hex characters).

---

## Request Validation Flow

```text
Client Request
      │
      ▼
environmentResolverMiddleware
      │
      ├── Resolve environmentId via headers (x-environment-id, x-api-key)
      ├── Or decode access token JWT environmentId claim
      │
      ▼
Propagate environmentId to RequestContext store
      │
      ▼
requireEnvironment Guard
      │ (If missing, block with 400 Bad Request)
      ▼
Controller / Service Execution
      │
      ▼
Prisma Database Query (Filters automatically by RequestContext.environmentId)
```
