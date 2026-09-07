# SEO و SSR (`seo-ssr`)

> آخر مراجعة: 2026-09-07 | المالك: platform

## الغرض
ميتادات للدوالش، إعادة توجيه السلاق، وSSR للمحتوى العام عبر `web-next`.

## مفاتيح AI
لا يوجد — مولّد SEO بالذكاء الاصطناعي تحت `editorial` (`seo-generator`).

## عقود مهمة
- **أرشيف Quintype (2026-09-07):** `archiveSeo.ts` يوحّد نسخ AR المنشورة فقط عند تطابق `legacy_slug` والعنوان والمحتوى الكامل وتاريخ النشر؛ الأصل هو الأقل `(created_at,id)`. لا حذف أو تغيير لسجلات الأخبار، ولا توحيد للترجمات أو للمحتوى المختلف. التحويلات وcanonical وخرائط الأرشيف العربية تستخدم القرار نفسه. بادئات الاستيراد (ومنها `regions`) تقرأ `legacy_redirects` أولاً، مع أولوية المسار الكامل والتحويلات الدائمة الداخلية إلى مقال فقط؛ `/Home` يتحول إلى `/`.
- **SSR recovery (2026-09-07):** قراءة HTML كاملة بمهلة 5 ثوانٍ قبل تقديم 200؛ فشل الاتصال/الجسم و5xx يعود إلى حقن المحتوى الدلالي الموجود، بينما 404 الحقيقي يبقى 404. لا تُخزَّن استجابة SSR جزئية.
- **قوائم JSON المفهرسة رغم robots (2026-09-07):** `apiListingRobots.ts` يضيف `X-Robots-Tag: noindex, nofollow` إلى GET/HEAD لقائمتي `/api/articles` و`/api/v2/articles` فقط. robots يسمح بمساريهما التامين ومعاملات الاستعلام لرؤية الترويسة؛ التفاصيل وبقية API تبقى محظورة. تبقى بيانات JSON العامة وكاشها وصلاحياتها كما هي؛ قاعدة no-store أدناه تخص قوالب HTML الخاصة، ولا تستلزم إلغاء كاش قوائم API العامة.
- مسارات noindex → `Cache-Control: private, no-store`.
- `SSR_ROUTES=on/off` مفتاح تراجع فوري.
- **`/api/edge/seo-meta` (2026-07-25):** كاش ذاكرة `edgeSeoMetaCache` (MATCH 5د / MISS 30ث) + single-flight لنفس المسار + تطبيع المسار (بدون `?utm_*`) + CDN `s-maxage=300, stale-while-revalidate=600` (كان 60ث فيعيد ضرب الأصل كل دقيقة — ظهر كـ APM بطيء بعد كل إقلاع).
- **hreflang AR↔EN (2026-07-30):** الربط عبر `en_articles.seoMetadata.sourceArticleId`؛ وإلا لا يُرسل رابط لغة شقيقة مكسور. الترجمات **الجديدة** تفضّل نفس `englishSlug` العربي إن كان متاحاً (`/article/X` ↔ `/en/article/X`). IndexNow بعد الترجمة يستهدف `/en/article/...` ويُبطل كاش Redis لـ `__sitemapEnArticles*` + كاش `sitemap-news` في الذاكرة.
- **مراكز اكتشاف EN (2026-07-30):** `/en` صار معالجاً ديناميكياً في `ROUTE_HANDLERS` (لا تُعِده إلى `LOCALIZED_STATIC_PAGES` — الثابت يسبق المعالجات فيمسح الروابط) يحقن `semanticHtml` بروابط أقسام EN + آخر 60 خبراً، و`/en/category/:slug` يحقن آخر 40 خبر قسم — نفس علاج «الرئيسية بلا روابط» العربي. بدونها كل أخبار EN يتيمة (sitemap فقط، ومبدّل اللغة زر JS) فتعلق في "Discovered – currently not indexed" بينما العربية تُفهرس بدقائق.
- **lang/dir للحواف المترجمة (2026-07-30):** وسيط Pages يفرض `lang="en" dir="ltr"` على `/en*` و`lang="ur"` على `/ur*` (`localeAttrsForPath`) في مساري SSR والحقن معاً — قشرة SPA وweb-next كلاهما يعلنان `ar/rtl` لكل المسارات (تجاوز web-next لكل لغة ما زال "Phase 2"). حارس عدم التراجع: `e2e/seo-signals.spec.ts` (إنتاج فقط) + `tests/unit/edgeLocaleAttrs.test.ts`.
- **Static 404 noise:** مسارات ماسحات الأسرار (`secrets.json`, `credentials.json`, `.vscode/…`) ومسارات أرشيف CMS القديم (`/uploads/material-file/*`, `/uploads/media-cache/*`) تُرجع 404 بلا تحذير في اللوق — ليست ثغرة ولا صوراً حالية على القرص/GCS.
- **`GET /api/search`:** ميزانية إجمالية ~1.8ث + single-flight + كاش مفتاح موحّد بدون تشكيل + CDN قصير؛ لا تكديس مهلات FTS ثم العنوان حتى 2.5ث+.
- **بروكسي كاش الـ API في Pages (`functions/_middleware.js`, 2026-07-26):** لمسارات مثل `/api/homepage-lite` يُخزَّن الرد للحركة المجهولة فقط. يجب **قراءة الجسم كاملاً (`arrayBuffer`) والتحقق من `JSON.parse` قبل** `cache.put` وقبل إرجاعه للمتصفح. استنساخ stream حي مرتين (كاش + last-good) مع إعادته للعميل كان يقطع UTF-8 وسط النص (~4–5KB) فيظهر للزائر «Unterminated string in JSON» بينما المسجّل (تجاوز الكاش بـ `connect.sid`) يرى الصفحة سليمة. last-good المعطوب يُستبعد عند التقديم.

## عند التعديل
- [ ] قرأت هذا الملف + `docs/DEPLOYMENT_STATUS.md` عند لمس الطوبولوجيا
