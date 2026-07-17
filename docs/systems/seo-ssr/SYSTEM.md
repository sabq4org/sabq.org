# SEO و SSR (`seo-ssr`)

> آخر مراجعة: 2026-07-17 | المالك: platform

## الغرض
ميتادات للدوالش، إعادة توجيه السلاق، وSSR للمحتوى العام عبر `web-next` خلف Cloudflare Pages.

## الحدود
- **داخل النطاق:** `seoInjector`, `slugRedirect`, `edgeMeta`, `web-next`, `functions/_middleware.js`.
- **خارج النطاق:** لوحة التحكم (SPA) — تبقى على `client/`.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Express | `server/seoInjector.ts`, `server/routes/edgeMeta.ts` |
| Edge | `functions/_middleware.js` |
| SSR app | `web-next/` |
| Docs | `docs/DEPLOYMENT_STATUS.md`, runbooks التقنية في `docs/technical-seo-*` |

## عقود مهمة / Gotchas
- مسارات noindex يجب `Cache-Control: private, no-store`.
- `SSR_ROUTES=on/off` مفتاح تراجع فوري.
- الإنتاج: Pages + Railway — ليس Replit.

## صحة وتشغيل
- راقب حواف المقالات/التصنيفات بعد النشر

## عند التعديل
- [ ] قرأت هذا الملف + `docs/DEPLOYMENT_STATUS.md` عند لمس الطوبولوجيا
