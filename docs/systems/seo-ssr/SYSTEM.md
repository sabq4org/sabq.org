# SEO و SSR (`seo-ssr`)

> آخر مراجعة: 2026-10-23 (كاش بروكسي Pages لطلبات GET المجهولة واحترام s-maxage للأصل) | المالك: platform


## الغرض
ميتادات للدوالش، إعادة توجيه السلاق، وSSR للمحتوى العام عبر `web-next`.

## مفاتيح AI
لا يوجد — مولّد SEO بالذكاء الاصطناعي تحت `editorial` (`seo-generator`).

## عقود مهمة
- **بقاء وسوم القياس على التحويل (2026-10-03):** `slugRedirect` يلحق استعلام الطلب على مسار 301 (`redirectTargetWithSearch`) لخبر أو قسم. حافة Pages كانت تُبقي `url.search` عند `Response.redirect`. `utm_source` و`utm_medium` و`utm_campaign` و`utm_content` تصل إلى الصفحة. canonical يبقى بلا هذه الوسوم.
- **سبب التحديث (2026-09-27):** `GET /api/articles/:slug/seo-bundle` يضيف `updateLines` اختيارياً (`{id,at,text}`) لخبر عربي منشور، والنص جاهز بتوقيت الرياض. علم `publish_first_update_line` المطفأ أو جدول المراجعات الغائب يعيد `[]` ولا يغيّر بقية الحزمة. `web-next` يعرض الأسطر تحت المتن. لا تغيير على canonical أو كاش المفاتيح.
- **رابط صفحة الخدمة في متن الخبر (2026-10-22):** `contentHtml` العربي في `seo-bundle` يلحق، بعد رابط المونديال، فقرة رابط إلى `/services/*` حين يطابق العنوان خدمة من مواعيدك (`withServiceLinkHtml` في `shared/servicePages/articleLink.ts`)، ولا يكررها إن كان الرابط في المتن. `semanticHtml` العربي في `seo-meta` (قشرة SPA حين يتعذّر SSR) يحمل الرابط نفسه قائمة مخفية بجوار رابط المونديال. القاعدة في `docs/systems/mawaeed/SYSTEM.md`.
- **التحميل المبكر لصورة الخبر (2026-09-07):** بيانات AR SEO تعلن `heroPreload` للخبر المنشور ذي التاريخ الماضي وصورة غير فيديو فقط. الدالة المشتركة `articleHeroPreload.ts` تطابق نسخة URL وsrcset وsizes والجودة 85 مع الصورة المعروضة، وPages يحقن رابط preload عبر آليته الحالية. لا استعلام صورة إضافي ولا أبعاد مفترضة، وتبقى إعدادات هيرو الرئيسية 72 كما هي.
- **أرشيف Quintype (2026-09-07):** `archiveSeo.ts` يوحّد نسخ AR المنشورة فقط عند تطابق `legacy_slug` والعنوان والمحتوى الكامل وتاريخ النشر؛ الأصل هو الأقل `(created_at,id)`. لا حذف أو تغيير لسجلات الأخبار، ولا توحيد للترجمات أو للمحتوى المختلف. التحويلات وcanonical وخرائط الأرشيف العربية تستخدم القرار نفسه. بادئات الاستيراد (ومنها `regions`) تقرأ `legacy_redirects` أولاً، مع أولوية المسار الكامل والتحويلات الدائمة الداخلية إلى مقال فقط؛ `/Home` يتحول إلى `/`.
- **ميزانية خرائط الأرشيف:** بحث النسخ المرشحة محصور بفهرس `legacy_slug` مع حاجز `OFFSET 0`، وتسبق مقارنة الحالة والترتيب والعنوان والتاريخ قراءة المحتوى الكامل عبر `CASE`. هذه الحواجز تحفظ قرار التطابق وتمنع عودة استعلامات الفهرسين وقراءة المحتوى المبكرة؛ لا تُزل دون قياس خطة التنفيذ.
- **تقسيم AR (2026-09-07):** 500 خريطة عربية بدل 50 لتقليل كلفة القراءة الباردة؛ شرط `% 50` يحافظ على استخدام فهرس الإنتاج القائم، ثم `% 500` يختار الجزء الأصغر. كل خبر يخص جزءًا واحدًا. فهرس الخرائط يعلن الأجزاء كلها، مع مفاتيح كاش `index_archive_v3` و`__sitemapArticlesCanonicalV3`؛ الإنجليزية والأردية دون تغيير. لا تغيير Schema أو فهارس قاعدة البيانات.
- **قوائم JSON المفهرسة رغم robots (2026-09-07):** `apiListingRobots.ts` يضيف `X-Robots-Tag: noindex, nofollow` إلى GET/HEAD لقائمتي `/api/articles` و`/api/v2/articles` فقط. robots يسمح بمساريهما التامين ومعاملات الاستعلام لرؤية الترويسة؛ التفاصيل وبقية API تبقى محظورة. تبقى بيانات JSON العامة وكاشها وصلاحياتها كما هي؛ قاعدة no-store أدناه تخص قوالب HTML الخاصة، ولا تستلزم إلغاء كاش قوائم API العامة.
- **LCP صفحة القسم العربية (2026-09-26):** معالج `/category/:slug` (الصفحة الأولى فقط، لا `?page=`) يعلن `heroPreload` لصورة البطاقة ذات الأولوية: يعيد استعلام `/api/categories/:slug/articles` نفسه (الترتيب والشروط وحد 50، بما فيها الأقسام الذكية/الديناميكية) بأعمدة ضيقة، ثم `pickCategoryLandingLead` (آخر 30 يومًا، الأحدث، ترتيب مستقر) و`buildCardImagePreload` المشتركان مع `ArticleMedia`/`OptimizedImage` (عرض 640، جودة 85، `DEFAULT_IMAGE_SIZES_ATTR`). الإنفوجرافيك وقسم iFox غير AI بلا preload. `/api/categories/slug/:slug` صار في `getApiCacheTtl` بـ60ث للمجهول (صف فهرس عام بلا بيانات مستخدم). الحارس: `categoryCardPreload.test.ts`.
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
- **حجب زواحف التدريب (2026-10-13):** `AI_TRAINING_CRAWLERS` في `robotsTxt.ts` (GPTBot، ClaudeBot، anthropic-ai، CCBot، Bytespider، Applebot-Extended) لها مجموعة واحدة `Disallow: /`. زواحف البحث والاستشهاد (Googlebot، Bingbot، OAI-SearchBot، ChatGPT-User، Claude-SearchBot، Claude-User، PerplexityBot) تبقى على `*` بلا مجموعة خاصة، لأن البوت ذا المجموعة باسمه يتجاهل `*` فيفقد `Disallow: /api/`. Google-Extended مستثنى عمدًا: يتحكم في الاستشهاد داخل تطبيق Gemini، وحجبه يخالف `ai-input=yes`. robots إعلان لا إلزام؛ Bytespider معروف بتجاهله، وحجبه الفعلي في WAF على Cloudflare.
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
- **روابط إنجليزية قديمة لأخبار عربية (2026-09-26):** قبل 2026-07-30 كان كل خبر عربي يعلن hreflang="en" إلى `/en/article/<englishSlug>` حتى بلا ترجمة، فتراكم نحو 300 ألف 404 في Search Console. `computeSlugRedirect` يحوّل الآن `/en|ur/article/<slug>` الذي لا يطابق صفًا في `en_articles`/`ur_articles` لكنه خبر عربي منشور: إلى الترجمة الإنجليزية المنشورة إن وُجدت (`resolveEnSiblingSlug`) وإلا إلى `/article/<slug>`. ما لا يطابق شيئًا يبقى 404.
- خارج هذا التغيير عمدًا: رابط الأقسام الأساسي المقروء (ترحيل canonical)، lastmod لكل خريطة وعدد خرائط الأوردو، HSTS سنة، توحيد اسم العلامة، حظر زواحف التدريب، والأداء. قرارات أو قياس مطلوب أولًا.

## مواعيدك — HTML مبكر — 2026-09-27

- `GET/HEAD /mawaeed` يقدّم للزاحف HTML كاملاً من `functions/mawaeedPage.js` قبل قشرة SPA؛ الزائر يرى `MawaeedPage.tsx` داخل التطبيق. المسار مسجل في `spaTopLevelRoutes`. المسارات القديمة `/mawaeed/:slug` تحول 301 إلى صفحات الخدمة.
- `GET/HEAD /services/:id` يتبع المقال في العرض: القارئ يأخذ قشرة SPA (`client/src/pages/ServiceDatePage.tsx`). الزاحف، مع `SSR_ROUTES=on`، يأخذ `web-next/app/services/[id]` ويُقبل الرد فقط إذا احتوى `h1` وJSON-LD. عند سقوط SSR تُحقن الميتا من `buildServicePageEdgeMeta`. صفحات الكتالوج الخمس عامة ومفهرسة منذ 2026-10-16 (`index, follow, max-image-preview:large`) وتظهر في `sitemap-mawaeed.xml` وروابط `/mawaeed`، مع كاش HTML يشمل المنطقة. المعرّف غير المعروف يعيد 404 مع noindex,nofollow. التفاصيل في [`docs/systems/mawaeed/SYSTEM.md`](../mawaeed/SYSTEM.md).
- المصدر `GET /api/mawaeed` على Railway. الفشل 503 مع `noindex` و`no-store` ولا سقوط إلى القشرة. `dateModified` يأتي من JSON (`content_updated_at`) لا من ساعة الطلب.
- كاش المتصفح `private, no-cache`. `CDN-Cache-Control: public, max-age=60`. مفتاح Workers يضم المنطقة ووسم النشر حتى لا تختلط نسخة الرياض بمكة. المسح العادي لا يفرغ مفاتيح Workers المخصصة.


- **اكتشاف مواعيدك (2026-10-16):** الفوتر في SPA وSSR ونسخة الحافة يربط `/mawaeed` بنص «مواعيدك: الرواتب والإجازات». يعلن `robots.txt` خريطة `sitemap-mawaeed.xml` مباشرة، إضافة إلى ارتباطها بفهرس الخرائط. لا تغيير على قواعد زواحف التدريب أو حظر API.

- **ترويسات صفحات الخدمات (2026-10-16):** أُزيل حظر `/services/:id` القديم من Middleware وإعدادات headers في Next؛ ميتا `index, follow` وحدها لا تتغلب على `X-Robots-Tag: noindex`. تظل بيئة staging محمية وغير قابلة للفهرسة. اختبار `tests/web-next/serviceMiddlewareRobots.test.ts` يتحقق من مساري إعدادات headers وMiddleware.

- **تطابق مناطق التقويم (2026-10-16):** صفحة المدرسة في Next تقرأ `searchParams.region` وتطلب النموذج نفسه الذي يقرأه SPA؛ canonical ثابت بلا المنطقة. جميع الإدارات في نموذج API، ولا ينسخ SSR قائمة مستقلة.

## توافق القراءة مع وكلاء AI — 2026-10-21

- ترويسة `Content-Signal: search=yes, ai-input=yes, ai-train=no` تضاف إلى HTML العام الناجح في Pages، بما فيه cache hit والمسار البديل، مع `Vary: Accept`. تستثنى الطلبات ذات بيانات الدخول ومسارات/استجابات noindex والمضيف غير الأساسي والأخطاء. السياسة تطابق robots وai-policy؛ لا تصريح تدريب جديد.
- `ChatGPT-User` و`Claude-User` و`Perplexity-User` تختار SSR مثل زواحف البحث القائمة. طلب Markdown الصريح المؤهل يختار HTML كاملًا ليحوّله Cloudflare خارجيًا؛ الوسيط لا ينتج Markdown بنفسه. تفاوض Accept يحترم q=0 وأفضلية HTML، ويفصل الكاش بعلامة `m` عن `b` و`h`.
- اختيار العرض ليس مصادقة ولا إثبات هوية؛ لا تجاوز WAF أو صلاحيات الحساب. Cookie وAuthorization يستثنيان من اختيار SSR وإضافة Content-Signal؛ كاش SPA القائم دون تغيير. صفحة meta noindex تعلنها كذلك في X-Robots-Tag حتى لا يناقضها Content-Signal.
- `/api/rss/articles` و`/api/rss/articles/category/:slug` و`/api/rss/articles.json` تستخدم `englishSlug || slug` في رابط المقال. RSS guid وJSON Feed id يحتفظان بقيمهما السابقة لمنع تكرار العناصر. RSS المقالات يعالج CDATA وسمات XML بأمان. JSON Feed يعلن content_text من المقتطف العام أو العنوان عند غيابه وفق الإصدار 1.1، دون جلب المتن الكامل. لا تغيير على التصفية أو نطاق البيانات ولا على عقود API للموبايل؛ خلاصات podcast وOPML خارج الإصلاح.
- الاختبارات: `edgeAiReadiness.test.ts` و`rssFeedReadiness.test.ts` مع حراس SSR القائمة. معيار القبول الإنتاجي وحدود هدف 98% في [معيار جاهزية AI](../../ai-readiness-acceptance-ar.md). الاختبارات المحلية لا تثبت تحويل Cloudflare أو وصول الزواحف الحقيقي قبل نشر النسخة وفحصها.

## اكتشاف دليل المحتوى للوكلاء — 2026-10-21

- استجابة الصفحة الرئيسية `https://sabq.org/` الناجحة (`200` و`text/html`، بطلب `GET/HEAD`) تعلن `Link: <https://sabq.org/llms.txt>; rel="describedby"; type="text/plain"`. الدليل ثابت ومتاح للعامة؛ يشرح سياسة الاستخدام ويربط الأقسام وخرائط الموقع وRSS.
- تضيف طبقة `onRequest` الخارجية في Pages العلاقة بعد اختيار الاستجابة، فتشمل SPA وSSR وضربات كاش HTML. تُحفظ ترويسات `Link` القائمة (مثل preconnect/preload) دون استبدال، ولا تتكرر العلاقة التي تضيفها الطبقة.
- لا تُضاف العلاقة إلى المضيفات غير الأساسية أو الصفحات الخاصة أو API أو الأصول أو الردود غير HTML أو الأخطاء والتحويلات. لا تغيير على الجسم أو حالة الرد أو سياسة الكاش أو ترويسات الأمن.
- لا تغيير على robots.txt أو سياسة منع التدريب أو DNS أو صلاحيات API. لا يُعلن كتالوج API أو بروتوكول وكلاء غير متحقق منه لرفع نتيجة الفحص.
- التحقق: `tests/unit/pagesAgentDiscovery.test.ts` يغطي وصول الترويسة عبر المعالج والحفاظ على العقود القائمة. نتيجة الأداة الخارجية لا تُعد مرتفعة حتى نشر Pages وإعادة فحص `Content Site`؛ الدرجة المتوقعة مشروطة بنجاح بقية الفحوص وبطريقة احتساب الأداة.

## فهرس الخدمات الثابت للوكلاء — 2026-10-22

- `client/public/.well-known/agent-index.json` هو فهرس مؤسسي محلي بالمخطط
  `sabq.agent-index.v1`، وليس معيارًا عامًا. يصف قراءات HTTPS العامة والخلاصات
  (RSS وJSON Feed) ودليل `llms.txt` وسياسة الاستخدام فقط. دلالة `public-get`
  هي طلب HTTPS عام بـ`GET` دون أن يضيف الفهرس مصادقة أو صلاحية جديدة.
- يعلن `policy.content_signal` القيم `search=yes, ai-input=yes, ai-train=no`،
  ويلزم الإسناد باسم «سبق» ورابط المقال المباشر، مع حد تقريبي للملخص القصير
  (نحو 150 كلمة) كما في سياسة الاستخدام. لا يعلن الفهرس MCP أو A2A أو OAuth ولا يضيف
  مسارات خاصة؛ جميع روابطه أصلها `https://sabq.org`.
- `docs/agent-discovery-dns-ops-ar.md` يوثق سجل SVCB تجريبيًا اختياريًا؛
  `key65400` تعيين private-use محلي وليس معامل DNS قياسيًا. لا تغيير DNS ضمن
  الكود، ولا يُضاف السجل قبل نشر Pages والتحقق من JSON والروابط وCloudflare.
- هذا الفهرس لا يغيّر `server/agentReady.ts` أو بطاقة MCP الحالية؛ أي إعلان
  MCP يحتاج تنفيذًا مستقلًا قبل توثيقه.

## نسخة Node في web-next — 2026-10-21
- `web-next/Dockerfile` مثبّت على `node:22.23.4-alpine` بدل الوسم المتحرك `node:22-alpine`، بعد إصدار Node الأمني في 2026-10-21 (Brotli RCE وتجاوز تحقق اسم المضيف في TLS). التثبيت يجعل كل بناء على Render قابلًا للتحقق. أي ترقية لاحقة تغيّر الوسم صراحةً وتُراجع مع `platform-runtime` (صورة الـAPI وCI على 24.22.1).

## كاش Pages لتقليل bandwidth على Render — 2026-10-22 (محدّث 2026-10-23)
- Render يحاسب على الخروج (0.15$/GB بعد 25 GB)، وكانت أغلب طلبات `/api` من Pages تصل الأصل. `cachedJson` يقبل TTL رقمًا أو دالة على الحمولة: `seo-meta` و`slug-redirect` يُحفظان 60ث للإجابة المحسومة، و10ث لما يحجب الصفحة (noindex، not found، gone، redirect) حتى يظهر الخبر المنشور حديثًا سريعًا.
- `FULL_QUERY_API_CACHE_ROUTES` في `functions/_middleware.js` يضيف قراءات عامة للمجهول: `v1/homepage` و`v1/news/paginated` و`v1/live` و`v1/articles` (15ث)، `v1/sections` و`sports/competitions` (300ث)، `v1/trending` وstories، opinion (القائمة وrelated/category)، reporters/:slug، economy/snapshot، audio-bulletin/current (30ث)، muqtarab/topics/featured، mawaeed، shortlinks/article (300ث)، لطلبات GET فقط. مفتاحها يحفظ الاستعلام كاملًا مرتبًا ومعه `Origin` الطلب دائمًا (`absent` أو `present:`) لأن CORS يعكسه. بقية المسارات صارت تحفظ الاستعلام كاملًا أيضًا (القسم التالي). نتائج المباريات الحية (`sports/today` و`rsl/hero`) ليست في هذه القائمة، بل في الكاش المشترك `cloudflare-worker/public-api-burst-cache.js` منذ 2026-10-24: يتبع مدة الأصل (5ث أثناء المباراة) ولا يحفظ شيئًا مع no-store، ومفتاح `sports/today` يحمل لغة الرد مثل كأس الملك. الكوكي والتفويض و`_nc`/`_t` وno-cache تتجاوز الكاش كما في بقية المسارات. الحارس: `edgeAuditGuards.test.ts` و`edgeMetadataBudget.test.ts`.
- **خرائط الموقع على الحافة (2026-10-24):** `sitemap.xml` و`sitemap-*.xml` كانت تمر إلى Render بلا كاش (نحو خُمس ما ليس فيديو). `getApiCacheTtl` يحفظها الآن ساعة لطلبات GET المجهولة، وتحدّها `s-maxage` الأصل (180ث لـ`sitemap-news.xml`). مفتاحها الرابط المجرد، فيصله مسح النشر. بلا مهلة 10ث، لأن الجزء البارد يُبنى عند الطلب. ورد slug-redirect العادي («لا تحويل») يُحفظ 5 دقائق بدل دقيقة، والتحويل وgone يبقيان 10ث. و`.webmanifest` صار ملفًا ثابتًا فلا يطلب ميتا SEO. الحارس: `edgeAuditGuards.test.ts`.
- **بروكسي `proxyToApi` و`caches.default` لطلبات GET المجهولة (2026-10-23):** لأي طلب `GET /api/*` مجهول غير شخصي (`isAnonymousCacheableApiGet`: بلا كوكي جلسة `connect.sid`، بلا `Authorization` أو `x-session-id`، وليس `/api/admin` ولا `/api/auth` ولا مسارات الحساب/الإشعارات/المفضلة/الولاء)، يمرّر `proxyToApi` الخيار `cf: { cacheEverything: true }`، ويحفظ `handleRequest` الاستجابة في `caches.default` بمفتاح الـ URL الكامل المرتب (`apiCacheKey`) مع احترام `s-maxage` الموجب القادم من الأصل (`originPublicSmaxAge`) وعدم تخزين أي استجابة تحمل `Set-Cookie` أو `private` أو `no-store` أو `no-cache`.
- 2026-10-22 (الجولة الثانية): صوت «استمع» `/api/articles/:slug/summary-audio` يُحفظ على حافة Pages 600ث للمجهول (0.6 إلى 1.3 MB للطلب، وكان 5 إلى 8% من خروج Render). تغيير الصوت أو المزوّد يصل الحافة خلال 10 دقائق. المدخل يحمل `timeoutMs: 0` فيبقى آخر محاولة للأصل بلا مهلة (`apiProxyTimeoutMs`) لأن التوليد الأول قد يتجاوز 10ث، وبقية القراءات المحفوظة تبقى بمهلة 10ث. ويحمل `lastGood: false` فلا نسخة 24 ساعة له (`apiLastGoodAllowed`). ما جاء من كاش وسيط `api.sabq.org` ومعه `Age` يُحفظ لما بقي من مدة المسار (`remainingApiCacheTtl`) حتى لا تتراكم الطبقتان، وتُحذف `CDN-Cache-Control` من النسخة المحفوظة لأنها تتقدم على Cache-Control (كانت `no-store` الأصل تمنع حفظ الصوت، و600ث الوسيط تتجاوز المدة الباقية). ويحمل `requireHeader` فلا يُحفظ إلا رد عليه `X-Sabq-Article-Published: 1` (`apiAnswerShareable`). مشغل الويب لم يعد يطلب `no-store`، وتطبيق iOS يأخذ الكاش نفسه من وسيط `api.sabq.org` (`auth-rbac`).

## تدقيق أمني لحافة Cloudflare — 2026-10-22
- **seo-meta لغير المنشور:** معالجات `/article` و`/opinion` و`/en/article` و`/ur/article` و`/gulf/:id` وموضوع مُقترب تعامل الصف غير المنشور كالمفقود (`publishedRow` في `edgeMeta.ts`)، فيعود الميتا الافتراضي مع `noindex, follow`. كان المسار العام يكشف عنوان المسودة والمجدول والمؤرشف وملخصه وصورته وكاتبه وموعد نشره، بينما `seo-bundle` يرد 404. `/omq/:id` يعامل التحليل غير المنشور (ومنه `completed`) كالمعرّف المفقود، كما يفعل `/api/omq/:id`. أثر جانبي مقبول: رابط مسودة يُشارك قبل النشر يظهر ببطاقة الموقع العامة.
- **مفتاح كاش Pages للـ API:** `apiCacheKey` يحفظ الاستعلام كاملًا مرتبًا لكل المسارات، ويُسقط فقط `_nc` و`_t` و`utm_*` و`fbclid` و`gclid` وأسماء `__sabq_*` المحجوزة للحافة. القائمة الثابتة القديمة (8 معاملات) أسقطت `status` و`locale` و`excludeId` والمعاملات المكررة، فكان زائر يختار ما يراه القراء المجهولون (مثل `/api/categories/smart?status=`). بُعد `Origin` يُضاف حين يوجد؛ وبدونه يبقى المفتاح الرابط المجرد الذي يطهّره `purgeArticle` و`purgeHomepage` و`purgeCategory`.
- **نسخة الطوارئ (last-good):** تبقى لمسارات المقال، بقرار المالك في 2026-10-22: صفحة المقال تبقى متاحة عند تعطل الأصل أو اختناقه وقت العاجل. رد JSON بـ404 أو 410 من الأصل يحذف نسختي ذلك الطلب في الموقع (الطازجة ونسخة 24 ساعة)، ومع المقال قراءاته الست (`ARTICLE_API_SUBREADS`). صفحة 404 من المنصة (HTML) لا تحذف شيئًا. الخطر المتبقي: موقع Cloudflare لم يصله طلب للمقال بين سحبه ووقوع عطل خلال 24 ساعة. تطهير شامل لها يحتاج وسوم Cache-Tag؛ توثيق Cloudflare لا يضمن أن تطهير الرابط المفرد يصل إلى نسخ Cache API.
- الحارس: `edgeAuditGuards.test.ts` (المفتاح، والحذف عند 404، وبقاء النسخة عند 404 المنصة) و`edgeSeoReadiness.test.ts` (seo-meta لغير المنشور).
