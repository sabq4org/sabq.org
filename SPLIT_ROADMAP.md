# Split Topology Roadmap

Tracks the remaining work for the experimental Railway + Vercel deployment
at sabq.news. Production at sabq.org (Replit) is unaffected by anything in
this file.

Last updated: 2026-05-11 — split is verified working end-to-end as of
commit `cc2e963`. Admin login, dashboard, RBAC, edit locks, and seeded
data (9 roles, 164 permissions, 344 mappings, 1 admin, 1 test reporter)
all functional.

---

## Phase 0 — Security (do first, ~10 min)

- [ ] **Rotate Railway PG password** (exposed in chat history multiple times).
      Railway → Postgres service → Connect tab → Reset Password. Railway
      auto-updates the `DATABASE_URL` env var on the backend service.
- [ ] **Change admin password** for `admin@sabq.sa` via the dashboard
      Profile/Settings (current temp password also in chat history).
- [ ] **Change reporter password** for `reporter@sabq.sa` (lower priority —
      test account).
- [ ] **Verify production sabq.org untouched**:
      `curl https://sabq.org/health` should return Replit's normal response.
- [ ] **Disable Railway auto-fix bot** (optional but recommended). It has
      write access to GitHub and merges PRs to `main` when builds fail.
      Railway → Project Settings → look for "Auto-Fix" / "Smart Build".

## Phase 1 — Functional smoke test (~30-60 min)

Log in as admin at https://www.sabq.news/login and exercise every major
feature. Note any error — the edit-lock issue from this session pattern
(schema exists but routes missing) may repeat elsewhere.

| Area | What to test |
|---|---|
| Content | Create / edit / delete / publish article, attach image (verify R2 / uploads path resolves), polls, infographics |
| Categories | CRUD on categories |
| Tags | Create tags and attach to an article |
| Comments | Approve / reject moderation flow |
| Users | Create user, edit user, change role |
| Roles | Create a custom role with custom permissions |
| AI tools | iFox, Visual AI, Article Editor AI assist |
| Smart Blocks | Add a block to the homepage |
| Settings | General, integrations |
| Reporter view | Log in as `reporter@sabq.sa` in an incognito window — confirm restricted nav (only own articles, can create, cannot publish) |

Also exercise the public side at https://www.sabq.news/ — homepage,
category pages, article pages. Confirm images load.

## Phase 2 — SEO + crawlers (~1-2 hours)

- [ ] **Deploy the Cloudflare Worker** that fronts Vercel. Code is in
      `cloudflare-worker/frontend-edge-worker.js`, wrangler config in
      `cloudflare-worker/wrangler.frontend.toml`. Currently NOT deployed.
      It does:
      - 301 redirects via `/api/edge/slug-redirect`
      - SEO meta injection via `/api/edge/seo-meta`
      Once deployed, it replaces what `seoInjector.ts` used to do inline
      on the Express monolith.
- [ ] **Test crawlers**: Facebook Sharing Debugger and Twitter Card
      Validator on a real published article. Confirm OG/Twitter tags
      appear.
- [ ] **Verify `/sitemap.xml` and `/robots.txt`** load (proxied from
      Railway via vercel.json rewrites).
- [ ] *(Optional)* Add JSON-LD structured data + hreflang chains to
      `server/routes/edgeMeta.ts` if you want full parity with the
      original `seoInjector.ts`.

## Phase 3 — Migrate uploaded images to absolute R2 URLs (~30 min)

The article HTML and image columns currently reference paths like
`/public-objects/uploads/xyz.jpg` that resolve via Vercel rewrites to
Railway, which proxies to the underlying object storage. Moving to
absolute R2 URLs removes the Vercel + Railway hop entirely.

- [ ] DRY-RUN: `tsx scripts/migrate-urls-to-r2.ts`
      Inspect the diff — make sure paths look right and the destination
      `R2_PUBLIC_URL` is set in env.
- [ ] APPLY: `tsx scripts/migrate-urls-to-r2.ts --apply`
- [ ] Spot-check article images on the live site.

The script refuses to run against URLs containing `prod`/`production`
unless `--i-understand` is passed.

## Phase 4 — Monitoring (3-7 days, passive)

Watch the experimental deployment under realistic load (even if just
your own usage) before making any "promote to production" decision.

| Surface | What to watch |
|---|---|
| Railway Metrics | CPU, memory, response time, error rate, restart count |
| Vercel Analytics | Edge cache hit ratio, function invocations, build time |
| Cloudflare Analytics | Requests, cache hits, threat blocks |
| Cost | Railway ~$5–20/mo expected; Vercel + Cloudflare free tier |
| Stability | Uptime, slow queries, any 5xx spikes |

## Phase 5 — Decision: promote, hybrid, or stay

After monitoring, pick one:

- **(a) Keep as permanent staging.** sabq.news remains the test
  environment; production stays on sabq.org / Replit. Use the experimental
  setup to validate every release before pushing to Replit.
- **(b) Full migration.** Cut sabq.org DNS over to Vercel + Railway and
  decommission Replit. The riskiest option — requires a maintenance
  window and a tested rollback. Don't do without Phases 2-4 green.
- **(c) Hybrid.** e.g. public reader traffic to Vercel/Railway, admin
  surfaces still on Replit. More complex routing.
- **(d) Next.js migration (deferred).** Originally considered for proper
  SSR. Estimated 2–4 weeks of focused work to migrate 133 Wouter pages.
  Only revisit if (a)/(b) won't meet SEO goals.

## Phase 6 — Cleanup + documentation (~1 hour)

Once the topology decision is made:

- [ ] **Update Capacitor mobile apps** to point at the right API base.
      iOS + Android both configure this via `capacitor.config.ts` and
      native config files.
- [ ] **Decide proxy vs DIRECT mode** for the long term. Currently using
      DIRECT (`VITE_API_URL=https://api.sabq.news`). If staying on direct,
      migrate the ~243 raw `fetch('/api/...')` callsites in
      `client/src/` to use `apiUrl()` from `@/lib/queryClient` so they
      hit the API origin instead of relying on Vercel rewrites.
- [ ] **Refactor backend permission checks** to consistently use
      `userHasPermission()` instead of `getUserPermissions().includes()`.
      The current superuser shortcut in `getUserPermissions` (`server/rbac.ts`)
      papered over 15+ inconsistent callsites in `server/routes.ts`.
- [ ] **Write rollback procedure** — how to revert to Replit-only in an
      emergency (Vercel domain removal + Railway service pause +
      Cloudflare DNS edit).
- [ ] **Delete `nixpacks.toml`** if Dockerfile remains the build source
      forever (currently kept as a fallback that Railway ignores anyway).
- [ ] **Consider an ONBOARDING.md** for any teammate who'll work on the
      split.

---

## Key URLs

| Surface | URL |
|---|---|
| Frontend (Vercel) | https://sabq.news (apex, redirects to www) |
| Frontend (Vercel) | https://www.sabq.news |
| Backend (Railway) | https://api.sabq.news |
| GitHub branch | https://github.com/sabq4org/sabq.org/tree/experimental/split-deploy |
| Production (unchanged) | https://sabq.org |

## Key env vars

### Railway (backend)
```
NODE_ENV=production
SERVE_SPA=false
DB_DRIVER=pg
DATABASE_URL=<railway internal>
SESSION_SECRET=<32+ chars>
FRONTEND_URL=https://sabq.news
ALLOWED_ORIGINS=https://sabq.news,https://www.sabq.news
FRONTEND_PREVIEW_PATTERN=^https://sabq-.*\.vercel\.app$
COOKIE_DOMAIN=.sabq.news
COOKIE_SAMESITE=none
PUBLIC_SITE_URL=https://sabq.news
PRIVATE_OBJECT_DIR=/tmp/private-objects
```

### Vercel (frontend)
```
VITE_API_URL=https://api.sabq.news
```

## Test accounts

```
admin@sabq.sa     / <changed during Phase 0>
reporter@sabq.sa  / <changed during Phase 0>
```
