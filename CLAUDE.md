# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Split of roles:** [`AGENTS.md`](AGENTS.md) holds the general rules in Arabic (fixed rules, merge/DB safety, workflows, platform philosophy, editorial policy) and is mandatory. This file holds technical details only. Rules stated there are not repeated here.

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
npm run db:push:staging # Schema push to the isolated Railway staging Postgres (see docs/DEPLOYMENT_STATUS.md § staging)
npm run db:push      # Raw drizzle-kit push — prefer db:push:local for dev; prod via push-to-production.sh
npm run lint         # ESLint (CI lints only changed .ts/.tsx files, whole-file)
npm run test:unit    # Vitest unit suite (tests/unit/)
npm run test:web-next # Vitest suite for web-next
npm run systems:inventory # Refresh docs/systems inventory snapshot
./push-to-production.sh <PROD_DATABASE_URL>   # Push schema to production (interactive confirm)
```

Local dev DB (matches `docker-compose.yml`): `postgresql://sabq:sabq_password@localhost:5432/sabq_db` with `DB_DRIVER=pg`. Do **not** set `NEON_DATABASE_URL` locally — runtime prefers it over `DATABASE_URL`. Guide: [`docs/setup/LOCAL_POSTGRES_AR.md`](docs/setup/LOCAL_POSTGRES_AR.md).

ESLint is a "stop the bleeding" config — blocks NEW debt only (`eslint.config.js`). Automated tests: Playwright e2e under `e2e/` (`test:smoke`, `test:e2e`) and Vitest under `tests/unit/` (`vitest.config.ts`). There is no Jest setup. CI gates and their traps: see **CI gates** below.

Required env vars (dev template in `.env.example`, Railway template in `.env.railway.example`; `replit.md` has a legacy list): for **local** use `DATABASE_URL` + `DB_DRIVER=pg` against Docker Postgres; on **Railway** `NEON_DATABASE_URL` (preferred when set) or `DATABASE_URL` with `DB_DRIVER=pg`. Also: `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, transactional email via `MAILERSEND_API_KEY` or `SENDGRID_API_KEY`, `TWILIO_*`, `GCS_*`, `CLOUDFLARE_IMAGES_*`, `FCM_SERVER_KEY`, `MAILERLITE_API_KEY`, `MAILERLITE_WEBHOOK_SECRET`. `REDIS_URL` is optional locally (falls back to in-memory). Runtime keeps `.env.local`-over-`.env`; Drizzle preserves explicit shell/`SCHEMA_DATABASE_URL` values. `APNS_KEY_ID`, `APNS_TEAM_ID`, and `INDEXNOW_KEY` are env-only — unset means APNs / IndexNow disabled with a startup warning.

## Architecture

### Production topology (sabq.org)
**Cloudflare Pages** (frontend) + **Railway** (API at `api.sabq.org`). Replit and Vercel are not part of production. Canonical ops doc: [`docs/DEPLOYMENT_STATUS.md`](docs/DEPLOYMENT_STATUS.md).

```
Browser → Cloudflare Pages (sabq.org)
        ├─ static SPA (dist/public)
        ├─ functions/_middleware.js  (proxy /api/*, slug-redirect, SEO inject)
        └─ Railway api.sabq.org      (Express, SERVE_SPA=false, DB_DRIVER=pg)
```

The Railway API service (`sabq.org`) runs **2 replicas** (since 2026-10-13, after breaking-news CPU saturation on one replica). Code must stay multi-replica safe: `server/memoryCache.ts` and other in-process caches are per replica (shared state goes to Redis or Postgres), and cron jobs run on the leader only (`server/leaderElection.ts`). Replica count is changed in the Railway dashboard, not in code.

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
5. **Role denies win over grants**: `ROLE_PERMISSION_DENY_MAP` in `shared/rbac-constants.ts` strips publish/schedule/edit_any/delete/archive/`opinion.publish`/`opinion.review` from `opinion_author` and `reporter` even if the DB grants them, and applies inside `getUserPermissionData` in `server/rbac.ts` (#1869).

### Drizzle schema is the source of truth
`shared/schema.ts` (~15k lines, 340+ tables) defines the full DB. `npm run db:push` syncs it directly — there is no migration generation step in the regular workflow (the SQL files in `migrations/` are hand-written one-offs for production reconciliation such as constraints and validation, not generated). When adding tables/columns, edit `schema.ts` and `db:push` locally; for production write a new dated SQL file in `migrations/` (process and safety rules: AGENTS.md § Workflow C).

**`sabq_runtime` grants.** The production API connects as the `sabq_runtime` role, which does NOT inherit privileges on tables created by the owner role. A new table without a GRANT makes its routes fail with `42501` / HTTP 500 (this broke `/api/mawaeed`, #1758). Every migration that creates a table must GRANT the minimum privileges to `sabq_runtime` (usually `SELECT, INSERT[, UPDATE]`; avoid `DELETE` unless needed), guarded by `IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sabq_runtime')` or failing explicitly, and end with a `has_table_privilege` verification SELECT. Grants are not applied on deploy — the owner runs the file in the Neon SQL editor. Examples: `migrations/20261002_publish_first_runtime_grants.sql`, `20261007_logo_library.sql`, background in `docs/systems/ai-hub/RUNTIME_READ_ACCESS.md`. Indexes on a new empty table in the same file may be plain; on existing tables use `CREATE INDEX CONCURRENTLY` outside a transaction. Trilingual content uses three parallel table families: `articles`/`en_articles`/`ur_articles`, `categories`/`en_categories`/`ur_categories`, etc. — keep them in sync when adding fields.

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
The codebase integrates OpenAI, Anthropic, Google Gemini, ElevenLabs, HUMAIN, and Google TTS. Routing/abstraction lives in `server/ai-manager.ts`, `server/ai/`, and `server/services/ttsProviderRegistry.ts`. **New AI calls go through `server/ai/gateway`** (`aiGateway.complete/embed/generateImage/tts`) for usage tracking, cost accounting and failover; ESLint warns on `new OpenAI` / `new Anthropic` / `new GoogleGenerativeAI` outside the gateway (issue #589). Anthropic key env: `AI_INTEGRATIONS_ANTHROPIC_API_KEY` or `ANTHROPIC_API_KEY` (`server/ai/gateway/adapters/anthropic.ts`).
- **Editorial text model:** `SABQ_EDITOR_MODEL` (default `claude-sonnet-4-6`, fallback `gpt-5.1`) in `server/ai/sabqEditorialPrompt.ts`. Some newer Claude models reject `temperature`; check the adapter before switching the env value alone.
- **Prompt caching (#1829):** gateway param `cacheSystemPrompt` → system block with `cache_control: ephemeral`; `costs.ts` accounts for `cacheReadTokens`.
- **Structured outputs (#1738):** `CLAUDE_STRUCTURED_OUTPUTS=on` only; OFF by default because `output_config` silently truncated Arabic text containing ASCII quotes. Run `scripts/prompt-audit/compare-structured-outputs.ts` before enabling.
- **Image generation:** `shared/imageStyles.ts` — default `gemini-nano-banana-2.1`, fallback `gemini-3-pro-image-preview`; `DEPRECATED_IMAGE_MODEL_REPLACEMENTS` remaps retired models (check Gemini deprecations when a new model ships). Costs in `server/services/nanoBananaService.ts`. Generated images carry IPTC `DigitalSourceType=trainedAlgorithmicMedia` via `server/utils/aiImageProvenance.ts`; sharp strips metadata, so re-apply it after every transform. Major AI subsystems each have their own service file: `data-story-ai.ts`, `deepAnalysisEngine.ts`, `embeddingsService.ts`, `recommendation-engine.ts`, `sentiment-analyzer.ts`, `services/aiArticleGenerator.ts`, `services/infographicAiService.ts`, `services/visualAiService.ts`, plus the full **iFox** content-generation system under `server/services/ifox/` and `server/routes/ifox/`. Comment moderation uses GPT-4o-mini via `server/ai/commentModeration.ts`.

### Background jobs
`server/jobs/` holds several dozen cron jobs (node-cron) — content cleanup, AI tasks, calendar reminders, foreign news ingest, push worker, plus a large sports family (World Cup / Gulf / Asian / King's Cup news + predictions + alerts + snaps), etc. They're started during boot in `server/index.ts`/`bootstrap.ts`. Leader election (`server/leaderElection.ts`) ensures jobs only run on one instance. The push notification worker is in `server/jobs/pushWorker.ts` and uses the bus in `server/notificationBus.ts`.

### Auth flows
RBAC seeding lives in `server/seedRBAC.ts` (constants and runtime logic: see the RBAC section above). Auth flows live in `server/auth.ts` (Passport local + Google + Apple), `server/twoFactor.ts` (otplib TOTP), and `server/csrf.ts` (lazy — token only fetched on demand for authenticated state-changing requests).

### Mobile apps
- **iOS is native SwiftUI**, not Capacitor: main app in `sabq app ios/` (Xcode project `sabq.xcodeproj`, scheme `sabq`), plus `sports app ios/` (VARA, scheme `SabqSports`), `gulf-cup app ios/`, `asian-cup app ios/`. Deployment target iOS 17.0. Release path is Xcode Cloud → TestFlight; `sabq app ios/deploy-testflight.sh` is a fallback that does NOT bump the build number.
- **Android is native Kotlin/Compose** in `android-native/` (modules `app` and `vara`). `android/` is the legacy Capacitor 7 project — no new work there.
- Mobile API is `/api/v1/*` with Bearer sessions in `server/routes/mobileApiRoutes.ts` (capped file — new endpoints go in their own module). Hot mobile reads (`/homepage`, `/news/paginated`, `/articles/:id`) use `server/utils/freshWindowCache.ts`: a no-cache request gets a copy at most 10s old with single-flight, which keeps a breaking push from stampeding the DB pool (#1744).

### Cloudflare Worker
`cloudflare-worker/` is a separate deployable that handles edge logic (image transforms, purge batching). Not part of the main Node build — has its own deploy.

## CI gates

Workflows in `.github/workflows/`. Required on PRs: **Typecheck** (`npm run check`), **Lint (changed files)**, **Build + unit tests** (vitest + web-next vitest + both builds, against a Postgres 17 service), **Security scan** (gitleaks + npm audit; Semgrep is report-only). Path-filtered: **Sabq and VARA iOS build** (`sabq app ios/**`, `sports app ios/**`), Gulf Cup iOS build, **Android native build**. **Smoke (production)** is read-only against sabq.org after pushes to main and every 6h.

- **File-length caps (`max-lines`).** CI lints every changed `.ts/.tsx` file in full, so touching a capped file runs its cap. Caps in `eslint.config.js`: `server/routes.ts` 36363 (exactly at cap), `server/storage.ts` 21100 and `server/routes/mobileApiRoutes.ts` 10058. On main (2026-10-15) `storage.ts` is 21442 lines and `mobileApiRoutes.ts` is 10080, already above their caps, so **any edit to those two fails lint** until code is extracted below the cap. Do not grow these files and do not raise caps: put new endpoints in a `server/routes/*.ts` module and queries in `server/services/` (ADR-001), and lower the cap when an extraction shrinks a file.
- **gitleaks flags constant names.** The scan runs on the working tree (`--no-git`) and its `generic-api-key` rule can report identifiers like `*_STORAGE_KEY = "..."` (and similar `*_KEY`/`*_TOKEN`/`*_SECRET` string constants) as secrets, failing the job. Name localStorage/UserDefaults keys without those suffixes (e.g. `SIDEBAR_PREF_ID`, `draftCacheName`). `.gitleaksignore` is for triaged false positives in existing code only.
- **npm audit gate.** `scripts/ci/npm-audit-gate.mjs` blocks new high/critical advisories in production deps. Exceptions live in `.github/npm-audit-allowlist.json` with a reason and an expiry; the node-forge exception (via passkit-generator) **expires 2026-11-15**, after which Security scan turns red unless a fixed version exists or the exception is re-reviewed. Before moving any package to `devDependencies`, run a full production install and boot — the Docker image installs production deps only.
- **iOS CI runs Xcode 26** (`macos-latest`), which lacks some APIs present in newer local Xcode (e.g. foldable/hinge APIs used for iPhone Duo, #1874). `#available` alone is not enough when the symbols are missing from the CI SDK: wrap the code in a compile-time check too (#1874 uses `#if canImport(SwiftUICore, _version: ...)` + `@available(iOS 27.1, *)`). Features gated out at compile time are silently off in CI-built binaries.
- **iOS build number.** `CURRENT_PROJECT_VERSION` in `sabq app ios/sabq.xcodeproj/project.pbxproj` (all targets, app + widgets) must be greater than the last build uploaded to TestFlight — currently greater than **2026101403**. Main holds 2026101402 after the #1853 revert, so the next upload must bump it. Format `YYYYMMDDNN`.

## Systems changed since 2026-09-25

Each has a `docs/systems/<id>/SYSTEM.md` (read it before editing; AGENTS.md § catalog). Ids in parentheses.

- **Article editor (editorial).** `client/src/pages/ArticleEditor.tsx` (redesigned #1865), `RichTextEditor.tsx`, unified AI image block `client/src/components/AutoImageGenerator.tsx` (Gemini + GPT images, #1866). Publish-first (#1755): `server/routes/publishFirst.ts`, `server/services/publishFirstService.ts`, pure logic `shared/publishFirst.ts`, tables `articleRevisions`, `articleReviewerVerdicts`, `articlePublishOperations` (`articlePublishOverrides` kept for history reads). `riskLabel` (`safe | needs_look | sensitive`) is informational only — no code path may block publishing on it (#1839).
- **Server-side draft autosave (editorial).** `client/src/lib/articleAutosave.ts` (pure contract) + `client/src/hooks/useArticleServerAutosave.ts`. No dedicated endpoint: creates via `POST /api/admin/articles` with `autosave: true`, updates via `PATCH /api/admin/articles/:id` with `expectedUpdatedAt`. Every 45s; never sends status/publish/schedule/review fields (`SERVER_AUTOSAVE_FORBIDDEN_KEYS`); only touches drafts with `reviewStatus` null or `needs_changes`. **The create body must carry `reporterId` (news) or `opinionAuthorId` (opinion)** — without it the byline is blank and the license check falls on the logged-in user (#1873). The server skips the "draft submitted" alert when `autosave === true`. Local copy key `article-draft-v2-<user>-<id|new>` is kept on any failure, including 409.
- **Opinion articles and writer review (editorial).** Writer workspace `client/src/pages/opinion-author/WriterWorkspacePage.tsx` + `WriterPriorityRail.tsx` («خطوتك التالية», the writer's only alert surface). Services `opinionWritersService.ts`, `opinionScheduleRules.ts`, `writerWeeklySlot.ts`, `opinionAuthorWorkspaceService.ts`, `publishGate.ts`; routes `server/routes/opinionWriters.ts`, `opinionTickets.ts`. A writer submits as `status=draft, reviewStatus=pending_review`; resubmitting clears `reviewNotes`. `assertOpinionAuthorPipelineOpen` returns 409 `OPINION_PIPELINE_BUSY` on submit only (not on draft save) when the writer already has a scheduled article or a pending/approved draft. Slots are 6.5 days apart (`OPINION_SLOT_GAP_MS`). Opinion tickets (`/api/opinion-tickets`): a writer message notifies all active admins/editors (inbox + email), never blocking the save. Approving an opinion-author application also approves the media license (#1775). The «صحيفة سبق» account is exempt from the professional-license check.
- **Bot drafts / «نشر سبق» publisher (editorial).** API `/api/internal/bot-drafts` (`server/routes/botDrafts.ts`, `server/services/botDraftsService.ts`, `shared/botDrafts.ts`; contract `docs/systems/editorial/BOT_DRAFTS_API.md` + `bot-drafts.openapi.yaml`). Personal tokens (`/api/admin/bot-publisher-tokens`, table `botPublisherTokens`): `botpub_` prefix, only sha256 stored, expiry ≤ 365 days. Publish is idempotent on (`actorKey`, articleId, `operationId`) → 202 processing / 422 failed. The bot only touches `source=bot` rows; an editor lock returns 409 `locked_by_editor`. Legacy `sensitiveOverride`/`overrideReason` fields are accepted and ignored. The bot service itself lives in the separate repo `sabq4org/sabq-publisher`.
- **X/social bot API (social-publishing).** `/api/internal/bot-social` (`server/routes/botSocial.ts`, `server/services/socialPublishing/botSocial*.ts`, doc `docs/systems/social-publishing/BOT_SOCIAL_API.md`); Bearer `SABQ_BOT_SOCIAL_TOKEN`/`BOT_SOCIAL_API_TOKENS`; idempotent on (`botName`, `clientReference`).
- **Breaking-news ticker (editorial).** `client/src/pages/dashboard/BreakingTickerManager.tsx` (#1855); tables `breakingTickerTopics`, `breakingTickerHeadlines`; public `GET /api/breaking-ticker/active` (max-age 60, s-maxage 120), admin `/api/admin/breaking-ticker/*` (`breaking_ticker.manage`) in `server/routes.ts`. A breaking push flushes caches at once — keep new hot reads behind `freshWindowCache` or `withCache`.
- **Audio bulletin «نشرة سبق» (audio-newsletter).** `server/routes/audioBulletin.ts`, `server/services/audioBulletin*.ts`, `server/jobs/audioBulletinJob.ts`, bar `client/src/components/AudioBulletinBar.tsx`, studio `client/src/pages/dashboard/AudioBulletin.tsx`. State is one `system_settings` key; the scheduler is **off by default**, drafts at 07:00/13:00/21:00 Riyadh, and never publishes without editor approval. Voice Gemini «Orus» first, then HUMAIN → ElevenLabs → Google; a failure restarts the whole bulletin on the next provider. Audio goes to R2 under `audio-bulletin/`.
- **Logo library (media-library).** Tables `logos`, `logoAssets`; `server/routes/logoLibrary.ts`; picker tab `client/src/components/dashboard/LogoLibraryTab.tsx`; assets on R2 (`media.sabq.org`); importer `scripts/import-logos/import.ts`.
- **Mawaeed (mawaeed).** `server/routes/mawaeed.ts`, `server/services/mawaeedService.ts`, dashboard `MawaeedManagement.tsx`, public SSR `functions/mawaeedPage.js`, `/sitemap-mawaeed.xml`.
- **Audit log (#1850).** `/api/admin/activity-logs` (`system.view_audit`) with an `actorType` filter (human | system | ai); AI writes log provider and model.
- **robots.txt (seo-ssr).** `server/utils/robotsTxt.ts` blocks AI-training crawlers (GPTBot, ClaudeBot, anthropic-ai, CCBot, Bytespider, Applebot-Extended) and leaves search bots and Google-Extended on `*`. Never give a crawler its own Allow group — a named group ignores `*` and loses `Disallow: /api/`. Do not create `llms-full.txt`.
- **iOS app (#1831–#1874).** New home (timeline of latest news, flat cards), article page, iPhone Duo/foldable support (#1874: context column «سياق الخبر», match center following device posture). Version 10.3.8.

## Gotchas

- **Raw `fetch('/api/...')` callsites** (dozens) still exist outside `queryClient.ts`. They work in PROXY mode (the Pages middleware proxy) but would break in DIRECT mode (`VITE_API_URL` set). DIRECT mode is not planned, so there is no conversion campaign — ESLint blocks new raw fetches; convert to `apiUrl()` from `@/lib/queryClient` opportunistically as you touch files.
- **Edit locks** live in [server/routes/articleEditLocks.ts](server/routes/articleEditLocks.ts) (GET / POST / DELETE / heartbeat on `/api/admin/articles/:id/lock`) over the `articleEditLocks` table plus a cleanup job, logic in `server/services/articleEditLockService.ts`. Lock TTL is 10 minutes; heartbeats extend it. Logout releases the user's locks before destroying the session; `POST {force:true}` takes over a lock and needs `*` or `articles.publish` + `articles.edit_any` (`canTakeOverLock`), after which the old owner's saves fail with `ARTICLE_LOCKED`. Same account on two devices is not distinguished. When these endpoints fail, the dashboard's ArticleEditor shows "تعذر الحصول على قفل التحرير" on every edit. If you find a "schema + cleanup job but no routes" gap elsewhere, follow the same pattern.
- **Seed SQL files can be mojibake.** `scripts/seed-rbac.ts` detects "UTF-8 bytes interpreted as Latin-1" content (e.g. `Ø£Ø­ÙØ¯` instead of `أحمد`) and round-trips through Latin-1 to recover correct UTF-8 before sending to Postgres. If you write a new seed loader, copy that snippet.
- **Railway auto-fix bot has write access to GitHub.** It can open PRs and merge them to `main` when builds fail; commits authored by `railway-app[bot]` on main come from it.
- **Process-level handlers** at the top of `server/index.ts` log uncaughtException/unhandledRejection but don't exit. Be aware when debugging silent failures.
- **`/public-objects/` on single-process mode** falls through to the SPA HTML shell unless the direct proxy in `server/index.ts` intercepts first. On Pages production, `/api/*` is proxied to Railway — do not assume single-process routing. The proxy uses `ObjectStorageService.searchPublicObject()` for dual-bucket fallback.
- **Rate limiting** keys off `x-sabq-client-ip` / `true-client-ip` first, then `cf-connecting-ip`, then `x-forwarded-for` (`rateLimitKey` in `server/index.ts`). Authenticated users (sessions) and GET requests are skipped — only anonymous writes are throttled. **Gotcha:** Cloudflare Pages/Worker `fetch()` proxy to `api.sabq.org` rewrites `cf-connecting-ip` to a single egress IP, collapsing every visitor into one write bucket → site-wide HTTP 429 on login/comments. Pages middleware must set `X-Sabq-Client-IP` from the inbound request; mobile can bypass the proxy via `api.sabq.org` directly. Full writeup: `docs/ratelimit-edge-ip-fix-2026-06-03.md`.
- **Session revocation check is cached 10s** (`server/sessionRevocations.ts`, single-flight, #1845). A local revoke clears the cache immediately; a revoke on the other replica can take up to 10s to apply.
- **Runtime flags in `system_settings`, not env.** Several features toggle from the dashboard via `system_settings` rows: publish-first (`publish_first_*`, a missing row means ON, 5s cache), radar master switch (`radar_runtime_enabled`, fails closed; precedence `RADAR_FORCE_DISABLED` const → DB row → `RADAR_ENABLED` env), audio bulletin (`audio_bulletin_state`). Check the row before assuming an env var controls it.
- **`meetings-agent/` is not built by root CI.** A green PR proves nothing for it; run `npm ci && npx tsc --noEmit` inside it for its dependency bumps.

## Pointers

**`docs/PREDICTION_CORE.md` is the canonical note for the central sports-predictions platform**: one engine + versioned scoring profiles + append-only ledger serving every tournament except World Cup 2026, whose legacy `wc*` engine is kept separate and untouched. There are no per-tournament prediction engines — new tournaments are configured (Competition + Profiles + fixture source), never coded.

`docs/DEPLOYMENT_STATUS.md` is the canonical production topology note (Pages + Railway). `replit.md` is the legacy architecture note — still useful for stack/product context. `docs/STRUCTURE.md` is the documentation map (`docs/architecture/`, `docs/setup/`, `docs/handoff/`, `docs/reports/`, `docs/reference/`); `docs/architecture/SYSTEM_DOCUMENTATION.md` and the rest of `docs/` have deeper feature writeups (mobile API, SendGrid, Cloudflare purge, etc.).
