# Authorization Module

## Overview
The Authorization Module determines what an authenticated identity is allowed to do. It answers the question "What can this user do?" after identity has been verified by the Authentication Engine.

## Core Services & Architecture
The module is divided into highly specific, decoupled services to ensure scalability:

```text
       Express Request
              │
              ▼
    requireAuthentication()
              │
              ▼
     AuthorizationService
       ┌──────┴──────┐
       ▼             ▼
PermissionResolver  PermissionEvaluator
       │             │
       ▼             ▼
   Repositories   EventBus / Auditing
```

### 1. AuthorizationService
The unified entry point for all authorization requests, updates, and assignments. Keeps caches in sync, validates namespaced naming conventions, and guards system reserved records.

### 2. PermissionResolver
Calculates effective, deduplicated lists of roles and permissions for any given identity based on their assigned roles.

### 3. PermissionEvaluator
Resolves permission decisions (GRANT or DENY) and dispatches standardized audit events.

### 4. Cache System
Integrates with `ICacheService` to store resolved claims. Cache invalidation is automatically triggered on any assignment changes to maintain strict cache consistency.

## REST API Resources

### Roles
- `POST /api/v1/roles` — Create Role
- `GET /api/v1/roles` — List Roles
- `GET /api/v1/roles/:id` — Get Role Details
- `PATCH /api/v1/roles/:id` — Update Role (Disallowed for system roles)
- `DELETE /api/v1/roles/:id` — Soft Delete Role (Disallowed for system roles)

### Permissions
- `POST /api/v1/permissions` — Create Permission
- `GET /api/v1/permissions` — List Permissions

### Role Permissions Map
- `POST /api/v1/role-permissions/:roleId` — Assign permission to role
- `DELETE /api/v1/role-permissions/:roleId/:permissionId` — Revoke permission from role

### Identity Roles Map
- `POST /api/v1/identity-roles/:identityId` — Assign role to identity
- `DELETE /api/v1/identity-roles/:identityId/:roleId` — Remove role from identity
- `GET /api/v1/identity-roles/:identityId/permissions` — Fetch resolved permissions
