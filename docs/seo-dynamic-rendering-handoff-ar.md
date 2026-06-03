# إحاطة للإيجنت: بنية سبق للـ SEO (Dynamic Rendering) — اقرأها قبل أي تعديل

> آخر تحديث: 2026-06-03 — هذا المستند مرجع تسليم (handoff) لأي Agent يعمل على تحسينات SEO في سبق.
> اقرأه كاملاً قبل لمس أي ملف يخص الفهرسة أو العرض.

## 1) الخلاصة في سطر

الموقع يعمل بـ **Dynamic Rendering مقصود**: المستخدم البشري يرى **SPA الأصلي تماماً**، و**Googlebot/الزواحف** يرون نسخة **SSR (Next.js)**. هذا **قرار متعمّد** (المالك يشترط بقاء تصميم SPA حرفياً كما هو)، وليس خطأً أو عشوائية.

الفهرسة السريعة تعمل، لكن **إشارات النسختين غير متطابقة** في الرئيسية والتصنيفات — وهذا هو الخطر الحقيقي (شبهة Cloaking)، والأولوية الآن **توحيد الإشارات** لا إصلاح الفهرسة.

## 2) كيف يعمل التوجيه (لا تكسر هذا)

الملف: `functions/_middleware.js` (Cloudflare Pages)

- زائر بشري → SPA من `dist/public` + **حقن SEO خفيف عند الـ Edge** (P1/P2) عبر HTMLRewriter.
- زاحف (يُكتشف عبر `CRAWLER_RE` في الـ User-Agent) على مسار SSR → **proxy إلى تطبيق Next.js (`web-next`)** على Railway (`NEXT_ORIGIN`).
- مسارات SSR: المقالات (ar/en/ur)، التصنيفات، الرئيسية.
- **فصل الكاش حسب الجمهور:** `__v=b` للبوتات و`__v=h` للبشر. **لا تدمج مفاتيح الكاش.**
- `/_next/*` يُمرَّر إلى `NEXT_ORIGIN` (وإلا تظهر صفحات SSR بلا تنسيق).

## 3) النسختان ومصدر بياناتهما الموحّد

| السطح | الملفات | مصدر البيانات |
|------|---------|----------------|
| نسخة البشر (SPA) | الحقن في `functions/_middleware.js` | `/api/edge/seo-meta` + `/api/edge/slug-redirect` |
| نسخة Googlebot (SSR) | `web-next/*` (`generateMetadata` + المكوّنات) | `/api/edge/*-bundle` |

> كلاهما يقرأ من **مصدر واحد**: `server/routes/edgeMeta.ts`. أي إثراء للبيانات يكون **هنا فقط**، و**إضافي فقط (additive)** — لا تحذف حقولاً قائمة.

## 4) ما تم التأكد منه على الحيّ (2026-06-03)

### قبل إصلاحات 2026-06-03

- **المقال (Googlebot)** — كان صالحاً للفهرسة الأساسية، لكن:
  - `title` فيه تكرار: `… | سبق | سبق` ❌
  - `h1=1` ✅، JSON-LD: `NewsArticle` موجود ✅، `robots: index, follow, max-image-preview:large` ✅
  - **لا يوجد `BreadcrumbList`** ❌
- **الرئيسية (Googlebot)**: `title: سبق` (مجرّد)، `h1=1`، **JSON-LD=0** ❌، **بلا robots meta** ❌
- **التصنيف (Googlebot)**: **JSON-LD=0** ❌، **بلا robots meta** ❌

### بعد إصلاحات 2026-06-03

تم تنفيذ ونشر commitين على `main`:

1. `70fabc6 fix seo metadata for dynamic rendering`
2. `49ddbd3 add category latest links to ssr article pages`
3. `f093693 fix(seo): add edge keyword/reporter handlers with noindex-when-empty`
4. `3a8cab8 fix(seo): link only qualified article tags in SSR`
5. `0a2f730 fix(seo): noindex unpublished article payloads`
6. `e476155 fix(seo): prepare curated topic hubs`

**نتيجة القياس الحي على المقال `https://sabq.org/article/qzVBFf1` كـ Googlebot بعد النشر:**

- HTTP `200`
- TTFB ≈ `0.85s`
- `title` نظيف: لا يوجد `| سبق | سبق` ✅
- `canonical`: `https://sabq.org/article/qzVBFf1` ✅
- `robots`: `index, follow, max-image-preview:large` ✅
- `h1=1` ✅
- `h2=1` بعد إضافة بلوك "آخر أخبار التصنيف" ✅
- JSON-LD count = `4` ✅
- `NewsArticle` موجود ✅
- `BreadcrumbList` موجود ✅
- بلوك "آخر أخبار التصنيف" موجود في SSR ✅
- عدد الروابط الإجمالي في نسخة Googlebot: `28`
- عدد روابط المقالات الداخلية من نفس التصنيف: `8`

**نتيجة القياس الحي على نفس المقال كزائر عادي:**

- HTTP `200`
- بقي على نسخة SPA العادية (`next=false`) ✅
- لا يظهر بلوك SSR في HTML الأولي، وهذا مقصود لأن البشر يرون SPA بعد hydration.
- لم يتم تغيير تصميم SPA للبشر.

**نتيجة القياس الحي على الرئيسية كـ Googlebot بعد إصلاح `70fabc6`:**

- `title`: `سبق الذكية - صحيفة سبق الإلكترونية` ✅
- `robots`: `index, follow` ✅
- JSON-LD count = `2` ✅
- `WebSite` موجود ✅
- `ItemList` موجود ✅

**نتيجة القياس الحي على التصنيف كـ Googlebot بعد إصلاح `70fabc6`:**

- `robots`: `index, follow` ✅
- `CollectionPage` موجود ✅
- `ItemList` موجود ✅
- `BreadcrumbList` موجود ✅
- `h1=1` ✅

## 5) الأسباب الجذرية + أماكن الإصلاح الدقيقة

| المشكلة | السبب | الإصلاح |
|--------|------|---------|
| `… \| سبق \| سبق` | `web-next/app/layout.tsx` فيه `template: "%s \| سبق"`، وعنوان الـ bundle ينتهي أصلاً بـ `\| سبق` | في `web-next/lib/articleMetadata.ts` رجّع `title: { absolute: m.title }` بدل `title: m.title` |
| لا robots meta للرئيسية/التصنيف | `generateMetadata` لا يضبط `robots` فيهما | أضِف `robots: { index: true, follow: true }` في `web-next/app/page.tsx` و`web-next/app/category/[slug]/page.tsx` |
| JSON-LD=0 للرئيسية/التصنيف | لم نحقن schema في نسخة SSR لهما | أضِف `WebSite`+`ItemList` للرئيسية، و`CollectionPage`/`ItemList` للتصنيف (script ld+json داخل المكوّن) |
| لا BreadcrumbList | غير منفّذ | أضِف `BreadcrumbList` في `web-next/components/ArticleView.tsx` وصفحة التصنيف |
| عنوان الرئيسية مجرّد "سبق" | `default` فقط | اجعل عنوان/وصف الرئيسية ذا معنى ومطابقاً لما يراه المستخدم |

## 6) ممنوعات صارمة

1. **لا تغيّر تصميم SPA للبشر** — شرط أساسي من المالك (يجب أن يبقى حرفياً).
2. **لا تُقدّم `web-next` للبشر** ولا تلغِ Dynamic Rendering.
3. **لا تدمج مفاتيح الكاش** بين البوت والبشر (`__v=b/__v=h`).
4. تعديلات `server/routes/edgeMeta.ts` و`shared/schema.ts` **إضافية فقط**.
5. لا تلمس نداءات النشر `notifySearchEngines()` في `server/routes.ts` (≈ أسطر 6966, 7617, 7909, 15421, 15626) ولا حارس `no-store`/noindex.
6. الفهرسة الفورية تعمل عبر **Google Indexing API** (`server/indexNow.ts`)؛ تشخيصها الحيّ على `GET /api/edge/indexing-status`.

## 7) أولويات التحسين

### منجزة

1. إزالة تكرار `| سبق | سبق`.
2. إضافة `robots meta` للرئيسية والتصنيف في SSR.
3. ضمان JSON-LD في نسخة Googlebot للرئيسية (`WebSite`+`ItemList`) والتصنيف (`CollectionPage`/`ItemList`).
4. إضافة `BreadcrumbList` للمقال والتصنيف.
5. إضافة روابط داخلية SSR للمقال عبر `categoryLatest` من نفس التصنيف.

### الأولوية التالية

1. مراقبة GSC لمدة 48-72 ساعة بعد النشر:
   - `Duplicate, Google chose different canonical`
   - `Crawled - currently not indexed`
   - `Discovered - currently not indexed`
   - ظهور/تحسن Breadcrumb في أدوات Rich Results.
2. قياس TTFB لمسار المقال كـ Googlebot بعد إضافة `categoryLatest` على أكثر من تصنيف.
3. قياس روابط الوسوم والكاتب في SSR بعد deploy commit `3a8cab8`:
   - لا توجد روابط من `seo.keywords` الحرّة.
   - روابط الوسوم تأتي فقط من `articleTags -> tags`.
   - رابط الكاتب يظهر فقط عند وجود `reporterId`.
4. بعد استقرار القياسات: الانتقال إلى Topic Hubs للكلمات المتكررة (الطقس، الحج، التعليم، الوظائف، حساب المواطن، الرياضة السعودية).

## 8) كيف تتحقق بعد أي تعديل

```bash
GB="Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
# نسخة Googlebot (SSR)
curl -s -A "$GB" "https://sabq.org/article/<slug>?cb=$RANDOM" | grep -o '<title>[^<]*</title>'
curl -s -A "$GB" "https://sabq.org/article/<slug>?cb=$RANDOM" | grep -c 'BreadcrumbList'
curl -s -A "$GB" "https://sabq.org/article/<slug>?cb=$RANDOM" | grep -o 'href="/article/[^"]*"' | sort -u | wc -l
# نسخة المستخدم (SPA الأصلي) — يجب أن يبقى main-content=0 وبلا تغيير تصميم
curl -s "https://sabq.org/article/<slug>?cb=$RANDOM" | grep -c 'id="main-content"'
# تشخيص Google Indexing API (بلا أسرار)
curl -s "https://api.sabq.org/api/edge/indexing-status" | python3 -m json.tool
```

> القاعدة الذهبية للتحقق: **المحتوى الجوهري (العنوان، الوصف، الرابط القانوني، الأخبار) يجب أن يتطابق بين النسختين** — الاختلاف المسموح هو التصميم/الحجم فقط، لا الإشارات.

## 9) سجل التنفيذ المختصر

### Commit `70fabc6`

الهدف: توحيد إشارات SSR الأساسية.

الملفات:

- `web-next/lib/articleMetadata.ts`
- `web-next/app/page.tsx`
- `web-next/app/category/[slug]/page.tsx`
- `web-next/components/ArticleView.tsx`

التغييرات:

- جعل عنوان المقال `absolute` لمنع تكرار لاحقة `| سبق`.
- إضافة `robots: { index: true, follow: true }` للرئيسية والتصنيف.
- إضافة JSON-LD للرئيسية: `WebSite` + `ItemList`.
- إضافة JSON-LD للتصنيف: `CollectionPage` + `ItemList` + `BreadcrumbList`.
- إضافة `BreadcrumbList` للمقال.
- تأمين JSON-LD من كسر وسم `<script>` عبر escape لـ `<`, `>`, `&`.

التحقق المحلي:

- `npm run build` داخل `web-next` نجح.

التحقق الحي:

- المقال: `NewsArticle` + `BreadcrumbList` + عنوان نظيف.
- الرئيسية: `robots` + `WebSite` + `ItemList`.

### Commit `49ddbd3`

الهدف: تقوية الروابط الداخلية في نسخة SSR للمقال دون اختراع محتوى لا يراه المستخدم.

الملفات:

- `server/routes/edgeMeta.ts`
- `web-next/lib/seoBundle.ts`
- `web-next/components/ArticleView.tsx`

التغييرات:

- إضافة `categoryLatest` بشكل additive في `/api/articles/:slug/seo-bundle`.
- الاستعلام محدود بـ 8 مقالات:
  - نفس التصنيف
  - `status='published'`
  - يستبعد المقال الحالي
  - يرتب بالأحدث
  - الروابط canonical بصيغة `/article/<englishSlug أو slug>`
- عرض بلوك "آخر أخبار التصنيف" في `ArticleView.tsx`.
- لم تتم إضافة روابط tags أو الكاتب حتى لا نصنع soft-404 أو مصائد زحف.
- لم تتم إضافة `ItemList` إضافي للمقالات ذات الصلة؛ القيمة هنا في روابط `<a href>` نفسها.

التحقق المحلي:

- `npm run check` من جذر المشروع نجح.
- `npm run build` داخل `web-next` نجح.

التحقق الحي على `https://sabq.org/article/qzVBFf1`:

- Googlebot:
  - HTTP `200`
  - TTFB ≈ `0.85s`
  - إجمالي الروابط `28`
  - روابط المقالات الداخلية `8`
  - `BreadcrumbList` موجود
  - لا يوجد تكرار في العنوان
- الزائر العادي:
  - بقي على SPA الأصلي، بلا تغيير تصميم.

### Commit `f093693`

الهدف: إغلاق خطر الصفحات الرقيقة في `/keyword/*` و`/reporter/*`.

الملف:

- `server/routes/edgeMeta.ts`

التغييرات:

- إضافة handlers لمسارات:
  - `/keyword/:slug`
  - `/en/keyword/:slug`
  - `/reporter/:idOrSlug`
  - `/en/reporter/:idOrSlug`
- صفحة keyword لا تصبح `index,follow` إلا إذا كان الوسم موجوداً ومرتبطاً بمقال منشور.
- صفحة reporter لا تصبح `index,follow` إلا إذا كان المستخدم موجوداً.
- الصفحات غير الموجودة ترجع `noindex, follow` مع title/canonical خاصين بالمسار.

التحقق الحي:

- `/keyword/zzz-no-such-keyword-codex-check`:
  - `robots: noindex, follow`
  - title خاص بالكلمة
  - canonical خاص بالمسار
- `/reporter/zzz-no-such-reporter-codex-check`:
  - `robots: noindex, follow`
  - title: `كاتب — سبق`
  - canonical خاص بالمسار

### Commit `3a8cab8`

الهدف: منع تمرير قوة الروابط الداخلية إلى صفحات keyword غير مؤهلة.

الملفات:

- `server/routes/edgeMeta.ts`
- `web-next/lib/seoBundle.ts`
- `web-next/components/ArticleView.tsx`

التغييرات:

- إضافة `articleTags` في `/api/articles/:slug/seo-bundle` من العلاقة الحقيقية `articleTags -> tags`.
- الوسوم المرتبطة في SSR تُفلتر إلى:
  - المقال الحالي منشور.
  - الوسم `active`.
  - الرابط بصيغة `/keyword/<tag.slug>`.
- إضافة `reporterHref` فقط عند وجود `reporterId` واسم مراسل فعلي.
- عرض الوسوم الحقيقية في SSR داخل صفحة المقال.
- عدم استخدام `seo.keywords` الحرّة كروابط نهائياً.

التحقق المحلي:

- `npm run check` من جذر المشروع نجح.
- `npm run build` داخل `web-next` نجح.

### Commit `0a2f730`

الهدف: منع فهرسة المقالات غير المنشورة في نسخة SSR/edge.

الملف:

- `server/routes/edgeMeta.ts`

المشكلة:

- `fetchArArticle` كان يرجع المقال بأي حالة (`published`, `archived`, `draft`, `scheduled`) لأنه يبحث بالـ slug فقط.
- `articleMetaPayload` كان يحسب robots حسب عمر المقال فقط، وليس حسب `status`.
- النتيجة الحية التي كشفت الخطأ: مقال `archived` على `/article/kpvgA0V` كان يظهر لـ Googlebot كـ `index, follow`.

الإصلاح:

- تمرير `status` إلى `articleMetaPayload`.
- تمرير `status` من جداول المقالات الثلاثة: عربي/إنجليزي/أردو.
- قاعدة robots أصبحت:
  - `status === "published"` ⇒ منطق الفهرسة المعتاد حسب العمر.
  - أي حالة أخرى أو حالة مفقودة ⇒ `noindex, follow`.

التحقق المطلوب بعد النشر:

- `/article/kpvgA0V` كـ Googlebot يجب أن يرجع `noindex, follow`.
- مقال منشور حديث مثل `/article/qzVBFf1` يجب أن يبقى `index, follow, max-image-preview:large`.

### Commit `e476155`

الهدف: بدء معالجة فجوة الوسوم الحقيقية عبر Topic Hubs مستهدفة، وليس ترحيل `seo.keywords` كلها.

الملفات:

- `shared/seo/topicHubs.ts`
- `scripts/seo-topic-hubs-backfill.ts`
- `server/routes.ts`
- `server/routes/edgeMeta.ts`

التغييرات:

- إضافة قائمة hubs استراتيجية أولية:
  - الطقس
  - الحج
  - التعليم
  - الوظائف
  - حساب المواطن
  - الرياضة السعودية
  - المرور
  - الصحة
  - الاقتصاد السعودي
  - الذكاء الاصطناعي
- إضافة سكربت dry-run افتراضي يقترح روابط `articleTags` للمقالات العربية المنشورة فقط.
- السكربت لا يكتب إلا مع `--apply`، ويرفض الكتابة على DATABASE_URL يبدو إنتاجياً دون `--i-understand`.
- تعديل `/api/keyword/:keyword` ليقرأ من `articleTags -> tags` للمقالات المنشورة فقط، بدلاً من `seo.keywords`.
- تعديل robots لصفحات `/keyword/:slug`:
  - hubs الاستراتيجية تستخدم `minPublishedArticles` من المواصفات.
  - باقي الوسوم تحتاج 3 مقالات منشورة على الأقل قبل `index`.

أوامر التشغيل:

```bash
# Dry-run فقط، بلا كتابة
npx tsx scripts/seo-topic-hubs-backfill.ts --limit=1000 --days=90

# Dry-run لهب واحد
npx tsx scripts/seo-topic-hubs-backfill.ts --hub=weather --limit=1000 --days=90

# كتابة فعلية بعد مراجعة التقرير ووجود نسخة احتياطية
npx tsx scripts/seo-topic-hubs-backfill.ts --apply --i-understand --limit=1000 --days=90
```

التحقق المحلي:

- `npm run check` من جذر المشروع نجح.
- `npm run build` داخل `web-next` نجح.

ملاحظة تشغيلية:

- تعذر تشغيل dry-run من جلسة Codex الحالية لأن `DATABASE_URL`/`NEON_DATABASE_URL` غير متوفرين في البيئة المحلية. شغّله من بيئة تملك اتصال قاعدة البيانات، وراجع التقرير قبل `--apply`.

### Commit pending

الهدف: تشديد dry-run للـ Topic Hubs بعد أول تقرير فعلي.

المشكلة التي كشفها dry-run:

- `minScore=1` أنتج false positives كثيرة، مثل ربط مقالات لا علاقة لها بالحج بسبب كلمة قصيرة، أو ربط `حساب المواطن` بسبب كلمات عامة مثل `الدعم`.
- السكربت كان يستورد `server/db` مباشرة، ما شغّل Startup Maintenance حتى في dry-run. هذا غير مقبول لسلوك "لا كتابة".

الإصلاح:

- السكربت يضبط `SKIP_DB_MAINTENANCE=true` قبل استيراد `server/db`.
- المطابقة صارت على حدود كلمات/عبارات كاملة، لا `includes` داخل الكلمات.
- إضافة `minScore` لكل hub.
- حذف إشارات عامة سببت ضوضاء:
  - `الدعم` و`الأهلية` من حساب المواطن.
  - `النقل` من المرور.
  - `الاتحاد` وحدها من الرياضة السعودية.
  - `تقنية` و`البيانات` وحدها من الذكاء الاصطناعي.

التحقق:

- `npm run check` نجح.
- `npm run build` داخل `web-next` نجح.

### Commit pending

الهدف: منع تطبيق backfill لكل الـ hubs دفعة واحدة.

سبب التغيير:

- تقرير dry-run الثالث أعطى `607` روابط مقترحة، وهذا رقم كبير لا يطبّق جماعياً.
- بعض hubs مثل `hajj` موسمية وواسعة جداً، وبعض hubs تحتاج مراجعة عينات أكثر.

الإصلاح:

- `--apply` صار يتطلب `--hub=<key>` صراحة.
- لا يمكن تشغيل `--apply` على كل hubs مرة واحدة.

أوامر آمنة:

```bash
# مراجعة hub واحد
npx tsx scripts/seo-topic-hubs-backfill.ts --hub=jobs --limit=1000 --days=90

# تطبيق hub واحد بعد مراجعة عيناته
npx tsx scripts/seo-topic-hubs-backfill.ts --hub=jobs --apply --i-understand --limit=1000 --days=90
```

لا تستخدم:

```bash
npx tsx scripts/seo-topic-hubs-backfill.ts --apply --i-understand --limit=1000 --days=90
```

### Commit pending

الهدف: جعل صفحات `/keyword/:slug` المؤهلة تحتوي روابط مقالات قابلة للزحف في HTML الأولي.

سبب التغيير:

- بعد تطبيق hub `الوظائف` أصبحت الصفحة `index,follow`، لكن HTML الذي يراه Googlebot لم يكن يحتوي روابط مقالات.
- `/api/keyword/الوظائف` كان يرجع 6 مقالات، لكن الـ edge meta لم يحقن `semanticHtml` للوسوم.

الإصلاح:

- عند تحقق الحد الأدنى للمقالات المنشورة، `buildKeywordMeta` يجلب أحدث 20 مقالاً منشوراً للوسم.
- يحقن `semanticHtml` عبر `buildLinkListHtml` بنفس نمط الرئيسية والتصنيفات.
- النتيجة المتوقعة: `/keyword/الوظائف` كـ Googlebot يبقى `index,follow` ويظهر فيه روابط `/article/...`.

أعد تشغيل dry-run بعد نشر هذا التصحيح:

```bash
npx tsx scripts/seo-topic-hubs-backfill.ts --limit=1000 --days=90
```

### Commit pending

الهدف: تشديد إضافي بعد تقرير dry-run الثاني.

المشكلة:

- بعض hubs ما زالت تلتقط مقالات بعيدة لأنها تحقق `minScore` من كلمات عامة داخل نفس المجال.
- عداد `proposed new links` كان لا يحتسب روابط hubs التي لا يوجد لها tag بعد، فيظهر الرقم العام أقل من مجموع تفاصيل hubs.

الإصلاح:

- إضافة `anchorAny` لكل hub: لا يكفي تحقق كلمات مساعدة؛ يجب وجود كلمة ارتكاز قوية مثل `الطقس` أو `الأرصاد` للطقس، و`الحج` أو `ضيوف الرحمن` للحج.
- تقرير dry-run صار يفرّق بين:
  - tag موجود.
  - tag مفقود وسيُنشأ عند `--apply`.
  - إجمالي الروابط المقترحة فعلياً بما فيها روابط tags المفقودة.

التحقق:

- `npm run check` نجح.
- `npm run build` داخل `web-next` نجح.
