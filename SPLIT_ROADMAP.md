# Split Topology Roadmap

Tracks the remaining work for the experimental Railway + Vercel deployment
at sabq.news. Production at sabq.org (Replit) is unaffected by anything in
this file.

Last updated: 2026-05-11 — split is verified working end-to-end as of
commit `cc2e963`. Admin login, dashboard, RBAC, edit locks, and seeded
data (9 roles, 164 permissions, 344 mappings, 1 admin, 1 test reporter)
all functional.

---

## Phase 0 — Security (DONE 2026-05-11)

All credentials exposed in chat history have been rotated:

- [x] Railway PG password rotated.
- [x] Admin password for `admin@sabq.sa` changed.
- [x] Reporter password for `reporter@sabq.sa` changed.
- [x] sabq.org production verified untouched (`/health` returns
      Replit's normal response).
- [x] Railway auto-fix bot disabled (or confirmed disabled).

Also rotated mid-session: the Gemini API key (`AIzaSy...`) that
appeared in chat during the Nano Banana Pro debugging.

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

## Phase 2.5 — Images go through Cloudflare Images (DECIDED)

**Decision (2026-05-11):** Skip the S3/Tebi/Tigris path for images. The
historical image archive already lives in Cloudflare Images, and
`server/services/cloudflareImagesService.ts` is fully wired into the
upload paths in `server/routes.ts` and `server/routes/emailAgent.ts` —
any upload with `mime` starting with `image/` is routed to Cloudflare
when `isCloudflareConfigured()` returns true, bypassing objectStorage
entirely. No code changes needed.

### To activate on Railway

Set these three vars (the names the code reads — NOT the `_IMAGES_`
prefixed names some older docs showed):

```
CLOUDFLARE_ACCOUNT_ID=<account id>
CLOUDFLARE_IMAGES_TOKEN=<API token with Images: Edit scope>
CLOUDFLARE_ACCOUNT_HASH=<imagedelivery.net hash, NOT account id>
```

Then upload an article image from the dashboard. The DB `imageUrl`
should now start with `https://imagedelivery.net/<hash>/<id>/<variant>`.

### S3/Tebi/R2 still relevant for non-image assets

`objectStorage.ts` continues to handle PDFs, audio, generic uploads,
etc. via `STORAGE_PROVIDER`. The earlier Tebi blocker (anonymous GET
returns 403 because Tebi rejects `PutBucketPolicy` and silently ignores
per-object `public-read` ACLs) is no longer on the critical path for
images. If you need public S3 buckets later for non-image traffic,
options (B) Tigris swap, (A) Tebi console toggle, and (C) Cloudflare
custom hostname fronting still stand. Useful scripts kept for that
case: `scripts/test-s3-upload.ts`, `scripts/try-tebi-public.ts`.

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

### Database — Neon migration test (DONE 2026-05-11)

Verified end-to-end that Railway sabq.news works connected to Neon
(separate test project, not production yet). What was tested:

- Login as admin → sessions + RBAC ✓
- View existing articles → reads ✓
- Publish new article → INSERT through the full publish chain ✓
- Edit article → UPDATE + edit-lock heartbeat ✓
- Delete article → DELETE + cascade ✓
- Image upload → CF Images path still works under Neon ✓

**Required Railway env changes for Neon:**
```
DATABASE_URL=<neon-pooler-url>?sslmode=require
DB_DRIVER=neon
```
The `DB_DRIVER` swap is mandatory — leaving it on `pg` makes the
server hang forever on Neon (Neon's wsproxy doesn't speak plain TCP).

**Migration gotcha discovered:** The `sessions` table from
shared/schema.ts didn't exist on Railway PG (probably because
connect-pg-simple is configured with `createTableIfMissing: false`
and the test environment never lazy-created it). After pg_dump from
Railway → restore to Neon, the table was missing and every request
500'd with `relation "sessions" does not exist`. Fix is one SQL block
in Neon's web SQL Editor (idempotent, safe to re-run):
```sql
CREATE TABLE IF NOT EXISTS "sessions" (
  "sid" varchar PRIMARY KEY,
  "sess" jsonb NOT NULL,
  "expire" timestamp NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" ("expire");
```
Run this on the *production* Neon before the launch-day DATABASE_URL
swap too, even though prod has been on Neon for years — the table
already exists there (every Replit prod login created/used it), but
zero harm to verify.

### Migration-day checklist (when sabq.org points at Railway/Vercel)

Things deferred during the experimental phase that MUST be revisited
before/at the cutover. Do not skip; each one would silently break or
hurt SEO on the day of launch.

- [ ] **Lift the sabq.news crawler block.** Remove `public/robots.txt`
      (the disallow-all file) and the `X-Robots-Tag: noindex, nofollow`
      header from `vercel.json`. Both were added in commit
      `7ef0093` to protect sabq.org SEO while sabq.news ran experimental.
- [ ] **Deploy the frontend Cloudflare Worker.** The Worker at
      `cloudflare-worker/frontend-edge-worker.js` injects per-page SEO
      meta into the static SPA shell. Without it crawlers and link
      previews (WhatsApp/Facebook/Twitter) see the generic homepage
      tags. Deploy script is ready and self-contained (curl + jq, no
      wrangler dep). Set the right zone for sabq.news (or sabq.org at
      cutover) then run:
      ```
      CLOUDFLARE_WORKERS_API_TOKEN=<token> \
      CLOUDFLARE_ZONE_ID=<sabq.news zone> \
        ./cloudflare-worker/deploy-frontend-edge.sh
      ```
      Override `ROUTE_PATTERNS` env var to extend coverage (e.g.
      `sabq.org/*,www.sabq.org/*`).
- [ ] **Extend Worker routes to sabq.org.** Add `sabq.org/*` and
      `www.sabq.org/*` patterns to `wrangler.frontend.toml`'s
      `[env.production]` routes block, redeploy.
- [ ] **Decide what happens to the existing sabq.org SEO 404 worker**
      (`cloudflare-worker/seo-404-worker.js` + `wrangler.toml`). If the
      new frontend worker takes over, retire it; otherwise chain them.
- [ ] **Update OG/canonical defaults in the SPA shell.** `client/index.html`
      hardcodes `og:url=https://sabq.org`, `og:image=https://sabq.org/branding/...`,
      `twitter:url=https://sabq.org`. The worker strips/replaces these
      on indexable routes, but the shell still needs sensible defaults
      for non-worker requests (e.g. direct hits during a Worker outage).
- [ ] **Re-point cookie + CORS env vars to .sabq.org.**
      - `COOKIE_DOMAIN=.sabq.org` (Railway)
      - `FRONTEND_URL=https://sabq.org`, `ALLOWED_ORIGINS=https://sabq.org,https://www.sabq.org` (Railway)
      - `PUBLIC_SITE_URL=https://sabq.org` (Railway)
      - `VITE_API_URL=https://api.sabq.org` (Vercel) — if keeping
        DIRECT mode; alternatively keep `api.sabq.news` and update DNS
- [ ] **DNS cutover plan for sabq.org.**
      - Old: Replit IPs / proxied through Cloudflare
      - New: `sabq.org` and `www.sabq.org` → Vercel; `api.sabq.org` → Railway
      - Keep TTL low (60s) for ~24h before cutover so rollback is fast.
- [ ] **301 redirects from sabq.news → sabq.org** (if sabq.news stays
      reachable post-migration) so any links shared during the
      experimental phase resolve to the canonical home.
- [ ] **Re-issue mobile apps with new API base.** iOS + Android via
      `capacitor.config.ts` and native configs.
- [ ] **Tested rollback runbook ready.** Vercel domain detach,
      Railway service pause, Cloudflare DNS revert to Replit IPs.

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
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://t3.storageapi.dev
S3_BUCKET=<railway tigris bucket>
S3_ACCESS_KEY_ID=<...>
S3_SECRET_ACCESS_KEY=<...>
S3_PUBLIC_URL=                          # optional, falls back to ${S3_ENDPOINT}/${S3_BUCKET}
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
