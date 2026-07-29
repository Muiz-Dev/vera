# PR #007 — Organization Engine

## Executive Summary
This implementation report documents the complete delivery of the production-ready **Organization Engine** (PR #007), representing Phase 6 of the Vera roadmap. It introduces `Organization` as a first-class, developer-owned shared workspace where multiple developers can securely collaborate to manage applications, settings, permissions, and resources. By decoupling team/organization structures from individual user identities, Vera now establishes the collaboration layer sitting directly above the Developer Platform.

## Objectives
- Establish the concepts of `Organization` as the primary shared workspace boundary for developers.
- Allow developers to participate in multiple organizations with distinct access levels.
- Support complete Organization CRUD, including soft-deletion and metadata management.
- Implement token-based invitations (`OrganizationInvitation`) with standard email validation, expiry checks, and role mappings.
- Design and enforce hierarchical organization roles: `OWNER`, `ADMINISTRATOR`, `MANAGER`, `DEVELOPER`, `BILLING`, and `VIEWER`.
- Deliver full activity auditing by logging structured activity records (`OrganizationActivity`) for all significant events.
- Enforce organization-level boundaries: prevent non-members from reading or modifying organizational details and restrict certain actions (like creating applications) based on membership roles.
- Publish domain events to the `EventBus` for seamless event-driven cross-module synchronization.
- Deliver extensive integration test suites verifying 100% of these collaboration boundaries.

## Architecture Decisions
1. **Developer-Owned Hierarchy**: Organizations sit directly under developers, serving as a container for applications.
   `Developer -> Organization -> Applications -> Environments -> Identities -> Authentication -> Authorization`
2. **Backward Compatibility**: To support existing standalone applications, the `organizationId` field on `Application` is nullable (`String?`), allowing smooth backward compatibility and sequential migration support.
3. **Transaction Batching & Domain Integrity**: Organization creation is fully transactional (bootstrapping both the organization and the owner's membership in a single atomic `$transaction`). Similarly, accepting invitations atomically modifies the invitation state, registers the member, and emits the events.
4. **Hierarchical Role Restrictions**: Membership removal and settings update rules strictly evaluate the member's role against defined permission boundaries:
   - `OWNER` can transfer ownership, delete the organization, and remove any other member.
   - `ADMINISTRATOR` can invite members, update metadata, and remove `MANAGER`, `DEVELOPER`, `BILLING`, and `VIEWER` roles.
   - `MANAGER` can update metadata and remove `DEVELOPER`, `BILLING`, and `VIEWER` roles.
   - `VIEWER` is completely read-only and blocked from creating applications.

## Database Schema Changes
Introduced the following new models and relations in `prisma/schema.prisma` mapped to snake_case tables:
- `Organization`: id, name, slug (unique), description, logoPlaceholder, website, metadata, status, deletedAt, timestamps.
- `OrganizationMember`: id, organizationId, developerId, role (OWNER, ADMINISTRATOR, etc.), timestamps, with `organizationId_developerId` compound unique constraint.
- `OrganizationInvitation`: id, organizationId, email (lowercase), role, token (unique), invitedById, status, expiresAt, acceptedAt, revokedAt, timestamps.
- `OrganizationActivity`: id, organizationId, developerId (nullable), action, details, createdAt.

Updated `Application` to support relation:
- `organizationId` (nullable, ondelete Cascade) pointing to `Organization`.

## API Endpoints
All endpoints are versioned and mounted under `/api/v1`:
- `POST /api/v1/organizations` - Creates an organization (sets creator as OWNER).
- `GET /api/v1/organizations` - Lists organizations the developer belongs to.
- `GET /api/v1/organizations/:id` - Retrieves a specific organization.
- `PATCH /api/v1/organizations/:id` - Updates organization details (requires OWNER, ADMINISTRATOR, or MANAGER).
- `DELETE /api/v1/organizations/:id` - Soft deletes an organization (requires OWNER).
- `GET /api/v1/organizations/:id/members` - Lists members.
- `DELETE /api/v1/organizations/:id/members/:developerId` - Removes a member or leaves the organization (enforces role hierarchies).
- `POST /api/v1/organizations/:id/transfer-ownership` - Transfers ownership to another member (requires OWNER).
- `POST /api/v1/organizations/:id/invitations` - Invites a developer (requires OWNER, ADMINISTRATOR, or MANAGER).
- `GET /api/v1/organizations/:id/invitations` - Lists invitations.
- `POST /api/v1/invitations/:token/accept` - Accepts an active invitation.
- `POST /api/v1/organizations/:id/invitations/:invitationId/revoke` - Revokes an active invitation.
- `GET /api/v1/organizations/:id/activities` - Lists activity audits.

## Business & Validation Rules
- **Unique Slug Enforcement**: Organization slugs must be lowercase, URL-friendly, and globally unique.
- **Invitation Lifecycle**: Invitations are token-based, expire automatically in 7 days, and can only be accepted by an authenticated developer whose registered email matches the invited address.
- **Auditing & Event Publishing**: Emits corresponding event bus notifications (`OrganizationCreated`, `MemberInvited`, `InvitationAccepted`, etc.) and persists structured audit activity entries.

## Testing & Integration Results
Delivered a complete, isolated integration test suite in `tests/integration/organization.integration.ts` verifying all requirements.
- **100% Pass Rate (13/13 tests)**: Verified CRUD, invitation flow, membership, role hierarchy, ownership transfer, soft delete, activity logging, and application creation isolation.
- **Platform Integrity**: Successfully executed the entire platform suite (all 70 tests passed flawlessly with zero regressions).

## Known Limitations & Deferred Work
- Sending emails for invitations is mocked via domain event dispatching; real SMTP routing will be introduced in the Notification Engine (Phase 9).
