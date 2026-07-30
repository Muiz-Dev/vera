# PR #009 — Notification Engine (Phase 7)

## Executive Summary
This implementation report documents the complete delivery of the production-ready **Notification Engine** (PR #009), representing Phase 7 of the Vera roadmap. It introduces a centralized, completely event-driven communication layer for Vera. No individual module sends emails directly. Instead, modules publish domain events to the central `EventBus`, which are processed and dispatched by the Notification Engine through a configurable, provider-based architecture.

## Objectives
- Implement a centralized, modular, and completely event-driven communication layer.
- Design a provider abstraction supporting multiple email delivery providers (Mock, SMTP, Resend, and stubs for SendGrid/SES).
- Seamlessly subscribe to existing and new platform events on the `EventBus` to trigger notifications.
- Seed default, idempotent, reusable HTML and Text email templates.
- Support complete template CRUD operations under granular RBAC permission scopes.
- Deliver extensive integration test suites verifying 100% of event dispatches, template rendering, retry logic, persistence logs, and permission enforcements.

## Architecture Decisions
1. **Event-Driven Isolation**: Business modules are completely decoupled from notification delivery. No module imports the Notification module or triggers mailers directly. They publish standard `DomainEvent` objects on the `EventBus`, which the Notification Engine intercepts asynchronously.
2. **Provider Abstraction**: A unified abstract `NotificationProvider` class defines the interface. Concrete implementations inherit from this base class to ensure strict ESM runtime class resolution:
   - `MockProvider` (Latency simulation and log recording for Dev/Test)
   - `SmtpProvider` (Production SMTP transport using Nodemailer)
   - `ResendProvider` (HTTP Fetch-based integration with Resend REST API)
   - `SendGridProvider` / `SesProvider` (Stubs ready for future expansion)
3. **Idempotent Bootstrapping**: Default notification templates are seeded into the database upon container initialization, ensuring duplicate templates are never created on consecutive application restarts.
4. **Retry & Backoff Logic**: Built-in retry mechanism inside `NotificationDispatcher` executes up to 3 automatic delivery retries with exponential backoff on transient network failures, recording full auditability histories.
5. **Polymorphic Database Associations**: Notifications are linked polymorphically through nullable foreign keys to their owner entities (`developerId`, `identityId`, `organizationId`), preserving context and ownership.

## Database Schema Changes
Introduced the following new models and relations in `prisma/schema.prisma` mapped to snake_case tables:
- `Notification`: id, developerId (nullable), identityId (nullable), organizationId (nullable), type, channel, recipient, subject, payload (Json), provider, status, error (nullable), retries, sentAt, timestamps.
- `NotificationTemplate`: id, name (unique), subject, htmlTemplate, textTemplate, variables (Json), enabled, timestamps.
- `NotificationLog`: id, notificationId, provider, request (Json), response (Json), status, createdAt.

Relations updated on existing models:
- `Developer.notifications`: Relation to `Notification` (SetNull on delete).
- `Identity.notifications`: Relation to `Notification` (Cascade on delete).
- `Organization.notifications`: Relation to `Notification` (SetNull on delete).

## API Endpoints
All endpoints are versioned, mount under `/api/v1`, and are strictly protected by authentication and RBAC permissions:
- `GET /api/v1/notification-templates` - Lists all reusable templates (Requires `notification.template.read`).
- `POST /api/v1/notification-templates` - Creates a custom template (Requires `notification.template.write`).
- `PATCH /api/v1/notification-templates/:id` - Updates a template (Requires `notification.template.write`).
- `DELETE /api/v1/notification-templates/:id` - Deletes a template (Requires `notification.template.write`).
- `GET /api/v1/notifications` - Lists all dispatched notifications (Requires `notification.read`).
- `GET /api/v1/notifications/:id` - Retrieves detailed status and delivery log records (Requires `notification.read`).
- `POST /api/v1/notifications/test` - Triggers a test send of any template (Requires `notification.send`).

## Business & Event Validation Rules
- **Syntactic Correctness**: Zod-based schemas strictly validate emails, templates, custom placeholder variables, and provider types.
- **Template Variables Enforcement**: The dispatcher validates incoming event payloads to ensure all placeholders required by the target template (e.g. `{{resetLink}}`, `{{organizationName}}`) are supplied.
- **Security Login Alerts**: Hooks into the `SessionRevoked` event, analyzing the revoke reason. It triggers a "Login Security Alert" email ONLY for security-sensitive reasons (replay attacks, compromises, suspicious activities).

## Seeding Templates
Seeded 10 production-quality email templates on startup:
1. `Welcome Email` (Developer Registered)
2. `Email Verification` (Identity verification)
3. `Password Reset` (Identity credential recovery)
4. `Organization Invitation` (Collaborator invited)
5. `Invitation Accepted` (Notifies org owners/admins)
6. `Application Created` (Developer bootstrapped application)
7. `API Key Rotated` (Environment security event)
8. `Ownership Transfer` (Organization ownership change)
9. `Login Security Alert` (Suspicious revocation detected)
10. `Organization Created` (Developer bootstrapped workspace)

## Testing & Integration Results
Delivered a highly robust, self-contained integration test suite in `tests/integration/notification.integration.ts` verifying all requirements.
- **100% Pass Rate (18/18 tests)**: Tested CRUD, RBAC permission rejections, test sends, full EventBus-driven workflow dispatches, automatic retries with backoff, and database persistence logs.
- **Zero Regressions**: Successfully verified the complete Vera platform integration suite (all 88 tests pass cleanly).
