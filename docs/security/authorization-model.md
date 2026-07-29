# Authorization Security Model

## Core Concepts

### 1. Separation of Concerns
Authentication proves **who you are** (handled by the Authentication Engine) while Authorization determines **what you are allowed to do** (handled by the Authorization Engine). The two layers are strictly decoupled.

### 2. Default Deny
Every access attempt defaults to a strict `DENY` unless a rule or permission explicitly permits the action.

### 3. Role-Based Access Control (RBAC)
Identities are assigned Roles, which are in turn mapped to specific namespaced Permissions. Users inherit permissions solely through their assigned roles.

## Evaluation Pipeline
The claim resolution pipeline works as follows:

```text
IdentityId (stateless from JWT)
       │
       ▼
Fetch assigned active Roles (IdentityRole mapping)
       │
       ▼
Fetch Permissions mapped to those active Roles (RolePermission mapping)
       │
       ▼
Exclude any soft-deleted Roles or Permissions
       │
       ▼
Deduplicate permission strings into a flat, unique Set
       │
       ▼
Check if the requested action matches any string in the flat Set
       │
       ▼
Publish 'AuthorizationEvaluated' Event
       │
       ▼
Decision: GRANT or DENY
```

## System Reserved Roles
Vera includes three built-in system-reserved roles that are flagged with `isSystem = true` in the database:
- `owner`: Represents the highest administrative principal with full operational control.
- `administrator`: Represents system operators managing roles, permissions, identities, and settings.
- `system`: Represent internal automated platform background processes.

### Protection Rules
To maintain the platform's security boundaries, the following rules are strictly enforced:
1. **No direct API mutations**: System-reserved roles cannot be deleted, renamed, or modified via standard administration APIs.
2. **No assignments bypass**: Even administrative users must receive permissions explicitly through standard evaluation. There are no hard-coded backdoors.
