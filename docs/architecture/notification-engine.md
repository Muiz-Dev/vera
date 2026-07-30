# Architecture Decision Record — Notification Engine

## Status
Approved (PR #009)

## Context
Vera requires a professional, unified communication architecture to deliver transactional emails (such as welcome, verification, and password reset flows) across all modules. Direct, scattered emailing from within individual services introduces high coupling, complicates vendor switching, hurts testability, and prevents centralized auditing.

We require a decoupled, modular Notification Engine that processes dispatches asynchronously via EventBus listeners and supports polymorphic providers.

## Decision
We implement a completely event-driven, provider-based **Notification Engine** module.

### 1. Unified Event Interface
All other modules remain completely insulated from email delivery details. They publish standard `DomainEvent` objects to the `EventBus`. The Notification Engine registers EventBus listeners for:
- `DeveloperRegistered` -> Dispatches `Welcome Email`.
- `EmailVerificationRequested` -> Dispatches `Email Verification`.
- `PasswordResetRequested` -> Dispatches `Password Reset`.
- `MemberInvited` -> Dispatches `Organization Invitation`.
- `InvitationAccepted` -> Dispatches `Invitation Accepted` to org admins.
- `ApplicationCreated` -> Dispatches `Application Created`.
- `ApiKeyRotated` -> Dispatches `API Key Rotated`.
- `OwnershipTransferred` -> Dispatches `Ownership Transfer`.
- `OrganizationCreated` -> Dispatches `Organization Created`.
- `SessionRevoked` -> Dispatches `Login Security Alert` on security-sensitive revocations.

### 2. Polymorphic Provider Design
All outbound communication is routed through a unified interface class `NotificationProvider` containing an abstract `send` method. Since the system uses ES Modules, this is implemented as an `abstract class` to guarantee direct ESM runtime class resolution.
- `MockProvider`: Used for development and automated integration test suites. It validates inputs, simulates latency, prints standard logs, and returns a successful response without making network calls.
- `SmtpProvider`: Integrates with standard mail relays using the Nodemailer SMTP transport.
- `ResendProvider`: Integrates with Resend REST APIs using Node's native fetch.
- `SendGridProvider` / `SesProvider`: Stubs ready for future integration.

### 3. Idempotent Bootstrap Seeding
On module initialization, the engine seeds 10 default, production-ready HTML/Text email templates into the database. To prevent duplication or conflicts on consecutive container startups, the bootstrap utilizes a Prisma `upsert` matching on the template's unique name, keeping existing modifications intact.

### 4. Database Schema
Notifications and their delivery records are persisted across three relational models:
- `Notification`: Stores the primary notification record (recipient, subject, channel, type, state, nullable polymorphic owner keys `developerId`, `identityId`, `organizationId`).
- `NotificationTemplate`: Stores the reusable body templates and their personalized placeholder variable list.
- `NotificationLog`: Stores full provider request/response payloads to guarantee auditability.

### 5. Fault Tolerance & Retry Backoff
Outbound network calls to external email delivery vendors are prone to transient network failures. The `NotificationDispatcher` implements a retry loop (up to 3 retries) with short backoff wait times to handle transient failures gracefully before marking a notification as `FAILED`.

## Consequences
- **Decoupled Business Logic**: Adding, removing, or tweaking notification triggers requires zero changes to core services.
- **Provider Portability**: Changing outbound email delivery vendors is a single configuration switch in `.env` (`NOTIFICATION_PROVIDER`), requiring no code changes.
- **100% Testable**: Integration tests execute with 100% reliability because they run against the self-contained `MockProvider`.
- **Complete Auditing**: Full request/response logs are permanently retained in the database for billing, security analysis, and delivery performance audits.
