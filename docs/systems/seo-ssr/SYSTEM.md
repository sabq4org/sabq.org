# SEO و SSR (`seo-ssr`)

> آخر مراجعة: 2026-07-30 | المالك: platform

## الغرض
ميتادات للدوالش، إعادة توجيه السلاق، وSSR للمحتوى العام عبر `web-next`.

## مفاتيح AI
لا يوجد — مولّد SEO بالذكاء الاصطناعي تحت `editorial` (`seo-generator`).

## عقود مهمة
- مسارات noindex → `Cache-Control: private, no-store`.
- `SSR_ROUTES=on/off` مفتاح تراجع فوري.
- **`/api/edge/seo-meta` (2026-07-25):** كاش ذاكرة `edgeSeoMetaCache` (MATCH 5د / MISS 30ث) + single-flight لنفس المسار + تطبيع المسار (بدون `?utm_*`) + CDN `s-maxage=300, stale-while-revalidate=600` (كان 60ث فيعيد ضرب الأصل كل دقيقة — ظهر كـ APM بطيء بعد كل إقلاع).
- **hreflang AR↔EN (2026-07-30):** الربط عبر `en_articles.seoMetadata.sourceArticleId`؛ وإلا لا يُرسل رابط لغة شقيقة مكسور. الترجمات **الجديدة** تفضّل نفس `englishSlug` العربي إن كان متاحاً (`/article/X` ↔ `/en/article/X`). IndexNow بعد الترجمة يستهدف `/en/article/...` ويُبطل كاش Redis لـ `__sitemapEnArticles*` + كاش `sitemap-news` في الذاكرة.
- **Static 404 noise:** مسارات ماسحات الأسرار (`secrets.json`, `credentials.json`, `.vscode/…`) ومسارات أرشيف CMS القديم (`/uploads/material-file/*`, `/uploads/media-cache/*`) تُرجع 404 بلا تحذير في اللوق — ليست ثغرة ولا صوراً حالية على القرص/GCS.
- **`GET /api/search`:** ميزانية إجمالية ~1.8ث + single-flight + كاش مفتاح موحّد بدون تشكيل + CDN قصير؛ لا تكديس مهلات FTS ثم العنوان حتى 2.5ث+.
- **بروكسي كاش الـ API في Pages (`functions/_middleware.js`, 2026-07-26):** لمسارات مثل `/api/homepage-lite` يُخزَّن الرد للحركة المجهولة فقط. يجب **قراءة الجسم كاملاً (`arrayBuffer`) والتحقق من `JSON.parse` قبل** `cache.put` وقبل إرجاعه للمتصفح. استنساخ stream حي مرتين (كاش + last-good) مع إعادته للعميل كان يقطع UTF-8 وسط النص (~4–5KB) فيظهر للزائر «Unterminated string in JSON» بينما المسجّل (تجاوز الكاش بـ `connect.sid`) يرى الصفحة سليمة. last-good المعطوب يُستبعد عند التقديم.

## عند التعديل
- [ ] قرأت هذا الملف + `docs/DEPLOYMENT_STATUS.md` عند لمس الطوبولوجيا
