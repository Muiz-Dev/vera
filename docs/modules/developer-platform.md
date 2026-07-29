# Developer Platform Module Guide

## Overview
The **Developer Platform Module** acts as the tenancy orchestrator for the Vera platform. It manages the life cycle of developer accounts, applications, environments, API keys, allowed origins, and configurations. It bridges the gap between administrative controls (Developers managing their apps) and client-side execution (Identities authenticating against environment endpoints).

## Module Architecture
The module is structured with strict separation of concerns under `src/modules/developer/`:
- `controllers/developer.controller.ts`: Translates Express request context, guards parameter safety, and formats standard responses.
- `services/developer.service.ts`: Houses transactional workflows for application creation, default environment seeding, keys provisioning, and role/permission bootstrapping.
- `repositories/developer.repository.ts`: Encapsulates database writes, updates, and inclusions.
- `validators/developer.validator.ts`: Houses strict Zod schemas for payload constraints.
- `types/developer.types.ts`: Standardizes module data transfer interfaces.

---

## Data Model Relationships

```text
Developer
   │ (1)
   └─── (Many) Application
                  │ (1)
                  └─── (3) Environment (Development, Staging, Production)
                             │
                             ├── (2) ApiKey (Publishable, Secret)
                             ├── (Many) AllowedOrigin
                             ├── (1) ApplicationSettings
                             └── (Many) Identity / Role / Permission / Policy (Tenant Data)
```

---

## Features and Capabilities

### 1. Application Creation & Seeding
When a developer registers an application, Vera transactionally provisions the complete stack required to start building.
1. Creates `Application` and checks slug uniqueness.
2. Creates three `Environment` records (Development, Staging, Production).
3. Provisions a Publishable and Secret key pair for each environment.
4. Populates default `ApplicationSettings` (JWT times, session timeouts, password strength rules).
5. Seeds system-reserved roles (`owner`, `administrator`, `system`) and defaults standard permissions.

### 2. API Key Rotation
API key rotation instantly revokes active keys and creates a fresh publishable/secret pair, securing compromised environments within a single database transaction.

### 3. Allowed Origin Constraints (Allowed Origins)
Maintains unique domain whitelist origins (`AllowedOrigin`) for each environment to prevent unauthorized cross-origin requests and redirect pollution.

### 4. Tenancy Isolation
All end-user endpoints (Identities, Login, Claims, and RBAC) require a validated `environmentId`. The system automatically resolves this from incoming API keys or decoded access tokens, ensuring absolute logical data isolation.
