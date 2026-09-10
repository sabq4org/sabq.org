# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (tsx server/index.ts) — serves API + Vite SPA on the same port
npm run build        # Full build: build:client then build:server
npm run build:client # Vite build only (frontend → dist/public/) — used by Cloudflare Pages
npm run build:server # esbuild server bundle only (→ dist/index.js) — used by Railway
npm start            # Production: NODE_ENV=production node dist/index.js
npm run check        # TypeScript typecheck (tsc, noEmit)
npm run db:up        # Start local Docker Postgres + Redis (docker-compose.yml)
npm run db:down      # Stop them; volumes keep data
npm run db:push:local # Schema push to localhost only (rejects neon.tech / remote hosts)
npm run db:push      # Raw drizzle-kit push — prefer db:push:local for dev; prod via push-to-production.sh
./push-to-production.sh <PROD_DATABASE_URL>   # Push schema to production (interactive confirm)
```

Local dev DB (matches `docker-compose.yml`): `postgresql://sabq:sabq_password@localhost:5432/sabq_db` with `DB_DRIVER=pg`. Do **not** set `NEON_DATABASE_URL` locally — runtime prefers it over `DATABASE_URL`. Guide: [`docs/setup/LOCAL_POSTGRES_AR.md`](docs/setup/LOCAL_POSTGRES_AR.md).

`npm run lint` exists (ESLint "stop the bleeding" config — blocks NEW debt only, see `eslint.config.js`; CI lints changed files per PR). Automated tests: Playwright e2e specs under `e2e/` (`npm run test:smoke`, `npm run test:e2e`) **plus** a Vitest unit suite under `tests/unit/` (run with `npm run test:unit`; config in `vitest.config.ts`, wired into CI via `.github/workflows/build-and-unit-tests.yml`). There is no Jest setup. CI workflows in `.github/workflows/`: typecheck + lint on PRs, read-only smoke against sabq.org every 6h and after pushes to main.

Required env vars (full list in `replit.md`; dev template in `.env.example`): for **local** use `DATABASE_URL` + `DB_DRIVER=pg` against Docker Postgres; on **Railway** `NEON_DATABASE_URL` (preferred when set) or `DATABASE_URL` with `DB_DRIVER=pg`. Also: `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, transactional email via `MAILERSEND_API_KEY` or `SENDGRID_API_KEY`, `TWILIO_*`, `GCS_*`, `CLOUDFLARE_IMAGES_*`, `FCM_SERVER_KEY`, `MAILERLITE_API_KEY`, `MAILERLITE_WEBHOOK_SECRET`. `REDIS_URL` is optional locally (falls back to in-memory). Runtime keeps `.env.local`-over-`.env`; Drizzle preserves explicit shell/`SCHEMA_DATABASE_URL` values. `APNS_KEY_ID`, `APNS_TEAM_ID`, and `INDEXNOW_KEY` are env-only — unset means APNs / IndexNow disabled with a startup warning.

## Architecture

### Production topology (sabq.org)
**Cloudflare Pages** (frontend) + **Railway** (API at `api.sabq.org`). Replit and Vercel are not part of production. Canonical ops doc: [`docs/DEPLOYMENT_STATUS.md`](docs/DEPLOYMENT_STATUS.md). Never run `db:push` or any destructive command against the production `DATABASE_URL`; production schema changes go through `./push-to-production.sh`.

```
Browser → Cloudflare Pages (sabq.org)
        ├─ static SPA (dist/public)
        ├─ functions/_middleware.js  (proxy /api/*, slug-redirect, SEO inject)
        └─ Railway api.sabq.org      (Express, SERVE_SPA=false, DB_DRIVER=pg)
```

`REDIS_URL` on Railway is **production-enabled** (typically Upstash) to offload Passport sessions from Neon Postgres — optional only as a code fallback to the `sessions` table. See `docs/DEPLOYMENT_STATUS.md` § Redis.

### Other modes still supported in code
1. **Single-process** — `npm run dev` or `SERVE_SPA=true`: one Express process serves API + SPA. `server/seoInjector.ts` and `server/middleware/slugRedirect.ts` run inline. Dev only.
2. **Headless API** — `SERVE_SPA=false` (the Railway default). Env-flag mechanics under "Headless / split mode" below.

### Single-process mode
`server/index.ts` is the entry. In dev, the same Express server mounts API routes AND proxies the SPA through Vite middleware (`server/vite.ts`); in prod, the same server serves the prebuilt SPA from `dist/public/`. The primary app is React + Vite + Wouter routing (no Next.js in this process), SSR-flavored via the SEO injector that rewrites the prebuilt `index.html` per request.

**`web-next/` is a separate Next.js app (App Router, currently v16)** deployed on Railway and fronted by Cloudflare Pages. It server-renders the public content surfaces (`/`, `/article/*`, `/category/*`, `/en/article/*`, `/ur/article/*`). `functions/_middleware.js` proxies those routes to `NEXT_ORIGIN` when `SSR_ROUTES=on`; when off, the SPA + edge-meta path serves them (instant rollback). `web-next` is data-only — it consumes the existing API via the `seo-bundle`/`home-bundle` endpoints in `server/routes/edgeMeta.ts`; the SPA in `client/` still serves the dashboard, admin, and not-yet-migrated routes. Background: `docs/technical-seo-p3-ssr-completion-2026-06-03.md`.

### Headless / split mode (env flags)
Activated by env flags — no code branches. The mechanism is:
- **`SERVE_SPA=false`** on the backend → `server/index.ts` skips the Vite/static SPA wiring and returns JSON 404 for non-API GETs. Default (unset/anything else) preserves the single-process behavior. Catch-all is at the bottom of the async init in `server/index.ts`.
- **`COOKIE_DOMAIN=<parent domain>` + `COOKIE_SAMESITE=none`** → `server/auth.ts` and `server/csrf.ts` set both the session and CSRF cookies on the parent domain with cross-site flags.
- **`FRONTEND_URL` + `FRONTEND_PREVIEW_PATTERN`** → CORS allowlist in `server/index.ts` accepts the frontend deployment + preview URLs.
- **`VITE_API_URL`** on the frontend (optional) → `client/src/lib/queryClient.ts` exports `apiUrl()` and uses it in `apiRequest`, `getQueryFn`, `trackBeacon`, `fetchCsrfToken`. When unset (production), the frontend uses relative `/api/*` paths and the Pages middleware proxies them to Railway. When set (DIRECT mode, not used in production), the browser hits the API origin directly.
- **`/api/edge/slug-redirect`** and **`/api/edge/seo-meta`** in `server/routes/edgeMeta.ts` → consumed by `functions/_middleware.js`, which does the 301 redirects and HTML-rewriter meta injection at the edge that `server/seoInjector.ts` / `slugRedirect.ts` do inline in single-process mode. The `seo-meta` endpoint covers: Arabic articles (`/article/:slug`), English articles (`/en/article/:slug`), Urdu articles (`/ur/article/:slug`), Arabic/English/Urdu categories, deep analyses (`/omq/:id`), world days (`/world-day/:id`), gulf events (`/gulf/:id`), plus landing pages for `/gulf-live` and `/world-days`. Each handler returns 220-char-truncated descriptions, locale-correct OG tags, and `noindex, follow` for unpublished/missing rows. The full `seoInjector.ts` is NOT reimplemented at the edge — missing vs. the original: JSON-LD structured data, hreflang link chains, Twitter card bytecount tweaks, opinion/reporter/keyword pages. Extend `ROUTE_HANDLERS` in `edgeMeta.ts` if a missing surface starts trending in crawler logs.

Deploy configs:
- `Dockerfile` — the single build source on Railway. Runs `npm run build:server` (server-only bundle), defaults `SERVE_SPA=false`, copies `dist/` and `public/` (for `/branding/`). The image is intentionally headless; local docker-compose users wanting full-stack-on-one-port must override `SERVE_SPA=true` and supply a pre-built `dist/public/`.
- `railway.json` — sets `builder: DOCKERFILE` and points at `Dockerfile`. Healthchecks `/health` with a 60-second timeout. Schema URL `https://schema.up.railway.app/v1.json`. Railway's config-as-code analyzer rejects JSON comments (`"//"`) and fails with "service config at '/' not found" when a `nixpacks.toml` coexists with the Dockerfile — keep the Dockerfile as the single build source and the file comment-free.
- `cloudflare-worker/wrangler.frontend.toml` — the legacy frontend edge worker, **dormant** (its routes were removed when Pages took over edge SEO via `functions/_middleware.js`). Restore its routes only for an emergency rollback.
- `.env.example` (dev) and `.env.railway.example` — env templates with all required keys.

The historical `imagedelivery.net` news archive still lives on Cloudflare Images; moving it to `sabq-news-images` is a separate future phase documented in `docs/R2_NEWS_IMAGES_ROLLOUT.md`.

### Path aliases
- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`
- `@assets/*` → `attached_assets/*` (Vite only)

### Database driver is selectable
[server/db.ts](server/db.ts) supports two drivers via the `DB_DRIVER` env var:
- `neon` (default when unset): `@neondatabase/serverless` over WebSocket.
- `pg`: standard `node-postgres` TCP — **required for local Docker Postgres** and for Railway when talking plain TCP. Wrong driver against non-Neon PG makes `verifyConnection()` hang and leaves the server with no routes.

Local development: `DB_DRIVER=pg` + Docker `postgres` service. Production on Railway runs `DB_DRIVER=pg` against Neon over TCP (see `docs/DEPLOYMENT_STATUS.md`); do not change prod settings from local-dev work.

Seed scripts ([scripts/seed-rbac.ts](scripts/seed-rbac.ts), [scripts/create-admin.ts](scripts/create-admin.ts), [scripts/create-reporter.ts](scripts/create-reporter.ts)) honor `DB_DRIVER` the same way.

### RBAC has two layers and a superuser shortcut
1. **Database (authoritative)**: `roles`, `permissions`, `role_permissions`, `user_roles`, `user_permission_overrides`. Seeded from [scripts/seed-data/roles_and_permissions.sql](scripts/seed-data/) (gitignored — personal data). 9 roles, 164 permissions, 344 mappings.
2. **Hardcoded code mapping ([shared/rbac-constants.ts](shared/rbac-constants.ts))**: `ROLE_PERMISSIONS_MAP` is consulted by `/api/auth/user` to compute the `permissions` array returned to the client. For admin/system_admin, the map contains `["*"]` (literal wildcard, not expanded). `getPermissionsForRoles()` preserves the wildcard verbatim — it must not be replaced with `Object.values(PERMISSION_CODES)` because dozens of frontend permission codes (e.g. `roles.view`, `permissions.manage`, `ads.manage`, `ai.view`, `blocks.manage`) are NOT enumerated in `PERMISSION_CODES` and would be silently dropped.
3. **Frontend wildcard awareness**: `hasPermission` / `hasAnyPermission` / `hasAllPermissions` in [client/src/hooks/useAuth.ts](client/src/hooks/useAuth.ts) AND the three nav-filter hooks ([useNav.ts](client/src/nav/useNav.ts), [useEnglishNav.ts](client/src/nav/useEnglishNav.ts), [useUrduNav.ts](client/src/nav/useUrduNav.ts)) all short-circuit on `permissions.includes("*")`. Any new nav-style permission filter MUST do the same — without it admin sees an empty sidebar.
4. **Backend superuser shortcut**: 15+ places in [server/routes.ts](server/routes.ts) call `getUserPermissions(userId).includes(code)` directly (instead of going through `userHasPermission()`). For this to work for admins whose only signal is `users.role = 'admin'` (text column, no `user_roles` entry), `getUserPermissions` in [server/rbac.ts](server/rbac.ts) checks `SUPERUSER_ROLE_NAMES = ['admin','superadmin','system_admin','system.admin']` first and returns ALL `permissions.code` values for any matching user. Do not weaken this without auditing the 15+ callsites first.

### Drizzle schema is the source of truth
`shared/schema.ts` (~15k lines, 340+ tables) defines the full DB. `npm run db:push` syncs it directly — there is no migration generation step in the regular workflow (the SQL files in `migrations/` are hand-written one-offs, not generated). When adding tables/columns, edit `schema.ts` and `db:push`. Trilingual content uses three parallel table families: `articles`/`en_articles`/`ur_articles`, `categories`/`en_categories`/`ur_categories`, etc. — keep them in sync when adding fields.

### Routes are split, but `routes.ts` is still huge
`server/routes.ts` (~36.3k lines) is the historical monolith. New work increasingly lives in `server/routes/*.ts` modules registered through `server/routes/splitRoutesIndex.ts`. When adding a new endpoint, prefer creating a router module and wiring it into `splitRoutesIndex.ts` rather than appending to `routes.ts`. **ADR-001** ([docs/architecture/ADR-001-data-access-layer.md](docs/architecture/ADR-001-data-access-layer.md), enforced by ESLint `no-restricted-imports`): new route modules must NOT import `db` — Drizzle queries live in feature-scoped service files under `server/services/`, and `server/storage.ts` (~21k lines) is **frozen** (no new methods; 46 legacy route files are grandfathered by name in `eslint.config.js`).

### Three layers of caching, each with invariants
1. **Browser/CDN HTTP cache** — set in the smart-caching middleware near the top of `server/index.ts`. Hashed assets get 1y immutable; HTML SPA routes default to `public, max-age=60, s-maxage=300, stale-while-revalidate=600`.
2. **Noindex override** — any path matched by `isNoindexPath()` in `server/utils/noindexPaths.ts` (dashboard, admin, search, profile, auth, payment, onboarding) MUST ship `Cache-Control: private, no-store`. Two layers enforce this (the smart-cache middleware and the SEO injector). A dev/test guard in `server/index.ts` (`res.on('finish')` hook) **throws** if a noindex route or a 404/410 SPA shell ever leaks `public`, `s-maxage`, or `stale-while-revalidate`. Don't disable this — it catches CDN poisoning regressions.
3. **Server-side cache** — `server/memoryCache.ts` (in-memory) and Redis (via `server/redis.ts`) for sessions and hot data. **Don't redeclare `CACHE_TTL`** as a local variable; it shadows the imported object and silently breaks SWR.

### Storage strategy — staged R2 for news images, Cloudflare Images fallback, S3/R2 for other assets
The storage split is invisible to editors: existing upload endpoints remain unchanged and the server selects the backend. The operational source of truth for the news-image rollout and cache policy is [`docs/R2_NEWS_IMAGES_ROLLOUT.md`](docs/R2_NEWS_IMAGES_ROLLOUT.md).

1. **News images use a staged Cloudflare R2 rollout.** [server/services/newsImageStorageService.ts](server/services/newsImageStorageService.ts) recognizes explicit editorial purposes and routes the configured percentage to `sabq-news-images`, served through `https://media.sabq.org`. It generates UUID paths plus right-sized WebP variants. `NEWS_IMAGES_R2_ROLLOUT_PERCENT` controls the cohort; failures fall back to Cloudflare Images. The current origin cache header is two days for both browser and edge. One-year caching is a later operational stage and MUST follow the purge-on-delete gate documented in the runbook.

2. **Cloudflare Images remains the fallback and hosts the historical archive.** Keep `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_IMAGES_TOKEN`, and `CLOUDFLARE_ACCOUNT_HASH` configured during and after the rollout. Profile images, logos, categories, ads, non-editorial images, and failed R2 news uploads stay here. The archive is not automatically copied to R2. The Cloudflare Images env names are the un-prefixed account id plus singular `CLOUDFLARE_IMAGES_TOKEN`; the account hash is distinct from the account id.

3. **`objectStorage.ts` (S3/R2/local) handles non-image assets.** PDFs, audio, presigned uploads, and generic blobs go through `STORAGE_PROVIDER` (`s3` | `r2` | `local`). This is independent from the dedicated news-image R2 service.

4. **Cloudflare cache purge is separate from Cloudflare Images and R2 credentials.** `server/services/cloudflarePurge.ts` reads `CLOUDFLARE_ZONE_ID` + `CLOUDFLARE_API_TOKEN` (note: `_API_TOKEN`, not `_IMAGES_TOKEN`). Do not confuse these tokens. Before enabling a one-year edge TTL for `media.sabq.org/news/*`, deletion must purge the original and every cached variant.

### SEO + slug pipeline
`server/seoInjector.ts` rewrites `<head>` per-route (titles, OG, JSON-LD) on the prebuilt `index.html`. `server/middleware/slugRedirect.ts` 301-redirects Arabic slugs and `/news/` paths to `/article/{englishSlug}` for **all visitors including crawlers** — keep this in mind when debugging "why is my crawler getting redirected." Cloudflare Image Transform must NOT be applied to `/public-objects/` or `/api/` paths (they return non-image content); see the direct proxies for `/public-objects/*` and `/objects/*` in `server/index.ts`.

### TanStack Query null-guard convention
The query client is configured to return `null` (not `undefined`) for missing data. Every consumer must guard array access:
```ts
const { data: dataRaw } = useQuery(...);
const data = Array.isArray(dataRaw) ? dataRaw : [];
```
Skipping this breaks destructuring defaults across the app.

### AI provider sprawl
The codebase integrates OpenAI, Anthropic, Google Gemini, ElevenLabs, and Google TTS. Routing/abstraction lives in `server/ai-manager.ts`, `server/ai/`, and `server/services/ttsProviderRegistry.ts`. Major AI subsystems each have their own service file: `journalist-agent-ai.ts`, `data-story-ai.ts`, `deepAnalysisEngine.ts`, `embeddingsService.ts`, `recommendation-engine.ts`, `sentiment-analyzer.ts`, `services/aiArticleGenerator.ts`, `services/infographicAiService.ts`, `services/visualAiService.ts`, plus the full **iFox** content-generation system under `server/services/ifox/` and `server/routes/ifox/`. Comment moderation uses GPT-4o-mini via `server/ai/commentModeration.ts`.

### Background jobs
`server/jobs/` holds several dozen cron jobs (node-cron) — content cleanup, AI tasks, calendar reminders, foreign news ingest, push worker, plus a large sports family (World Cup / Gulf / Asian / King's Cup news + predictions + alerts + snaps), etc. They're started during boot in `server/index.ts`/`bootstrap.ts`. Leader election (`server/leaderElection.ts`) ensures jobs only run on one instance. The push notification worker is in `server/jobs/pushWorker.ts` and uses the bus in `server/notificationBus.ts`.

### Auth flows
RBAC seeding lives in `server/seedRBAC.ts` (constants and runtime logic: see the RBAC section above). Auth flows live in `server/auth.ts` (Passport local + Google + Apple), `server/twoFactor.ts` (otplib TOTP), and `server/csrf.ts` (lazy — token only fetched on demand for authenticated state-changing requests).

### Mobile apps
`android/` and `ios/` are Capacitor 7.4.4 projects wrapping the same web app. Mobile-specific API endpoints live in `server/routes/mobileApiRoutes.ts`.

### Cloudflare Worker
`cloudflare-worker/` is a separate deployable that handles edge logic (image transforms, purge batching). Not part of the main Node build — has its own deploy.

## Gotchas

- **Raw `fetch('/api/...')` callsites** (dozens) still exist outside `queryClient.ts`. They work in PROXY mode (the Pages middleware proxy) but would break in DIRECT mode (`VITE_API_URL` set). DIRECT mode is not planned, so there is no conversion campaign — ESLint blocks new raw fetches; convert to `apiUrl()` from `@/lib/queryClient` opportunistically as you touch files.
- **Edit locks** live in [server/routes/articleEditLocks.ts](server/routes/articleEditLocks.ts) (GET / POST / DELETE / heartbeat) over the `articleEditLocks` table plus a cleanup job. Lock TTL is 10 minutes; heartbeats extend it. When these endpoints fail, the dashboard's ArticleEditor shows "تعذر الحصول على قفل التحرير" on every edit. If you find a "schema + cleanup job but no routes" gap elsewhere, follow the same pattern.
- **Seed SQL files can be mojibake.** `scripts/seed-rbac.ts` detects "UTF-8 bytes interpreted as Latin-1" content (e.g. `Ø£Ø­ÙØ¯` instead of `أحمد`) and round-trips through Latin-1 to recover correct UTF-8 before sending to Postgres. If you write a new seed loader, copy that snippet.
- **Railway auto-fix bot has write access to GitHub.** It can open PRs and merge them to `main` when builds fail; commits authored by `railway-app[bot]` on main come from it.
- **Process-level handlers** at the top of `server/index.ts` log uncaughtException/unhandledRejection but don't exit. Be aware when debugging silent failures.
- **`/public-objects/` on single-process mode** falls through to the SPA HTML shell unless the direct proxy in `server/index.ts` intercepts first. On Pages production, `/api/*` is proxied to Railway — do not assume single-process routing. The proxy uses `ObjectStorageService.searchPublicObject()` for dual-bucket fallback.
- **Rate limiting** keys off `x-sabq-client-ip` / `true-client-ip` first, then `cf-connecting-ip`, then `x-forwarded-for` (`rateLimitKey` in `server/index.ts`). Authenticated users (sessions) and GET requests are skipped — only anonymous writes are throttled. **Gotcha:** Cloudflare Pages/Worker `fetch()` proxy to `api.sabq.org` rewrites `cf-connecting-ip` to a single egress IP, collapsing every visitor into one write bucket → site-wide HTTP 429 on login/comments. Pages middleware must set `X-Sabq-Client-IP` from the inbound request; mobile can bypass the proxy via `api.sabq.org` directly. Full writeup: `docs/ratelimit-edge-ip-fix-2026-06-03.md`.
- **Communication style preference** (from `replit.md`): simple, everyday language. The project README and most user-facing strings are Arabic; preserve RTL/Arabic conventions when editing UI.

## Pointers

**`docs/PREDICTION_CORE.md` is the canonical note for the central sports-predictions platform**: one engine + versioned scoring profiles + append-only ledger serving every tournament except World Cup 2026, whose legacy `wc*` engine is kept separate and untouched. There are no per-tournament prediction engines — new tournaments are configured (Competition + Profiles + fixture source), never coded.

`docs/DEPLOYMENT_STATUS.md` is the canonical production topology note (Pages + Railway). `replit.md` is the legacy architecture note — still useful for stack/product context. `docs/STRUCTURE.md` is the documentation map (`docs/architecture/`, `docs/setup/`, `docs/handoff/`, `docs/reports/`, `docs/reference/`); `docs/architecture/SYSTEM_DOCUMENTATION.md` and the rest of `docs/` have deeper feature writeups (audio newsletters, mobile API, SendGrid, Cloudflare purge, etc.).
