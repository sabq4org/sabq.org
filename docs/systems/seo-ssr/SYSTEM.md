# SEO و SSR (`seo-ssr`)

> آخر مراجعة: 2026-09-25 (مراجعة تقرير السيو الخارجي: 404 الناعم والصفحات المؤسسية) | المالك: platform

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
- **Railway staging:** يجب ضبط `STAGING_NO_INDEX=true` على `web-next`؛ يضيف
  `X-Robots-Tag: noindex, nofollow, noarchive` وrobots meta ويمنع كاش CDN.
- **تقييد staging:** وجود `STAGING_ACCESS_TOKEN` يفرض Basic Auth (المستخدم
  `sabq`) على صفحات `web-next`، مع استثناء `/health` فقط لفحص Railway.
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

## حافة الصفحات — مراجعة 2026-09-05
- مسارات noindex في الخادم مغطاة باختبار مقابل Pages، بما فيها survey/meet/verify والإعدادات المترجمة.
- مفاتيح كاش الأقسام تشمل `withStats` و`includeIfox`.
- SSR له مهلة 5 ثوان؛ 5xx أو فشل الاتصال يرجع لمسار SPA/SEO القائم، بينما 404 الحقيقي يُحفظ.
- `googlebotNews` يمر إلى `googlebot-news` في Next. توقيع عنوان الزائر موثق في platform-runtime؛ يلزم إعداده قبل نشر دفعة الثقة بالحافة.

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

## اكتشاف المحتوى والتحديث — 2026-09-08

- زواحف البحث OAI-SearchBot وClaude-SearchBot وPerplexityBot تستخدم SSR القائم؛ لا تغيير robots أو تصريح تدريب. فشل SSR والميتادات يعيد 503 وRetry-After وno-store؛ 404/410 الحقيقي محفوظ. يُفحص HTML كاملًا قبل التخزين.
- HTML على الحافة 60 ثانية دون SWR، والمتصفح private/no-cache. مفاتيح الكاش تفصل النشر والجمهور، وتحتفظ بـpage للأرشيف. purge الرابط المعتاد لا يثبت إزالة كل مفاتيح الحافة المخصصة.
- bundles المقال والقسم والرئيسية لها MemoryCache محدود (300 إدخال/60 ثانية) وsingle-flight. جيل SEO يتغير مع الكتابة محليًا وعبر Redis؛ النتيجة الجارية قبل التغيير لا تُقدّم بعده. Next Data Cache معطل لهذه bundles لمنع إعادة ISR قديم. seo-meta نفسه 60 ثانية بدل السياسة التاريخية أعلاه.
- `seoMetadata.editorialModifiedAt` للمواد العربية مصدر dateModified؛ غيابه يعود إلى publishedAt، لا updatedAt ولا تخمين بعمر المادة. SQL تحديثه ذري؛ لا Schema جديد.
- صورة media.sabq.org تبقى على مصدرها الصحيح. الكاتب المؤسسي Organization؛ رابط Person إلى staff عام نشط أو صفحة الاسم الموجودة. صفحة الكاتب لا تفهرس عضوًا بلا مواد منشورة.
- الأقسام العربية: ?page=N، 30 مادة مرتبة بـpublishedAt/id، وcanonical مستقل وروابط السابق/التالي. الكاتب 18 مادة. الحد التشغيلي 10000 صفحة. لا تغيير عقود الموبايل.
- نوع المادة ووصف الصورة ومصدرها وإفصاح AI تمر في bundle وHTML؛ الرأي OpinionNewsArticle والتحليل AnalysisNewsArticle. التواريخ ميلادية بتوقيت الرياض.
- Google Indexing API غير مخصص للأخبار العامة؛ مسار النشر يكتفي بإشعار IndexNow للمحركات الداعمة.
- التحقق والقياس والقرارات المؤسسية: [دليل التسليم](../../editorial/seo-readiness-delivery-ar.md).

## عنوان الصفحة وقياس SPA — 2026-09-13
- Issue #1646: CategoryPage وCategoryArchivePage يعلنان عنوان الصفحة وquery page الآمن بعد اكتمال البيانات، دون الاعتماد على مقارنة نص العنوان السابق. الفشل عنوان مستقل، والتحميل لا يرسل عنوانًا سابقًا.
- الواجهة العامة البشرية هي مسار SPA الحالي وفق middleware؛ لا إضافة gtag إلى web-next المخصص لمسار الزواحف ضمن هذا الإصلاح. لا تغيير canonical أو cache أو proxy.

## حماية طلبات العاجل المساندة — 2026-09-19
- قائمة مشتركة ضيقة في Pages ووسيط API: تعليقات المقال15ث، إعداد إعلانDMS15ث، الثيم الفعال30ث، نظرة كأس الملك5ث دون `resilient=1`. لا توسيع لكاش متن المقال أو المصادقة أو التصويت أو التوصيات الشخصية.
- التخزين والدمج مشروطان بإعلان الأصل `X-Sabq-Public-Cache: 1` وJSON كامل صالح و200 وCache-Control عام موجب، بلا Set-Cookie أو private/no-store/no-cache. TTL لا يتجاوز سماح الأصل. Cookie وAuthorization وx-session-id تستثني الطلب؛ HEAD لا يملأ الكاش.
- الطلبات المتزامنة لنفس المفتاح تشترك في جلب واحد داخل isolate فقط، بخريطة محدودة بـ32 مفتاحًا، وفحص جسم بحد1MiB و10ث؛ الرد الأكبر يمر دون تخزين. مفاتيح هذه القائمة تحفظ معاملات الطلب وتميز لغة الرياضة الفعلية؛ لا خلط بين scope أو lang أو resilient أو Origin؛ ترويسة CORS المنعكسة لا تعبر بين الأصول. الرد غير المؤهل لا يوزّع بين الزوار.
- سياسة المسارات القديمة خارج هذه القائمة محفوظة. هذه الحماية تتطلب نشر Pages ووسيط api.sabq.org بالإضافة إلى API الذي يعلن صلاحية الرد؛ لا تكفي حزمة الخادم وحدها. الوسيط يحمي القراءات العامة المؤهلة على عنوان التطبيق الحالي دون تغيير عنوانه أو انتظار إصدار iOS، مع إبقاء الطلبات الشخصية خارج الكاش. التحقق عبر `tests/unit/edgeApiSurge.test.ts` باستجابات معزولة.

## إشارات المحتوى للذكاء الاصطناعي وllms.txt — 2026-09-24

- robots.txt (`server/utils/robotsTxt.ts`، يستدعيه `server/routes.ts`) يعلن داخل مجموعة `User-agent: *` السطر `Content-Signal: search=yes, ai-input=yes, ai-train=no` وفق contentsignals.org. القيم تطابق سياسة `/ai-policy` (Sabq-AI-Use-1.0): الاستدلال والاستشهاد مع الإسناد مسموحان، والتدريب والضبط الدقيق دون اتفاق مكتوب ممنوعان. لا تغيّر `ai-train` دون تعديل صفحة السياسة في نفس الـ PR.
- `client/public/llms.txt` ملف ثابت (امتداد `.txt` ضمن `STATIC_EXTENSIONS` فيُخدم من طبقة Pages الثابتة). يلخّص السياسة ويربط الأقسام العربية النشطة وخرائط الموقع وRSS. عند إضافة قسم رئيسي أو إيقافه حدّث الملف.
- لا تغيير على قواعد Allow/Disallow أو على مسارات noindex؛ إعدادات Cloudflare للبوتات تسمح للزواحف الموثقة (Verified Bots) ولا تحظر فئات الذكاء الاصطناعي.

## النشرة البريدية — 2026-09-24

- `/newsletter` في SPA وweb-next يقدم «سبق في ٣ دقائق» بخياري يومي/أسبوعي؛ النماذج في الرئيسية وبعد المتن وروابط التنقل والتذييل لا تغيّر canonical أو عقود bundles.
- الاشتراك يستدعي API القائم بعقد الموافقة وانتظار التأكيد؛ لا تفعيل عند عرض GET. رموز التأكيد في fragment، وتزال من شريط العنوان عند التقاطها للضغط الصريح.
- لا تضف gtag إلى web-next. صفحة التأكيد/التفضيلات في SPA مستثناة من analytics/ad bootstrap، مع بقاء قياس دعوات الاشتراك في الرئيسية والمقال دون بريد أو token.

## مراجعة تقرير السيو الخارجي — 2026-09-25

- **404 الناعم:** `server/utils/spaTopLevelRoutes.ts` يحمل المقطع الأول لكل مسار في `client/src/App.tsx`. مسار بمقطع أول غير معروف (بعد فحص slug-redirect والمعالجات) يأخذ من `/api/edge/seo-meta` ميتا `status: 404` مع `noindex, follow` وبلا canonical، ووسيط Pages يعيد القشرة المحقونة بالحالة 404 و`X-Robots-Tag` دون كاش؛ المتصفح يرى صفحة NotFound نفسها. الملف الثابت غير HTML (مثل `manifest.webmanifest`) لا يتأثر. الاختبار `spaTopLevelRoutes.test.ts` يفشل إذا أضيف مسار في App.tsx دون مقطعه هنا. المسار المعروف بلا معالج يبقى `index,follow` كما كان (لا noindex جماعي).
- **الصفحات المؤسسية العربية:** مداخل ثابتة بعنوان ووصف خاصين (مطابقة `STATIC_INDEXABLE_PAGES` في seoInjector، فقط لمسارات يعرضها App.tsx)، ومعالجات بنص للزواحف لـ `/about` و`/ai-policy` (نص السياسة من `shared/aiPolicyContent.ts` الذي تقرؤه صفحة SPA أيضًا) و`/opinion` (أحدث 40 رأيًا) و`/moment-by-moment` و`/daily-brief` (أحدث 40 خبرًا). صفحة الكاتب `/reporter/:slug` تضيف النبذة وأحدث 20 خبرًا بقاعدة المالك نفسها في `getReporterProfile`.
- **صورة المشاركة الافتراضية:** الميتا العامة تستخدم `/branding/sabq-og-image.png` (1200×630) بدل `icon.png` المربعة. أبعاد og تُعلن لصورة العلامة فقط؛ صورة الخبر الفعلية لا تُعلن لها أبعاد مفترضة. شعار الناشر في NewsArticle يحمل 1200×630.
- **الرئيسية في web-next:** og/twitter كاملة ومخطط NewsMediaOrganization (مطابق client/index.html) و`max-image-preview:large` ورابط اكتشاف RSS. ميتا الحافة للرئيسية تستخدم العنوان والوصف نفسيهما.
- **RSS:** robots.txt يسمح بـ `/api/rss/` (خلاصات عامة فقط في `rssFeedRoutes.ts`)، و`client/index.html` يعلن `<link rel="alternate" type="application/rss+xml">`.
- **روابط قديمة بلا تحويل (من Search Console):** `LEGACY_ROOT_REDIRECTS` في `edgeMeta.ts` يحوّل `/saudia` إلى رابط قسم «السعودية» الأساسي (englishSlug من الجدول) و`/collection/latest-news` إلى الرئيسية. روابط AMP القديمة (`/amp/<path>` و`/amp/story/<path>`) تُحل كالمسار الداخلي نفسه (قديم أو عربي أو news) أو تذهب إلى `/article/<slug>` مباشرة؛ ما لا يُحل يسقط إلى 404 الحقيقي أعلاه. الروابط القصيرة (`/sF6gde`) لا مقابل لها في `legacy_redirects` ولا `legacy_slug`، فتبقى 404.
- خارج هذا التغيير عمدًا: رابط الأقسام الأساسي المقروء (ترحيل canonical)، lastmod لكل خريطة وعدد خرائط الأوردو، HSTS سنة، توحيد اسم العلامة، حظر زواحف التدريب، والأداء. قرارات أو قياس مطلوب أولًا.

