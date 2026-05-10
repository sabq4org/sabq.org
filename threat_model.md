# Threat Model

## Project Overview

Sabq Smart is a production news platform with a large Express/TypeScript backend, a Next.js/React frontend, PostgreSQL via Drizzle, session-based authentication with Passport, and multiple external integrations for AI, email, messaging, and object storage. The application serves anonymous readers, authenticated users, newsroom staff, and administrators. Production scope for this scan excludes dev-only sandbox behavior and assumes TLS is handled by the platform.

## Assets

- **User accounts and sessions** -- session cookies, password hashes, OAuth identities, and 2FA state. Compromise allows impersonation and access to reader or staff capabilities.
- **Editorial and business data** -- unpublished articles, newsroom workflows, notifications, analytics, and AI-generated drafts. Exposure or tampering can disrupt publishing and damage trust.
- **Uploaded and generated media** -- public article media, staff-uploaded assets, avatars, and private attachments stored in object storage. Some of this content is intended to remain private or access-controlled.
- **Reader and subscriber data** -- email addresses, newsletter subscription state, behavior signals, notification preferences, and engagement history. This is both privacy-sensitive and operationally important.
- **Application secrets and third-party credentials** -- database credentials, storage access, OpenAI/ElevenLabs/SendGrid/Twilio/MailerLite keys, and internal service secrets. Compromise would enable broader service abuse.

## Trust Boundaries

- **Browser/client to Express API** -- all request data is untrusted and must be validated, authenticated, authorized, and rate-limited as appropriate.
- **Public to authenticated/staff/admin surfaces** -- the app exposes many public routes alongside staff-only CMS and admin operations. Server-side access control is required at every boundary.
- **Express API to PostgreSQL** -- the server has broad read/write access to operational and user data; injection or broken authorization here can expose or alter sensitive records.
- **Express API to object storage/CDN** -- the server can read both public and private stored objects. Proxy routes must preserve storage ACL intent rather than turning backend credentials into a public read oracle.
- **Express API to third-party services** -- webhooks and outbound calls to SendGrid, Twilio, MailerLite, AI vendors, and storage/CDN providers cross a service-to-service trust boundary and require authentication, authenticity checks, and abuse controls.
- **Internal service to production API** -- routes intended for internal automation must fail closed and must not become public when secrets are missing or misconfigured.

## Scan Anchors

- **Production entry points:** `server/index.ts`, `server/routes.ts`, split route files under `server/routes/`.
- **Highest-risk areas:** auth/session setup in `server/auth.ts`, RBAC in `server/rbac.ts`, object/media access in `server/routes.ts` + `server/objectStorage.ts` + `server/objectAcl.ts`, inbound webhooks in `server/routes/emailAgent.ts`, `server/routes/whatsappAgent.ts`, and `server/routes/smartNewsletterRoutes.ts`.
- **Surface split:** many reader routes are public; newsroom/CMS/admin routes usually require `isAuthenticated`, `requireAuth`, `requireRole`, or `requirePermission`; internal routes need explicit secret-based auth.
- **Usually dev-only / lower priority unless proven reachable:** local scripts, backup files, and sandbox/mockup-only code paths. Production scan should ignore them unless a live route or deployment path references them.

## Threat Categories

### Spoofing

This project accepts inbound requests from browsers, internal automation, and third-party webhook providers. Routes that represent internal services or external provider callbacks must authenticate the caller directly instead of trusting request body fields alone. Session state must remain bound to authenticated users, and service-to-service routes must fail closed when secrets are absent.

Required guarantees:
- Internal-only routes MUST require a present, correct secret or equivalent service authentication in production.
- Webhooks MUST verify provider authenticity with a signed header or another strong server-verifiable mechanism.
- Public request fields like `from`, `email`, and `sender` MUST NOT be treated as proof of caller identity by themselves.

### Tampering

The platform lets users and automation create or modify content, subscription state, notifications, and stored media references. Because the backend is authoritative, attackers must not be able to enqueue actions, alter subscription state, or manipulate object references without passing server-side authorization and integrity checks.

Required guarantees:
- State-changing routes MUST enforce authorization server-side.
- Webhook-driven state transitions MUST only occur after authenticity checks succeed.
- Client-supplied storage paths, IDs, and payloads MUST be scoped to data the caller is allowed to affect.

### Information Disclosure

The app stores unpublished content, private attachments, user profile media, subscriber data, and analytics. It also has server-side access to object storage buckets. Any proxy or download route that streams objects must preserve the intended visibility of those objects and must not expose private content just because the server itself can read it.

Required guarantees:
- Storage proxy routes MUST enforce object ACLs or restrict reads to explicitly public prefixes.
- API responses and redirects MUST not reveal private object locations or allow arbitrary backend-mediated object reads.
- Sensitive subscriber and behavioral data MUST remain scoped to the correct authenticated user or trusted service.

### Denial of Service

Several public features trigger expensive work such as media streaming, AI calls, and webhook processing. Attackers could use exposed routes to force unnecessary queue growth, object downloads, or third-party service usage.

Required guarantees:
- Publicly reachable expensive routes SHOULD be rate-limited and bounded.
- Internal queueing endpoints MUST not be callable by anonymous users.
- File and webhook processing paths MUST enforce size limits and reject obviously abusive traffic early.

### Elevation of Privilege

The application has strong RBAC concepts, but privilege boundaries can still collapse if public routes bypass object ACLs or if “internal” routes become public through fail-open logic. The key risk in this codebase is not missing role tables; it is side-channel access through helper routes that were meant to be safe wrappers.

Required guarantees:
- Helper and proxy routes MUST enforce the same permissions as the protected resources they expose.
- Server credentials for storage and integrations MUST not act as a privilege escalation path for anonymous callers.
- Public convenience routes MUST be reviewed as carefully as primary CRUD routes because they often cross trust boundaries indirectly.
