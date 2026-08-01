# web-next — SSR frontend for sabq.org public content

Next.js (App Router) app that server-renders the high-value public surfaces so
the full text + LCP image arrive in the first byte of HTML (Google News /
Discover + Core Web Vitals). Part of the P3 SSR migration
(`docs/technical-seo-p3-ssr-plan-ar.md`). The SPA in `../client` keeps serving
the dashboard, admin, and not-yet-migrated routes.

## Routes implemented

| Route | Source |
|-------|--------|
| `/` | `app/page.tsx` (home bundle) |
| `/article/[slug]` | `app/article/[slug]/page.tsx` (ar) |
| `/en/article/[slug]` | `app/en/article/[slug]/page.tsx` |
| `/ur/article/[slug]` | `app/ur/article/[slug]/page.tsx` |
| `/category/[slug]` | `app/category/[slug]/page.tsx` (ar) |

Data comes from the existing API via aggregated bundle endpoints added to
`../server/routes/edgeMeta.ts`:

- `GET /api/articles/:slug/seo-bundle?lang=ar|en|ur`
- `GET /api/categories/:slug/seo-bundle`
- `GET /api/edge/home-bundle`

All pages use ISR (`revalidate = 60`) and emit NewsArticle JSON-LD identical to
the edge/Express SEO paths (shared `buildNewsArticleSchemaExtras`).

## Local dev

```bash
cd web-next
npm install
API_ORIGIN=https://api.sabq.org PUBLIC_SITE_URL=https://sabq.org npm run dev
# http://localhost:3001/article/<englishSlug>
```

## Environment

See `.env.example`. Required in production:

- `API_ORIGIN` — Railway API origin the SSR fetches from (e.g. `https://api.sabq.org`).
- `PUBLIC_SITE_URL` — canonical origin for `<canonical>` / OG (`https://sabq.org`).
- `STAGING_NO_INDEX=true` — staging فقط؛ يضيف `X-Robots-Tag` و`robots` meta
  ويحوّل الكاش إلى `private, no-store`. اتركه غير مضبوط في الإنتاج.

## Deploy (Railway)

Second Railway service, Dockerfile builder (`railway.json`). Build context is
this folder only (self-contained — no monorepo deps at runtime). Standalone
output → `node server.js` on `$PORT`. Front it with a subdomain (e.g.
`next.sabq.org`).

## Cutover (Cloudflare)

In Cloudflare Pages env (`functions/_middleware.js`):

1. `NEXT_ORIGIN=https://next.sabq.org`
2. `SSR_ROUTES=on`

This routes `/`, `/article/*`, `/category/*`, `/en/article/*`, `/ur/article/*`
to this app and skips the edge SEO shell injection for them (no double
injection). Set `SSR_ROUTES=off` (or unset) to instantly revert to the SPA.
