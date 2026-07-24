# CLAUDE.md

Guidance for Claude Code in this repository. Deep architecture detail lives in [`docs/architecture/CODEBASE_GUIDE.md`](docs/architecture/CODEBASE_GUIDE.md) — read it on demand, not upfront. Proven project workflows are packaged as skills in [`.claude/skills/`](.claude/skills/) (backend-feature, slowness-diagnosis, ai-cost-diagnosis, seo-new-surface, sabq-visual-identity, ios-safe-edit).

## Commands

```bash
npm run dev           # Dev server (tsx server/index.ts) — API + Vite SPA on one port
npm run build         # build:client (Vite → dist/public/) + build:server (esbuild → dist/index.js)
npm run check         # TypeScript typecheck
npm run lint          # ESLint "stop the bleeding" — blocks NEW debt only
npm run test:unit     # Vitest suite (tests/unit/); e2e: test:smoke / test:e2e (Playwright, e2e/)
npm run db:up         # Local Docker Postgres + Redis
npm run db:push:local # Schema push to localhost only (rejects remote hosts)
./push-to-production.sh <PROD_DATABASE_URL>   # Prod schema push (interactive confirm)
```

Local DB: `postgresql://sabq:sabq_password@localhost:5432/sabq_db` with `DB_DRIVER=pg`; don't set `NEON_DATABASE_URL` locally (runtime prefers it over `DATABASE_URL`). Env templates: `.env.example`, full list in `replit.md`. No Jest.

## Architecture snapshot

Production (since ~mid-May 2026) is **Cloudflare Pages + Railway** — NOT Replit:

```
Browser → Cloudflare Pages (sabq.org)
        ├─ static SPA (dist/public) + functions/_middleware.js (proxy /api/*, SEO)
        ├─ web-next/ (Next.js 14 SSR for public content, behind SSR_ROUTES=on)
        └─ Railway api.sabq.org (Express, SERVE_SPA=false, DB_DRIVER=pg)
```

- SPA: React + Vite + Wouter in `client/`; dashboard/admin stay here. Path aliases: `@/*` → `client/src/*`, `@shared/*` → `shared/*`, `@assets/*` → `attached_assets/*` (Vite only).
- `server/index.ts` is the Express entry; single-process mode (dev/`SERVE_SPA=true`) serves API + SPA together.
- `shared/schema.ts` (~331 tables) is the DB source of truth — sync via `db:push`, no migration files. Trilingual families (`articles`/`en_articles`/`ur_articles`, …) must stay in sync.
- ~33 node-cron jobs in `server/jobs/` with leader election; Capacitor apps in `android/`/`ios/`; edge worker in `cloudflare-worker/`.

## Hard rules (breaking these has bitten us before)

- **Never run `db:push` or destructive commands against production.** The local `.env.local` `DATABASE_URL` is a stale Neon branch, NOT prod — prod credentials exist only on Railway.
- **`DB_DRIVER`**: `pg` for local Docker and Railway TCP; wrong driver against non-Neon PG makes `verifyConnection()` hang with no routes.
- **ADR-001**: new route modules go in `server/routes/*.ts` + `splitRoutesIndex.ts` (not `routes.ts`), must NOT import `db` — Drizzle lives in `server/services/*`. `server/storage.ts` is frozen.
- **RBAC wildcard**: `ROLE_PERMISSIONS_MAP` keeps the literal `["*"]` for admins — never expand it to `Object.values(PERMISSION_CODES)` (many frontend codes aren't enumerated there). Every nav-style permission filter must short-circuit on `permissions.includes("*")`. Don't weaken the `SUPERUSER_ROLE_NAMES` shortcut in `server/rbac.ts` without auditing its 15+ callsites.
- **Noindex paths** (`server/utils/noindexPaths.ts` + mirror in `functions/_middleware.js`) must ship `Cache-Control: private, no-store`; a dev guard in `server/index.ts` throws on leaks — don't disable it.
- **Don't redeclare `CACHE_TTL`** locally — it shadows the import and silently breaks SWR.
- **TanStack Query returns `null`** for missing data; guard every array: `const data = Array.isArray(dataRaw) ? dataRaw : [];`
- **`railway.json`**: no JSON comments, no `nixpacks.toml` alongside the Dockerfile — either breaks Railway's config-as-code stage.
- **Cloudflare tokens differ**: purge uses `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ZONE_ID`; images use `CLOUDFLARE_IMAGES_TOKEN` + account hash. Don't mix them.
- **No new raw `fetch('/api/...')`** (ESLint enforces); use `apiUrl()` from `@/lib/queryClient` and convert legacy callsites opportunistically.
- **Language**: user-facing strings are Arabic (RTL); communicate simply, preserve Arabic conventions in UI.

## Pointers

- [`docs/architecture/CODEBASE_GUIDE.md`](docs/architecture/CODEBASE_GUIDE.md) — topologies, deploy configs, RBAC layers, caching, storage/R2, SEO pipeline, AI subsystems, incident gotchas.
- [`docs/DEPLOYMENT_STATUS.md`](docs/DEPLOYMENT_STATUS.md) — canonical production topology/ops.
- [`docs/PREDICTION_CORE.md`](docs/PREDICTION_CORE.md) — central sports-predictions platform (one engine + profiles; World Cup 2026 legacy `wc*` engine excluded until the tournament ends; never resurrect the deleted per-tournament engines).
- [`docs/R2_NEWS_IMAGES_ROLLOUT.md`](docs/R2_NEWS_IMAGES_ROLLOUT.md) — news-image storage rollout runbook.
- [`docs/STRUCTURE.md`](docs/STRUCTURE.md) — documentation map; `replit.md` — legacy stack/product context.
