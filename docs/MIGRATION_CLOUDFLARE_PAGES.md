# Frontend migration: Vercel → Cloudflare Pages (sabq.org)

Move the production SPA off Vercel onto Cloudflare Pages, **keeping the official
domain `sabq.org`** and the backend on Railway at `api.sabq.org`. Because the
domain is unchanged, **no backend change is required** — `COOKIE_DOMAIN=.sabq.org`,
`FRONTEND_URL=https://sabq.org`, CORS and OAuth all stay valid.

## Architecture

```
Browser → Cloudflare Pages (sabq.org)
        ├─ static SPA            (dist/public, hashed /assets/*)
        ├─ functions/_middleware.js   ← proxy /api,/uploads,… + slug-redirect + SEO inject
        └─ Railway api.sabq.org  (unchanged: API + /api/edge/seo-meta + /api/edge/slug-redirect)
```

This replaces BOTH Vercel's `vercel.json` (rewrites + headers) AND the standalone
`cloudflare-worker/frontend-edge-worker.js` (SEO/slug). The standalone worker is
**retired at cutover** — see step 5. Until then it stays bound to `sabq.org/*`
serving the live Vercel site.

## Files added (this branch)

| File | Purpose |
|------|---------|
| `functions/_middleware.js` | Edge brain: proxy (all methods) + slug 301 + SEO HTMLRewriter + HTML no-store |
| `client/public/_headers` | `/assets/*` immutable 1y; `build-info.json` no-store |
| `client/public/_redirects` | `/* → /index.html 200` SPA fallback |
| `client/public/_routes.json` | Exclude `/assets/*` from Functions (perf) |

`client/public/` is Vite's `publicDir`, so these land in `dist/public/` at build.

## Cloudflare Pages project settings

- **Build command:** `npm run build:client`
- **Output directory:** `dist/public`
- **Install command:** `npm ci`
- **Root directory:** repo root (so `/functions` is picked up)
- **Production branch:** `main`
- **Environment variables (Production + Preview):**
  - `API_ORIGIN = https://api.sabq.org`
  - `EDGE_SEO` — leave UNSET/`off` initially (proxy-only; the standalone worker
    keeps doing SEO). Flip to `on` only in the SEO-handover step below.
  - **Leave `VITE_API_URL` UNSET** — keeps the client in PROXY mode (relative
    `/api/*`). Setting it breaks the ~243 raw `fetch('/api/...')` callsites.
  - Copy any other `VITE_*` the build needs (currently only `VITE_WS_URL`, if used).

## Pre-cutover test plan (on the `*.pages.dev` preview — DO THIS FIRST)

1. **Content parity:** open the homepage + a full article page. No broken/empty
   widgets ⇒ the proxy works. Broken widget ⇒ a missing proxy path.
2. **API proxy (GET):** Network tab → `/api/homepage-lite` returns **200 JSON,
   same-origin** (not HTML, not 404).
3. **API proxy (POST):** try a login from the preview (note: cross-site cookie on
   `*.pages.dev` won't persist the session, but the POST itself must reach the API
   and return a real JSON response, not a 404 — that proves write-path proxying).
4. **Other proxied paths:** `/robots.txt`, `/sitemap.xml`, `/ads.txt`,
   `/app-ads.txt`, an `/uploads/<file>`, a `/branding/<file>`, a `/s/<code>`
   short link (must 301).
5. **SEO for crawlers:**
   `curl -A "Googlebot" https://<preview>.pages.dev/article/<englishSlug>`
   → must contain `<title>…| سبق`, `og:*`, `<link rel="canonical">`, and the
   `<!-- sabq-edge-meta-injected -->` marker; articles also get the hidden
   semanticHtml `<article …>`.
6. **Slug redirect:** request an Arabic slug / `/news/…` path → **301** to
   `/article/<englishSlug>`.
7. **Cache headers:** `/assets/*.js` → `immutable`; `/dashboard` and `/admin` →
   `private, no-store`.

## Cutover — staged (safest; avoids betting on untested SEO + double-injection)

The domain is already on Pages. The two risky changes (proxy vs SEO-injection)
are decoupled via `EDGE_SEO` so they ship separately.

**Stage 1 — proxy only (un-break `/api`), worker keeps SEO.**
1. Get `functions/` into the production deployment: either set the Pages
   **Production branch → `feat/cloudflare-pages-migration`** (isolated; no Railway
   touch), or merge `feat → main` (also redeploys Railway, which watches `main`).
2. Keep `EDGE_SEO` unset (proxy-only). Leave the `sabq-frontend-edge` worker
   routes in place — it still injects SEO.
3. Verify on `https://sabq.org`: `/api/homepage-lite` → 200 **JSON**; article
   pages still carry `sabq-edge-meta-injected` (from the worker) — **exactly once**.

**Stage 2 — SEO handover (later, calm window).**
4. Set `EDGE_SEO=on` in Pages env AND, in the same change, remove the worker's
   `sabq.org/*` + `www.sabq.org/*` routes (Workers → Triggers/Routes). Never both
   inject at once.
5. Verify: article SEO injected **once** (now from the middleware), slug 301s work,
   real login (same-site → session persists), comments, publish→meta refresh.
6. Watch logs / GSC coverage / share-unfurl ~24h, then retire the worker.

## Rollback

- **Keep the Vercel project and its `vercel.json` intact** — do not delete.
- If anything breaks: detach `sabq.org`/`www` from Pages and re-point to Vercel
  (and re-add the worker routes if you removed them). DNS is on Cloudflare so this
  is minutes. Edge cache of routing can be sticky — purge if needed.
- **Do not** wire auto-CF-purge on deploy (that caused prior white-page-after-deploy).

## Known gaps / notes

- `*.pages.dev` previews are cross-site vs `api.sabq.org` → login won't persist on
  previews (expected). Attach a `*.sabq.org` preview alias if you need to test auth
  pre-cutover.
- The middleware mirrors the worker's SEO surface exactly (it calls the same
  `/api/edge/*` endpoints). To add routes, extend `ROUTE_HANDLERS` in
  `server/routes/edgeMeta.ts` — no Pages change needed.
