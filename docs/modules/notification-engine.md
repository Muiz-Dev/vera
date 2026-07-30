# Notification Engine Module

## Overview
The **Notification Engine** acts as the centralized, modular, and completely event-driven communication layer for the entire Vera Security Platform. No module within the Vera ecosystem is allowed to send emails directly. Instead, modules publish standard domain events to the central `EventBus`. The Notification Engine subscribes to these events, resolves the required email templates, renders personalization placeholders, selects the appropriate delivery provider, and handles the delivery.

## Key Features
- **Centralized Mail Routing**: All email dispatches go through the centralized `NotificationDispatcher`.
- **Abstract Provider Architecture**: Decouples business logic from delivery APIs. Supports Mock (development/test fallback), SMTP (nodemailer transport), and Resend (REST API fetch) configurations.
- **Template Personalization**: A high-performance template rendering engine replaces placeholders (e.g. `{{firstName}}`, `{{resetLink}}`) with event-driven payload context.
- **Idempotent Bootstrapping**: Default production-ready email templates (Welcome, Verification, Reset, Org Invitation, etc.) are seeded into the database on module startup.
- **Fault-Tolerant Delivery**: Built-in exponential backoff retry mechanism (max 3 retries) on transient network failures.
- **Complete Auditing**: Every notification and provider raw API request/response is recorded in the `Notification` and `NotificationLog` tables.
- **Granular RBAC Enforcements**: Endpoints are secured under `notification.read`, `notification.send`, `notification.template.read`, and `notification.template.write` permissions.

## Directory Structure
```
src/modules/notification/
├── controllers/
│   └── notification.controller.ts     # Express request handlers
├── providers/
│   ├── provider.interface.ts          # Base class and SendOptions type
│   ├── mock.provider.ts               # Simulated successful dispatch
│   ├── smtp.provider.ts               # Nodemailer SMTP transport
│   ├── resend.provider.ts             # HTTP fetch integration
│   ├── sendgrid.provider.ts           # SendGrid stub
│   └── ses.provider.ts                # Amazon SES stub
├── routes/
│   └── notification.routes.ts         # Secured route paths
├── services/
│   ├── template.service.ts            # Variable parsing and replacement
│   ├── provider.resolver.ts           # Decides which provider to use
│   ├── notification.dispatcher.ts     # Main orchestrator (render, send, log, retry)
│   └── notification.service.ts        # Business logic CRUD and test utility
├── validators/
│   └── notification.validator.ts      # Zod validation schemas
├── notification.module.ts             # Module bootstrap, seeder, event listeners
└── index.ts                           # Module root exports
```

## Configuration (Environment Variables)
Support the following parameters in `.env`:
- `NOTIFICATION_PROVIDER`: `"mock" | "smtp" | "resend" | "sendgrid" | "ses"` (default is `"mock"`)
- `SMTP_HOST`: The SMTP server host address (e.g. `smtp.mailtrap.io`).
- `SMTP_PORT`: Port number (defaults to `587`, or `465` for secure SSL).
- `SMTP_USER`: Authentication user.
- `SMTP_PASSWORD`: Authentication password.
- `SMTP_FROM`: Standard sender address (defaults to `Vera Security <no-reply@vera.security>`).
- `RESEND_API_KEY`: API authorization token for Resend.
- `NOTIFICATION_QUEUE_ENABLED`: Prepared for future async message queue processors.

## RBAC Permissions
- `notification.read`: Allows reading dispatched notifications and logs (`GET /api/v1/notifications`, `GET /api/v1/notifications/:id`).
- `notification.send`: Allows dispatching test emails (`POST /api/v1/notifications/test`).
- `notification.template.read`: Allows viewing notification templates (`GET /api/v1/notification-templates`).
- `notification.template.write`: Allows managing templates (`POST`, `PATCH`, `DELETE` on `/api/v1/notification-templates`).
