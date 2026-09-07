# SEO و SSR (`seo-ssr`)

> آخر مراجعة: 2026-09-07 | المالك: platform

## الغرض
ميتادات للدوالش، إعادة توجيه السلاق، وSSR للمحتوى العام عبر `web-next`.

## مفاتيح AI
لا يوجد — مولّد SEO بالذكاء الاصطناعي تحت `editorial` (`seo-generator`).

## عقود مهمة
- **التحميل المبكر لصورة الخبر (2026-09-07):** بيانات AR SEO تعلن `heroPreload` للخبر المنشور ذي التاريخ الماضي وصورة غير فيديو فقط. الدالة المشتركة `articleHeroPreload.ts` تطابق نسخة URL وsrcset وsizes والجودة 85 مع الصورة المعروضة، وPages يحقن رابط preload عبر آليته الحالية. لا استعلام صورة إضافي ولا أبعاد مفترضة، وتبقى إعدادات هيرو الرئيسية 72 كما هي.
- **أرشيف Quintype (2026-09-07):** `archiveSeo.ts` يوحّد نسخ AR المنشورة فقط عند تطابق `legacy_slug` والعنوان والمحتوى الكامل وتاريخ النشر؛ الأصل هو الأقل `(created_at,id)`. لا حذف أو تغيير لسجلات الأخبار، ولا توحيد للترجمات أو للمحتوى المختلف. التحويلات وcanonical وخرائط الأرشيف العربية تستخدم القرار نفسه. بادئات الاستيراد (ومنها `regions`) تقرأ `legacy_redirects` أولاً، مع أولوية المسار الكامل والتحويلات الدائمة الداخلية إلى مقال فقط؛ `/Home` يتحول إلى `/`.
- **ميزانية خرائط الأرشيف:** بحث النسخ المرشحة محصور بفهرس `legacy_slug` مع حاجز `OFFSET 0`، وتسبق مقارنة الحالة والترتيب والعنوان والتاريخ قراءة المحتوى الكامل عبر `CASE`. هذه الحواجز تحفظ قرار التطابق وتمنع عودة استعلامات الفهرسين وقراءة المحتوى المبكرة؛ لا تُزل دون قياس خطة التنفيذ.
- **تقسيم AR (2026-09-07):** 500 خريطة عربية بدل 50 لتقليل كلفة القراءة الباردة؛ شرط `% 50` يحافظ على استخدام فهرس الإنتاج القائم، ثم `% 500` يختار الجزء الأصغر. كل خبر يخص جزءًا واحدًا. فهرس الخرائط يعلن الأجزاء كلها، مع مفاتيح كاش `index_archive_v3` و`__sitemapArticlesCanonicalV3`؛ الإنجليزية والأردية دون تغيير. لا تغيير Schema أو فهارس قاعدة البيانات.
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

## ثقة بروكسي Pages وWorker
- `functions/_middleware.js` يوقّع عنوان الزائر عند تمرير `/api/*` إلى `API_ORIGIN`، ويحذف أي ترويسات `X-Sabq-*` واردة من العميل قبل إعادة البناء.
- `cloudflare-worker/wrangler.api.toml` يثبت route الإنتاج `api.sabq.org/*` مع `zone_name = "sabq.org"` بعد تحقق Railway والأصل. يبقى `EDGE_PROXY_SHARED_SECRET` binding مُداراً خارج الملف؛ غياب السر في Worker يفشل مغلقاً بـ503 ولا يمرر الطلبات. لا توجّه `API_ORIGIN` إلى `api.sabq.org` نفسه لتجنب الحلقة. بوابة قبول عنوان الوكيل الحساس (`EDGE_PROXY_GATE_REQUIRED`) تُدار في خدمة Railway API عبر `server/utils/trustedProxyIp.ts`، وليست متغيراً في Worker.
- ترتيب التراجع: اضبط `EDGE_PROXY_GATE_REQUIRED=off` في خدمة Railway API وأعد نشرها، وتحقق من مرور الطلبات عبر المسار البديل، ثم أزل route إن لزم. لا تُزل route قبل تعطيل البوابة وإعادة نشر API، ولا تعِد تفعيل route دون secret وsmoke لـ`/health` وطلبات API للقراءة.
- `web-next` يمرر طلبات SSR العامة إلى `NEXT_ORIGIN` ولا يُستخدم كمصدر عنوان زائر؛ مسارات GET لا تعتمد على Bearer-keying.

### تصحيح ارتباط خرائط الأرشيف — 2026-09-07
- جدول البحث الداخلي يستخدم `archive_candidate` صراحة حتى يشير `articles.legacy_slug` إلى الصف الخارجي. تحقق الإنتاج يشمل SQL الفعلي المولّد من Drizzle؛ اختلاف alias في استعلام قياس مستقل لا يكفي لاختبار السلوك.

## ميزانية انتظار ميتادات الحافة — 2026-09-07
- `cachedJson` يحد جلب origin وقراءة الجسم بـ 2500ms عبر AbortSignal. الفشل يعيد مسار SPA القائم بـ no-store، ولا يخزن قالبًا عامًا مكان بيانات المقال.
- يُتحقق من JSON قبل تخزينه، وكتابة كاش الميتادات تعمل عبر `context.waitUntil` دون حجب استجابة HTML. كاش HTML الخاص يبقى no-store. مهلة SSR المستقل ليست ضمن هذا التغيير.

## توقيع الطلبات إلى الأصل — 2026-09-07
- Pages يوقّع method/path/query/IP/timestamp بسر تشغيل مستقل، ويحذف ترويسات X-Sabq القادمة من العميل قبل التوقيع. طلبات الميتادات تستخدم GET دون Cookie أو Authorization.
- web-next يوقّع طلباته الداخلية بهوية خدمة ثابتة. هذه المرحلة تنشر المرسلين فقط؛ تفعيل verifier وحارس API يأتي بعد تحقق المرور عبر جميع البوابات وفق runbook. لا يتغير عقد JSON للمستهلكين.

## ترويسات HTML الأمنية — 2026-09-07

- كل استجابة `text/html` في Pages، بما فيها cache hit وSSR وSPA و404/410، تمر عبر حارس مشترك يضيف `X-Content-Type-Options: nosniff` و`Referrer-Policy: strict-origin-when-cross-origin`.
- لا تضيف Pages ترويسة CSP حالياً؛ أزيل تعميم Report-Only بعد رصد تدفق كثيف للتقارير واستجابات 429. يتطلب تفعيل التقارير لاحقاً جمعاً مستقلاً وميزانية وعينة محدودة. يستمر مسار التقارير الحالي بحد 16KB و60 طلباً في الدقيقة لكل عنوان موثّق عبر `getRealIp` مع تطبيع IPv6، دون الاعتماد على ترويسات الزائر غير المتحققة.
- `Strict-Transport-Security: max-age=86400` يضاف فقط للمضيفين `sabq.org` و`www.sabq.org`. لا توجد `includeSubDomains` أو `preload`، ولا يضاف HSTS لمضيفات preview/duplicate.
- لا يضاف `X-Frame-Options` أو `frame-ancestors` حتى تُعاد تهيئة CSP بميزانية وتقارير مضبوطة.
- فحص smoke لـ`GET /health` يثبت 2xx وJSON خلال 15 ثانية دون login أو كتابة. يستخدم `PW_API_BASE_URL` مستقلاً عن `PW_BASE_URL` لأن Pages قد يعيد HTML عند طلب `/health`; في التشغيل المحلي يكون fallback هو `http://localhost:5000`، والإنتاج يضبطه على `https://api.sabq.org`.

## DMARC

يبقى إعداد DMARC خارج هذا التغيير: يتطلب عنوان mailbox معتمداً لتقارير `rua/ruf` وجرداً مؤكداً لكل المرسلين الشرعيين قبل رفع السياسة من `p=none`.
