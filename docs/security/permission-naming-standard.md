# Permission Naming Standard

To ensure platform-wide consistency, scalability, and ease of auditing, all permission names in Vera must strictly adhere to the standardized namespaced naming convention:

```text
<domain>.<resource>.<action>
```

## Structure Definitions

### 1. `<domain>`
Represents the architectural module or business domain that owns the resource.
- Examples: `authorization`, `identity`, `authentication`, `billing`, `organization`.

### 2. `<resource>`
Represents the target entity or logical object being accessed.
- Examples: `roles`, `permissions`, `profile`, `subscription`, `members`.

### 3. `<action>`
Represents the atomic action being executed on the resource.
- Examples: `create`, `read`, `update`, `delete`, `assign`, `revoke`.

---

## Standard Permission Examples

| Permission Name | Display Name | Description |
| :--- | :--- | :--- |
| `authorization.roles.create` | Create Role | Allows creating custom roles |
| `authorization.roles.read` | Read Roles | Allows viewing role metadata |
| `authorization.roles.update` | Update Role | Allows modifying custom role metadata |
| `authorization.roles.delete` | Delete Role | Allows soft deleting custom roles |
| `authorization.permissions.assign` | Assign Permission | Allows assigning permissions to custom roles |
| `authorization.permissions.revoke` | Revoke Permission | Allows revoking permissions from custom roles |
| `identity.profile.update` | Update Profile | Allows changing user profile information |

---

## Validation Enforcement
The format is strictly enforced at the API controller layer using custom Zod regex validators:

```regex
/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/
```

Any attempt to create a permission that does not follow this format will fail with a `400 Bad Request` and an `ERR_VALIDATION_FAILED` code.
