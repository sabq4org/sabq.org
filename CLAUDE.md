# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (tsx server/index.ts) — serves API + Vite SPA on the same port
npm run build        # Full build: build:client then build:server
npm run build:client # Vite build only (frontend → dist/public/) — used by Vercel
npm run build:server # esbuild server bundle only (→ dist/index.js) — used by Railway
npm start            # Production: NODE_ENV=production node dist/index.js
npm run check        # TypeScript typecheck (tsc, noEmit)
npm run db:push      # Apply Drizzle schema (shared/schema.ts) to DATABASE_URL
./push-to-production.sh <PROD_DATABASE_URL>   # Push schema to production (interactive confirm)
```

`npm run lint` exists (ESLint "stop the bleeding" config — blocks NEW debt only, see `eslint.config.js`; CI lints changed files per PR). The only automated tests are Playwright e2e specs under `e2e/` (`npm run test:smoke`, `npm run test:e2e`); there is still no Jest/Vitest unit-test setup. CI workflows in `.github/workflows/`: typecheck + lint on PRs, read-only smoke against sabq.org every 6h and after pushes to main.

Required env vars (full list in `replit.md`; dev template in `.env.example`): `DATABASE_URL`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `SENDGRID_API_KEY`, `TWILIO_*`, `GCS_*`, `CLOUDFLARE_IMAGES_*`, `FCM_SERVER_KEY`, `MAILERLITE_WEBHOOK_SECRET`. `REDIS_URL` is optional (falls back to in-memory). `.env.local` overrides `.env`. Since 2026-06-10 `APNS_KEY_ID`, `APNS_TEAM_ID`, and `INDEXNOW_KEY` are env-only (hardcoded fallbacks removed) — unset means APNs push / IndexNow pings are disabled with a startup warning.

## Architecture

### Production topology (sabq.org — since ~mid-May 2026)
**Cloudflare Pages** (frontend) + **Railway** (API at `api.sabq.org`). Replit is **no longer** the production host — it was retired ~two weeks before 2026-06-06. Canonical ops doc: [`docs/DEPLOYMENT_STATUS.md`](docs/DEPLOYMENT_STATUS.md).

```
Browser → Cloudflare Pages (sabq.org)
        ├─ static SPA (dist/public)
        ├─ functions/_middleware.js  (proxy /api/*, slug-redirect, SEO inject)
        └─ Railway api.sabq.org      (Express, SERVE_SPA=false, DB_DRIVER=pg)
```

`REDIS_URL` on Railway is **production-enabled** (typically Upstash) to offload Passport sessions from Neon Postgres — optional only as a code fallback to the `sessions` table. See `docs/DEPLOYMENT_STATUS.md` § Redis.

### Other topologies still supported in code
1. **Local / legacy single-process (Replit-style)** — `npm run dev` or `SERVE_SPA=true`: one Express process serves API + SPA. `server/seoInjector.ts` and `server/middleware/slugRedirect.ts` run inline. Used for dev, not current production.
2. **Railway + Vercel (experimental at sabq.news)** — older split-test path. Production cut over to Pages on `sabq.org`; see "Split topology" below for env-flag mechanics (still valid for Railway headless mode).

### One process, one port (Replit mode)
`server/index.ts` is the entry. In dev, the same Express server mounts API routes AND proxies the SPA through Vite middleware (`server/vite.ts`); in prod, the same server serves the prebuilt SPA from `dist/public/`. There is no Next.js — the frontend is React + Vite + Wouter routing, SSR-flavored only via the SEO injector that rewrites the prebuilt `index.html` per request.

### Split topology (Railway + Vercel mode)
Activated by env flags — no code branches. The mechanism is:
- **`SERVE_SPA=false`** on the backend → `server/index.ts` skips the Vite/static SPA wiring and returns JSON 404 for non-API GETs. Default (unset/anything else) preserves the Replit single-process behavior. Catch-all is at the bottom of the async init in `server/index.ts`.
- **`COOKIE_DOMAIN=.sabq.news` + `COOKIE_SAMESITE=none`** → `server/auth.ts` and `server/csrf.ts` set both the session and CSRF cookies on the parent domain with cross-site flags.
- **`FRONTEND_URL` + `FRONTEND_PREVIEW_PATTERN`** → CORS allowlist in `server/index.ts` accepts the Vercel deployment + preview URLs.
- **`VITE_API_URL`** on the frontend (optional) → `client/src/lib/queryClient.ts` exports `apiUrl()` and uses it in `apiRequest`, `getQueryFn`, `trackBeacon`, `fetchCsrfToken`. When unset, the frontend uses relative `/api/*` paths and Vercel rewrites (in `vercel.json`) proxy them to Railway. When set, the browser hits the API origin directly.
- **`/api/edge/slug-redirect`** and **`/api/edge/seo-meta`** in `server/routes/edgeMeta.ts` → invoked by `cloudflare-worker/frontend-edge-worker.js`, which sits in front of Vercel. The worker handles 301 redirects and HTML-rewriter-based meta injection that the original Express middleware did inline. The `seo-meta` endpoint covers: Arabic articles (`/article/:slug`), English articles (`/en/article/:slug`), Urdu articles (`/ur/article/:slug`), Arabic/English/Urdu categories, deep analyses (`/omq/:id`), world days (`/world-day/:id`), gulf events (`/gulf/:id`), plus landing pages for `/gulf-live` and `/world-days`. Each handler returns 220-char-truncated descriptions, locale-correct OG tags, and `noindex, follow` for unpublished/missing rows. The full `seoInjector.ts` (which adds JSON-LD, hreflang chains, twitter cards) is NOT reimplemented — extend `ROUTE_HANDLERS` in `edgeMeta.ts` if a missing surface starts trending in crawler logs.

Deploy configs:
- `Dockerfile` — the single build source on Railway. Runs `npm run build:server` (server-only bundle), defaults `SERVE_SPA=false`, copies `dist/` and `public/` (for `/branding/`). The image is intentionally headless; local docker-compose users wanting full-stack-on-one-port must override `SERVE_SPA=true` and supply a pre-built `dist/public/`.
- `railway.json` — sets `builder: DOCKERFILE` and points at `Dockerfile`. Healthchecks `/health` with a 60-second timeout. Schema URL `https://schema.up.railway.app/v1.json`. Do NOT add JSON comments (`"//"`) — Railway's parser rejects them and the build fails at "config-as-code" stage.
- No `nixpacks.toml` — having Dockerfile + nixpacks + railway.json all present caused Railway's new config-as-code analyzer to fail with "service config at '/' not found". Keep the Dockerfile as the single source of truth.
- `vercel.json` — runs `build:client`, output `dist/public/`, rewrites `/api/*`, `/sitemap.xml`, `/robots.txt`, `/ads.txt`, `/uploads/*`, `/branding/*` to `https://api.sabq.news/...`. Long-cache headers for hashed assets.
- `cloudflare-worker/wrangler.frontend.toml` — separate from the legacy `wrangler.toml`. Routes `sabq.news/*` through `frontend-edge-worker.js`. Both workers coexist.
- `.env.railway.example` and `.env.vercel.example` — env templates with all required keys.

R2/Cloudflare-Images URL migrations are **complete in production** (confirmed 2026-06-10); the one-shot scripts (`scripts/migrate-urls-to-r2.ts`, `server/scripts/migrate*.ts`, `runImageMigration.ts`) and their `/api/admin/image-migration/*` admin routes were deleted — recover from git history if ever needed.

### Path aliases
- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`
- `@assets/*` → `attached_assets/*` (Vite only)

### Database driver is selectable
[server/db.ts](server/db.ts) supports two drivers via the `DB_DRIVER` env var:
- `neon` (default, Replit-safe): `@neondatabase/serverless` over WebSocket. Required by Replit's bundled DB and external Neon.
- `pg`: standard `node-postgres` TCP. Required for Railway PG (Railway's PG endpoint doesn't speak Neon's wsproxy protocol — `verifyConnection()` will hang forever otherwise, leaving the server listening but with no routes registered because the async init never completes). Set this on Railway.

The two seed scripts ([scripts/seed-rbac.ts](scripts/seed-rbac.ts), [scripts/create-admin.ts](scripts/create-admin.ts), [scripts/create-reporter.ts](scripts/create-reporter.ts)) honor `DB_DRIVER` the same way.

### RBAC has two layers and a superuser shortcut
1. **Database (authoritative)**: `roles`, `permissions`, `role_permissions`, `user_roles`, `user_permission_overrides`. Seeded from [scripts/seed-data/roles_and_permissions.sql](scripts/seed-data/) (gitignored — personal data). 9 roles, 164 permissions, 344 mappings.
2. **Hardcoded code mapping ([shared/rbac-constants.ts](shared/rbac-constants.ts))**: `ROLE_PERMISSIONS_MAP` is consulted by `/api/auth/user` to compute the `permissions` array returned to the client. For admin/system_admin, the map contains `["*"]` (literal wildcard, not expanded). `getPermissionsForRoles()` preserves the wildcard verbatim — do NOT change it back to `Object.values(PERMISSION_CODES)` because dozens of frontend permission codes (e.g. `roles.view`, `permissions.manage`, `ads.manage`, `ai.view`, `blocks.manage`) are NOT enumerated in `PERMISSION_CODES` and would be silently dropped.
3. **Frontend wildcard awareness**: `hasPermission` / `hasAnyPermission` / `hasAllPermissions` in [client/src/hooks/useAuth.ts](client/src/hooks/useAuth.ts) AND the three nav-filter hooks ([useNav.ts](client/src/nav/useNav.ts), [useEnglishNav.ts](client/src/nav/useEnglishNav.ts), [useUrduNav.ts](client/src/nav/useUrduNav.ts)) all short-circuit on `permissions.includes("*")`. Any new nav-style permission filter MUST do the same — without it admin sees an empty sidebar.
4. **Backend superuser shortcut**: 15+ places in [server/routes.ts](server/routes.ts) call `getUserPermissions(userId).includes(code)` directly (instead of going through `userHasPermission()`). For this to work for admins whose only signal is `users.role = 'admin'` (text column, no `user_roles` entry), `getUserPermissions` in [server/rbac.ts](server/rbac.ts) checks `SUPERUSER_ROLE_NAMES = ['admin','superadmin','system_admin','system.admin']` first and returns ALL `permissions.code` values for any matching user. Do not weaken this without auditing the 15+ callsites first.

### Drizzle schema is the source of truth
`shared/schema.ts` (~12k lines, **251 tables**) defines the full DB. `npm run db:push` syncs it directly — there is no migration generation step in the regular workflow (the four files in `migrations/` are historical). When adding tables/columns, edit `schema.ts` and `db:push`. Trilingual content uses three parallel table families: `articles`/`en_articles`/`ur_articles`, `categories`/`en_categories`/`ur_categories`, etc. — keep them in sync when adding fields.

### Routes are split, but `routes.ts` is still huge
`server/routes.ts` (~39k lines) is the historical monolith. New work increasingly lives in `server/routes/*.ts` modules registered through `server/routes/splitRoutesIndex.ts`. When adding a new endpoint, prefer creating a router module and wiring it into `splitRoutesIndex.ts` rather than appending to `routes.ts`. **ADR-001** ([docs/architecture/ADR-001-data-access-layer.md](docs/architecture/ADR-001-data-access-layer.md), enforced by ESLint `no-restricted-imports`): new route modules must NOT import `db` — Drizzle queries live in feature-scoped service files under `server/services/`, and `server/storage.ts` (~21k lines) is **frozen** (no new methods; 46 legacy route files are grandfathered by name in `eslint.config.js`).

### Three layers of caching, each with invariants
1. **Browser/CDN HTTP cache** — set in the smart-caching middleware near the top of `server/index.ts`. Hashed assets get 1y immutable; HTML SPA routes default to `public, max-age=60, s-maxage=300, stale-while-revalidate=600`.
2. **Noindex override** — any path matched by `isNoindexPath()` in `server/utils/noindexPaths.ts` (dashboard, admin, search, profile, auth, payment, onboarding) MUST ship `Cache-Control: private, no-store`. Two layers enforce this (the smart-cache middleware and the SEO injector). A dev/test guard in `server/index.ts` (`res.on('finish')` hook) **throws** if a noindex route or a 404/410 SPA shell ever leaks `public`, `s-maxage`, or `stale-while-revalidate`. Don't disable this — it catches CDN poisoning regressions.
3. **Server-side cache** — `server/memoryCache.ts` (in-memory) and Redis (via `server/redis.ts`) for sessions and hot data. **Don't redeclare `CACHE_TTL`** as a local variable; it shadows the imported object and silently breaks SWR.

### Storage strategy — Cloudflare Images first, S3/R2 second
Images and non-image assets go to **different backends**, and the split is invisible at the API surface — both kinds of upload hit the same `/api/upload` endpoints. The branching happens inside the route handler:

1. **Cloudflare Images (primary for anything `image/*`).** The historical image archive already lives on Cloudflare. When `isCloudflareConfigured()` returns true (i.e. all three of `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_IMAGES_TOKEN`, `CLOUDFLARE_ACCOUNT_HASH` are set), every image upload is sent to the Cloudflare Images v1 API via [server/services/cloudflareImagesService.ts](server/services/cloudflareImagesService.ts) and the DB records an `imagedelivery.net/<hash>/<id>/<variant>` URL. Bypasses `objectStorage.ts` entirely. Three callsites in [server/routes.ts](server/routes.ts) (lines ~1475, ~3933, ~16410) and one in [server/routes/emailAgent.ts](server/routes/emailAgent.ts) implement this branch. **Watch out**: the env var names the code reads are NOT prefixed with `_IMAGES_` — older `.env.*.example` files and `replit.md` had `CLOUDFLARE_IMAGES_ACCOUNT_ID` / `CLOUDFLARE_IMAGES_API_TOKEN`, which the code does NOT read. Use the un-prefixed `CLOUDFLARE_ACCOUNT_ID` and the `CLOUDFLARE_IMAGES_TOKEN` (singular "TOKEN") instead, plus the often-forgotten `CLOUDFLARE_ACCOUNT_HASH` (the imagedelivery.net hash, distinct from account id). The historical image-migration scripts were deleted 2026-06-10 (migrations complete in production; recover from git history if ever needed).

2. **`objectStorage.ts` (S3/R2/local) for non-image assets.** PDFs, audio, presigned uploads, generic blobs go through `STORAGE_PROVIDER` (`s3` | `r2` | `local`). The S3 path supports any S3-compatible endpoint (Tigris, MinIO, AWS, Tebi) — pick one via `S3_ENDPOINT` + `S3_BUCKET` + creds. Per-object `ACL=public-read` is set on public uploads unless `S3_DISABLE_ACL=true`. Public URLs come from `S3_PUBLIC_URL` (preferred) or `${S3_ENDPOINT}/${bucket}` as fallback. Tebi-specific caveat: it silently ignores per-object `public-read` and rejects `PutBucketPolicy` — anonymous GETs return 403 unless you flip the bucket public via the Tebi web console or front it with a Cloudflare custom hostname. Tigris honors ACLs natively.

3. **Cloudflare cache purge is separate from Cloudflare Images.** `server/services/cloudflarePurge.ts` reads `CLOUDFLARE_ZONE_ID` + `CLOUDFLARE_API_TOKEN` (note: `_API_TOKEN`, not `_IMAGES_TOKEN`). Don't confuse the two — Images and zone-purge use different tokens with different scopes.

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
`server/jobs/` holds 14 cron jobs (node-cron) — content cleanup, AI tasks, calendar reminders, foreign news ingest, push worker, etc. They're started during boot in `server/index.ts`/`bootstrap.ts`. Leader election (`server/leaderElection.ts`) ensures jobs only run on one instance. The push notification worker is in `server/jobs/pushWorker.ts` and uses the bus in `server/notificationBus.ts`.

### RBAC
Role/permission constants are in `shared/rbac-constants.ts`. Runtime logic in `server/rbac.ts` and `server/seedRBAC.ts`. Five tables back it: `roles`, `permissions`, `role_permissions`, `user_roles`, `user_permission_overrides`. Auth flows live in `server/auth.ts` (Passport local + Google + Apple), `server/twoFactor.ts` (otplib TOTP), and `server/csrf.ts` (lazy — token only fetched on demand for authenticated state-changing requests).

### Mobile apps
`android/` and `ios/` are Capacitor 7.4.4 projects wrapping the same web app. Mobile-specific API endpoints live in `server/routes/mobileApiRoutes.ts`.

### Cloudflare Worker
`cloudflare-worker/` is a separate deployable that handles edge logic (image transforms, purge batching). Not part of the main Node build — has its own deploy.

## Gotchas

- **Production is Cloudflare Pages + Railway (`sabq.org` / `api.sabq.org`), NOT Replit.** Replit was the original host; migrated to Pages ~mid-May 2026. See `docs/DEPLOYMENT_STATUS.md`. Never run `db:push` or any destructive command against the production `DATABASE_URL`.
- **~241 raw `fetch('/api/...')` callsites** still exist outside `queryClient.ts`. They work fine in PROXY mode (the Pages middleware proxy) but would break in DIRECT mode (`VITE_API_URL` set). Owner decision 2026-06-10: DIRECT mode is NOT planned, so no dedicated campaign — ESLint blocks new raw fetches; convert to `apiUrl()` from `@/lib/queryClient` opportunistically as you touch files.
- **`edgeMeta.ts` covers all crawler-facing routes (ar/en/ur articles + categories, omq, world-day, gulf, landing pages) but is still simpler than `seoInjector.ts`.** Missing vs. the original: JSON-LD structured data, hreflang link chains, Twitter card bytecount tweaks, opinion/reporter/keyword pages. Extend `ROUTE_HANDLERS` if those start mattering.
- **Edit-lock endpoints live in [server/routes/articleEditLocks.ts](server/routes/articleEditLocks.ts).** The schema (`articleEditLocks` table) and cleanup job existed in the original repo but the four routes (GET / POST / DELETE / POST heartbeat) were never implemented. Without them the dashboard's ArticleEditor surfaces "تعذر الحصول على قفل التحرير" on every "edit existing article" open. Lock TTL is 10 minutes; heartbeats extend it. If you find similar "schema + cleanup job but no routes" gaps elsewhere, follow the same pattern.
- **Vercel rewrite cache can be sticky across deploys.** Vercel's edge caches the DNS resolution of rewrite destinations at deploy time. If `api.sabq.news` wasn't fully provisioned when Vercel first compiled the rewrite, every edge POP returns DNS_HOSTNAME_SERVER_ERROR for `/api/*` forever — even after a regular Redeploy. The workaround is "Redeploy with Use existing Build Cache UNCHECKED", or switch to DIRECT mode (`VITE_API_URL=https://api.sabq.news`) which bypasses Vercel rewrites entirely. Direct mode is what the experimental project uses today.
- **Railway picks Dockerfile over nixpacks unconditionally.** Even with `railway.json` saying `builder: NIXPACKS`. Don't add `"//"` JSON comments to `railway.json` — Railway's config-as-code analyzer rejects them and the build fails at "service config at '/' not found". Don't keep `nixpacks.toml` alongside `Dockerfile` for the same reason.
- **Seed SQL files can be mojibake.** `scripts/seed-rbac.ts` detects "UTF-8 bytes interpreted as Latin-1" content (e.g. `Ø£Ø­ÙØ¯` instead of `أحمد`) and round-trips through Latin-1 to recover correct UTF-8 before sending to Postgres. If you write a new seed loader, copy that snippet.
- **Railway auto-fix bot has write access to GitHub.** It opens PRs and merges them to `main` when builds fail. During the experimental phase Vercel was set to build from `experimental/split-deploy` (not main) to isolate. If you see commits authored by `railway-app[bot]` on main, that's why.
- **Process-level handlers** at the top of `server/index.ts` log uncaughtException/unhandledRejection but don't exit. Be aware when debugging silent failures.
- **`/public-objects/` on single-process mode** falls through to the SPA HTML shell unless the direct proxy in `server/index.ts` intercepts first. On Pages production, `/api/*` is proxied to Railway — do not assume Replit routing. The proxy uses `ObjectStorageService.searchPublicObject()` for dual-bucket fallback.
- **Rate limiting** keys off `x-sabq-client-ip` / `true-client-ip` first, then `cf-connecting-ip`, then `x-forwarded-for` (`rateLimitKey` in `server/index.ts`). Authenticated users (sessions) and GET requests are skipped — only anonymous writes are throttled. **Gotcha:** Cloudflare Pages/Worker `fetch()` proxy to `api.sabq.org` rewrites `cf-connecting-ip` to a single egress IP, collapsing every visitor into one write bucket → site-wide HTTP 429 on login/comments. Pages middleware must set `X-Sabq-Client-IP` from the inbound request; mobile can bypass the proxy via `api.sabq.org` directly. Full writeup: `docs/ratelimit-edge-ip-fix-2026-06-03.md`.
- **Communication style preference** (from `replit.md`): simple, everyday language. The project README and most user-facing strings are Arabic; preserve RTL/Arabic conventions when editing UI.

## Pointers

`docs/DEPLOYMENT_STATUS.md` is the canonical production topology note (Pages + Railway; Replit retired mid-May 2026). `replit.md` is the legacy architecture note — still useful for stack/product context. `docs/STRUCTURE.md` is the documentation map (root .md files were reorganized into `docs/architecture/`, `docs/setup/`, `docs/handoff/`, `docs/reports/`, `docs/reference/` on 2026-06-10); `docs/architecture/SYSTEM_DOCUMENTATION.md` and the rest of `docs/` have deeper feature writeups (audio newsletters, mobile API, SendGrid, Cloudflare purge, etc.).
