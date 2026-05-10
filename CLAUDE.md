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

There is no `lint`, no `test` script, and no Jest/Vitest setup. The only automated tests are Playwright e2e specs under `e2e/` (e.g. `e2e/accessibility.spec.ts`) — run them with `npx playwright test e2e/<file>` after `npm run dev` is up.

Required env vars (full list in `replit.md`): `DATABASE_URL`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `SENDGRID_API_KEY`, `TWILIO_*`, `GCS_*`, `CLOUDFLARE_IMAGES_*`, `FCM_SERVER_KEY`, `MAILERLITE_WEBHOOK_SECRET`. `REDIS_URL` is optional (falls back to in-memory). `.env.local` overrides `.env`.

## Architecture

### Two deploy topologies live in this repo
1. **Replit (legacy/production)** — single Express process serves API + SPA on one port. This is the original topology and is still the production deployment. `server/index.ts` mounts API routes and serves the SPA via Vite middleware (dev) or static `dist/public/` (prod). The SEO injector (`server/seoInjector.ts`) and slug redirect middleware (`server/middleware/slugRedirect.ts`) run inline.
2. **Railway + Vercel (experimental backup)** — backend on Railway (headless, API only), frontend on Vercel (Vite static build), Cloudflare Worker in front of Vercel for SEO injection + slug redirect. The same code supports both modes via env flags. **This split is for testing only — production stays on Replit.** See "Split topology" below for the details.

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

R2 URL migration: `scripts/migrate-urls-to-r2.ts` rewrites `/public-objects/*`, `/objects/*`, `/api/public-media/*`, `/uploads/*` references in article content/image columns to absolute `${R2_PUBLIC_URL}/*` URLs. **Dry-run by default**; refuses to run if `DATABASE_URL` contains "prod"/"production" without `--i-understand`. Run only against the backup DB.

### Path aliases
- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`
- `@assets/*` → `attached_assets/*` (Vite only)

### Database driver is selectable
[server/db.ts](server/db.ts) supports two drivers via the `DB_DRIVER` env var:
- `neon` (default, Replit-safe): `@neondatabase/serverless` over WebSocket. Required by Replit's bundled DB and external Neon.
- `pg`: standard `node-postgres` TCP. Required for Railway PG (Railway's PG endpoint doesn't speak Neon's wsproxy protocol — `verifyConnection()` will hang forever otherwise, leaving the server listening but with no routes registered because the async init never completes). Set this on Railway.

### Drizzle schema is the source of truth
`shared/schema.ts` (~12k lines, **251 tables**) defines the full DB. `npm run db:push` syncs it directly — there is no migration generation step in the regular workflow (the four files in `migrations/` are historical). When adding tables/columns, edit `schema.ts` and `db:push`. Trilingual content uses three parallel table families: `articles`/`en_articles`/`ur_articles`, `categories`/`en_categories`/`ur_categories`, etc. — keep them in sync when adding fields.

### Routes are split, but `routes.ts` is still huge
`server/routes.ts` (~37k lines) is the historical monolith. New work increasingly lives in `server/routes/*.ts` modules registered through `server/routes/splitRoutesIndex.ts`. When adding a new endpoint, prefer creating a router module and wiring it into `splitRoutesIndex.ts` rather than appending to `routes.ts`. `server/storage.ts` (~21k lines) is the equivalent monolith for DB access — new query helpers should go in `server/selectHelpers.ts` or feature-scoped service files under `server/services/`.

### Three layers of caching, each with invariants
1. **Browser/CDN HTTP cache** — set in the smart-caching middleware near the top of `server/index.ts`. Hashed assets get 1y immutable; HTML SPA routes default to `public, max-age=60, s-maxage=300, stale-while-revalidate=600`.
2. **Noindex override** — any path matched by `isNoindexPath()` in `server/utils/noindexPaths.ts` (dashboard, admin, search, profile, auth, payment, onboarding) MUST ship `Cache-Control: private, no-store`. Two layers enforce this (the smart-cache middleware and the SEO injector). A dev/test guard in `server/index.ts` (`res.on('finish')` hook) **throws** if a noindex route or a 404/410 SPA shell ever leaks `public`, `s-maxage`, or `stale-while-revalidate`. Don't disable this — it catches CDN poisoning regressions.
3. **Server-side cache** — `server/memoryCache.ts` (in-memory) and Redis (via `server/redis.ts`) for sessions and hot data. **Don't redeclare `CACHE_TTL`** as a local variable; it shadows the imported object and silently breaks SWR.

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

- **Production lives on Replit, NOT Railway/Vercel.** The split topology is experimental — never run `db:push`, `migrate-urls-to-r2.ts --apply`, or any destructive command against the production DATABASE_URL. The migration script has a guard that refuses URLs containing `prod`/`production` unless `--i-understand` is passed.
- **243 raw `fetch('/api/...')` callsites** still exist outside `queryClient.ts`. They work fine in PROXY mode (Vercel rewrites) but break in DIRECT mode (`VITE_API_URL` set). Migration path: switch them to `apiUrl()` from `@/lib/queryClient` as you touch them.
- **`edgeMeta.ts` covers all crawler-facing routes (ar/en/ur articles + categories, omq, world-day, gulf, landing pages) but is still simpler than `seoInjector.ts`.** Missing vs. the original: JSON-LD structured data, hreflang link chains, Twitter card bytecount tweaks, opinion/reporter/keyword pages. Extend `ROUTE_HANDLERS` if those start mattering.
- **Process-level handlers** at the top of `server/index.ts` log uncaughtException/unhandledRejection but don't exit. Be aware when debugging silent failures.
- **`/public-objects/` in Replit production** falls through to the SPA HTML shell unless the direct proxy in `server/index.ts` intercepts first. The proxy uses `ObjectStorageService.searchPublicObject()` for dual-bucket fallback.
- **Rate limiting** is keyed off `cf-connecting-ip` (Cloudflare) before `x-forwarded-for`. Authenticated users (sessions) and GET requests are skipped — only anonymous writes are throttled.
- **Communication style preference** (from `replit.md`): simple, everyday language. The project README and most user-facing strings are Arabic; preserve RTL/Arabic conventions when editing UI.

## Pointers

`replit.md` is the project's living architecture note — read it first when picking up unfamiliar work. `SYSTEM_DOCUMENTATION.md` and the `docs/` folder have deeper feature-specific writeups (audio newsletters, mobile API, SendGrid, Cloudflare purge design, etc.).
