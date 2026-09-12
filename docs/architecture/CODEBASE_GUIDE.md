# Codebase Guide (deep context)

Extended architecture notes extracted from `CLAUDE.md` on 2026-07-24 so the always-loaded file stays lean. Read the section you need; nothing here is required for day-to-day edits — the hard invariants live in `CLAUDE.md`.

## Topologies

### Production (sabq.org — since ~mid-May 2026)
**Cloudflare Pages** (frontend) + **Railway** (API at `api.sabq.org`). Replit is no longer the production host. Canonical ops doc: [`docs/DEPLOYMENT_STATUS.md`](../DEPLOYMENT_STATUS.md).

```
Browser → Cloudflare Pages (sabq.org)
        ├─ static SPA (dist/public)
        ├─ functions/_middleware.js  (proxy /api/*, slug-redirect, SEO inject)
        └─ Railway api.sabq.org      (Express, SERVE_SPA=false, DB_DRIVER=pg)
```

`REDIS_URL` on Railway is production-enabled (typically Upstash) to offload Passport sessions from Neon Postgres — optional only as a code fallback to the `sessions` table.

### Single-process mode (local dev / legacy Replit-style)
`server/index.ts` is the entry. `npm run dev` or `SERVE_SPA=true`: one Express process serves API + SPA (Vite middleware in dev via `server/vite.ts`, prebuilt `dist/public/` in prod). `server/seoInjector.ts` and `server/middleware/slugRedirect.ts` run inline. The primary app is React + Vite + Wouter (no Next.js in this process).

### Next.js SSR app — `web-next/`
Since the P3 SSR migration (2026-06-03, see `docs/technical-seo-p3-ssr-completion-2026-06-03.md`), public content surfaces (`/`, `/article/*`, `/category/*`, `/en/article/*`, `/ur/article/*`) are server-rendered by a separate Next.js 14 App Router app deployed on Railway, fronted by Cloudflare Pages. `functions/_middleware.js` proxies those routes to `NEXT_ORIGIN` when `SSR_ROUTES=on` (instant rollback when off). `web-next` is data-only — it consumes the API via `seo-bundle`/`home-bundle` endpoints in `server/routes/edgeMeta.ts`; the SPA in `client/` still serves the dashboard, admin, and not-yet-migrated routes.

### Split topology (Railway + Vercel, experimental at sabq.news)
Activated by env flags — no code branches:

- **`SERVE_SPA=false`** → `server/index.ts` skips SPA wiring, returns JSON 404 for non-API GETs. Catch-all is at the bottom of the async init.
- **`COOKIE_DOMAIN=.sabq.news` + `COOKIE_SAMESITE=none`** → `server/auth.ts` and `server/csrf.ts` set session + CSRF cookies on the parent domain with cross-site flags.
- **`FRONTEND_URL` + `FRONTEND_PREVIEW_PATTERN`** → CORS allowlist in `server/index.ts`.
- **`VITE_API_URL`** (optional, frontend) → `client/src/lib/queryClient.ts` exports `apiUrl()` used by `apiRequest`, `getQueryFn`, `trackBeacon`, `fetchCsrfToken`. Unset = relative `/api/*` + rewrites (PROXY mode); set = browser hits the API origin directly (DIRECT mode).
- **`/api/edge/slug-redirect`** and **`/api/edge/seo-meta`** in `server/routes/edgeMeta.ts` → invoked by `cloudflare-worker/frontend-edge-worker.js` in front of Vercel. `seo-meta` covers: ar/en/ur articles and categories, deep analyses (`/omq/:id`), world days, gulf events, plus `/gulf-live` and `/world-days` landing pages. Handlers return 220-char descriptions, locale-correct OG tags, and `noindex, follow` for unpublished/missing rows. The full `seoInjector.ts` (JSON-LD, hreflang chains, twitter cards) is NOT reimplemented — extend `ROUTE_HANDLERS` if a missing surface starts trending in crawler logs.

## Deploy configs

- **`Dockerfile`** — the single build source on Railway. Runs `npm run build:server`, defaults `SERVE_SPA=false`, copies `dist/` and `public/` (for `/branding/`). Intentionally headless; local docker-compose users wanting full-stack-on-one-port must override `SERVE_SPA=true` and supply a pre-built `dist/public/`.
- **`railway.json`** — `builder: DOCKERFILE`, healthcheck `/health` (60s timeout). No JSON comments (`"//"`) — Railway's parser rejects them ("config-as-code" failure). No `nixpacks.toml` alongside — Dockerfile + nixpacks + railway.json together broke Railway's analyzer ("service config at '/' not found"). Railway picks Dockerfile over nixpacks unconditionally, even if railway.json says NIXPACKS.
- **`vercel.json`** — runs `build:client`, output `dist/public/`, rewrites `/api/*`, `/sitemap.xml`, `/robots.txt`, `/ads.txt`, `/uploads/*`, `/branding/*` to `https://api.sabq.news/...`. Long-cache headers for hashed assets.
- **`cloudflare-worker/wrangler.frontend.toml`** — separate from legacy `wrangler.toml`; routes `sabq.news/*` through `frontend-edge-worker.js`. Both workers coexist. `cloudflare-worker/` itself is a separate deployable (image transforms, purge batching) — not part of the main Node build.
- **`.env.railway.example`** / **`.env.vercel.example`** — env templates.

## RBAC — two layers and a superuser shortcut

1. **Database (authoritative)**: `roles`, `permissions`, `role_permissions`, `user_roles`, `user_permission_overrides`. Seeded from `scripts/seed-data/roles_and_permissions.sql` (gitignored — personal data). 9 roles, 164 permissions, 344 mappings. Runtime logic in `server/rbac.ts` / `server/seedRBAC.ts`.
2. **Hardcoded mapping (`shared/rbac-constants.ts`)**: `ROLE_PERMISSIONS_MAP` is consulted by `/api/auth/user` to compute the client's `permissions` array. For admin/system_admin it contains `["*"]` (literal wildcard). `getPermissionsForRoles()` preserves the wildcard verbatim — do NOT change it back to `Object.values(PERMISSION_CODES)`: dozens of frontend permission codes (`roles.view`, `permissions.manage`, `ads.manage`, `ai.view`, `blocks.manage`, …) are not enumerated in `PERMISSION_CODES` and would be silently dropped.
3. **Frontend wildcard awareness**: `hasPermission`/`hasAnyPermission`/`hasAllPermissions` in `client/src/hooks/useAuth.ts` AND the three nav-filter hooks (`useNav.ts`, `useEnglishNav.ts`, `useUrduNav.ts`) short-circuit on `permissions.includes("*")`. Any new nav-style filter MUST do the same — without it admin sees an empty sidebar.
4. **Backend superuser shortcut**: 15+ places in `server/routes.ts` call `getUserPermissions(userId).includes(code)` directly. For admins whose only signal is `users.role = 'admin'` (text column, no `user_roles` row), `getUserPermissions` checks `SUPERUSER_ROLE_NAMES = ['admin','superadmin','system_admin','system.admin']` first and returns ALL `permissions.code` values. Do not weaken this without auditing the callsites.

Auth flows: `server/auth.ts` (Passport local + Google + Apple), `server/twoFactor.ts` (otplib TOTP), `server/csrf.ts` (lazy — token fetched on demand for authenticated state-changing requests).

## Caching — three layers

1. **Browser/CDN HTTP cache** — smart-caching middleware near the top of `server/index.ts`. Hashed assets: 1y immutable. HTML SPA routes: `public, max-age=60, s-maxage=300, stale-while-revalidate=600`.
2. **Noindex override** — any path matched by `isNoindexPath()` (`server/utils/noindexPaths.ts`: dashboard, admin, search, profile, auth, payment, onboarding) MUST ship `Cache-Control: private, no-store`. Enforced twice (smart-cache middleware + SEO injector). A dev/test guard in `server/index.ts` (`res.on('finish')`) **throws** if a noindex route or 404/410 SPA shell leaks `public`/`s-maxage`/`stale-while-revalidate` — it catches CDN poisoning regressions; don't disable it.
3. **Server-side** — `server/memoryCache.ts` (in-memory) + Redis (`server/redis.ts`) for sessions and hot data. Don't redeclare `CACHE_TTL` locally — it shadows the imported object and silently breaks SWR.

## Storage — R2 news images, Cloudflare Images fallback, S3/R2 blobs

Invisible to editors: upload endpoints unchanged, the server picks the backend. Operational source of truth: [`docs/R2_NEWS_IMAGES_ROLLOUT.md`](../R2_NEWS_IMAGES_ROLLOUT.md).

1. **News images — staged R2 rollout.** `server/services/newsImageStorageService.ts` routes the configured percentage (`NEWS_IMAGES_R2_ROLLOUT_PERCENT`) of explicit editorial purposes to `sabq-news-images`, served via `https://media.sabq.org` (UUID paths + right-sized WebP variants). Failures fall back to Cloudflare Images. Origin cache header is currently two days; one-year caching MUST wait for the purge-on-delete gate in the runbook.
2. **Cloudflare Images — fallback + historical archive.** Keep `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_IMAGES_TOKEN`, `CLOUDFLARE_ACCOUNT_HASH` configured. Profile images, logos, categories, ads, non-editorial, and failed R2 uploads live here. The `imagedelivery.net` archive is NOT auto-copied to R2 (separate future phase). Note the env names: un-prefixed account id, singular `CLOUDFLARE_IMAGES_TOKEN`; account hash ≠ account id.
3. **`objectStorage.ts`** (S3/R2/local via `STORAGE_PROVIDER`) — PDFs, audio, presigned uploads, generic blobs. Independent from the news-image R2 service.
4. **Cache purge creds are separate**: `server/services/cloudflarePurge.ts` reads `CLOUDFLARE_ZONE_ID` + `CLOUDFLARE_API_TOKEN` (`_API_TOKEN` ≠ `_IMAGES_TOKEN`). Before any one-year edge TTL on `media.sabq.org/news/*`, deletion must purge the original and every variant.

The legacy R2/CF-Images URL migrations predating the news-image rollout are complete in production (2026-06-10); their one-shot scripts and admin routes were deleted.

## SEO + slug pipeline

`server/seoInjector.ts` rewrites `<head>` per-route (titles, OG, JSON-LD) on the prebuilt `index.html` in single-process mode. `server/middleware/slugRedirect.ts` 301-redirects Arabic slugs and `/news/` paths to `/article/{englishSlug}` for **all visitors including crawlers**. Cloudflare Image Transform must NOT be applied to `/public-objects/` or `/api/` paths (non-image content) — see the direct proxies for `/public-objects/*` and `/objects/*` in `server/index.ts`. `edgeMeta.ts` covers all crawler-facing routes but is deliberately simpler than `seoInjector.ts` (missing: JSON-LD, hreflang chains, twitter bytecount tweaks, opinion/reporter/keyword pages).

## AI provider sprawl

OpenAI, Anthropic, Google Gemini, ElevenLabs, Google TTS. Routing/abstraction: `server/ai-manager.ts`, `server/ai/`, `server/services/ttsProviderRegistry.ts`. Major subsystems have their own service files: `journalist-agent-ai.ts`, `data-story-ai.ts`, `deepAnalysisEngine.ts`, `embeddingsService.ts`, `recommendation-engine.ts`, `sentiment-analyzer.ts`, `services/aiArticleGenerator.ts`, `services/infographicAiService.ts`, `services/visualAiService.ts`, plus the **iFox** content-generation system (`server/services/ifox/`, `server/routes/ifox/`). Comment moderation: GPT-4o-mini via `server/ai/commentModeration.ts`. Usage is logged to `ai_usage_logs` by `server/ai/gateway/usageLogger.ts`.

## Background jobs

`server/jobs/` holds ~33 node-cron jobs — content cleanup, AI tasks, calendar reminders, foreign news ingest, push worker, plus a large sports family (World Cup / Gulf / Asian / King's Cup news + predictions + alerts + snaps). Started during boot in `server/index.ts`/`bootstrap.ts`. Leader election (`server/leaderElection.ts`) ensures single-instance execution. Push worker: `server/jobs/pushWorker.ts` + `server/notificationBus.ts`.

## Mobile apps

`android/` and `ios/` are Capacitor 7.4.4 wrappers around the same web app. Mobile-specific endpoints: `server/routes/mobileApiRoutes.ts`. (Native Swift apps live in `sabq app ios/` and `sports app ios/` — see the `ios-safe-edit` skill.)

## Incident-bred gotchas

- **Edit-lock endpoints** (`server/routes/articleEditLocks.ts`): the schema + cleanup job predated the four routes (GET/POST/DELETE/heartbeat); without them ArticleEditor shows "تعذر الحصول على قفل التحرير". Lock TTL 10 min, heartbeats extend. If you find similar "schema + job but no routes" gaps, follow the same pattern.
- **Vercel rewrite cache is sticky**: Vercel's edge caches DNS of rewrite destinations at deploy time. If the target wasn't provisioned at first compile, every POP returns DNS_HOSTNAME_SERVER_ERROR for `/api/*` forever. Fix: "Redeploy with Use existing Build Cache UNCHECKED", or DIRECT mode (`VITE_API_URL`), which the experimental project uses.
- **Seed SQL mojibake**: `scripts/seed-rbac.ts` detects UTF-8-as-Latin-1 content (e.g. `Ø£Ø­ÙØ¯`) and round-trips through Latin-1 before sending to Postgres. Copy that snippet into any new seed loader.
- **Railway auto-fix bot** has GitHub write access — it opens and merges PRs to `main` when builds fail (commits authored by `railway-app[bot]`).
- **Process-level handlers** at the top of `server/index.ts` log uncaughtException/unhandledRejection but don't exit — relevant when debugging silent failures.
- **`/public-objects/` in single-process mode** falls through to the SPA HTML shell unless the direct proxy in `server/index.ts` intercepts first (dual-bucket fallback via `ObjectStorageService.searchPublicObject()`).
- **Rate limiting** keys off `x-sabq-client-ip` / `true-client-ip`, then `cf-connecting-ip`, then `x-forwarded-for` (`rateLimitKey` in `server/index.ts`). Sessions and GETs are skipped — only anonymous writes are throttled. The Pages proxy rewrites `cf-connecting-ip` to one egress IP → site-wide 429 unless the middleware sets `X-Sabq-Client-IP` from the inbound request. Full writeup: `docs/ratelimit-edge-ip-fix-2026-06-03.md`.
- **Raw `fetch('/api/...')`**: ~116 legacy callsites outside `queryClient.ts`. Fine in PROXY mode, would break in DIRECT mode. Owner decision 2026-06-10: DIRECT mode not planned, no campaign — ESLint blocks new raw fetches; convert to `apiUrl()` opportunistically.
