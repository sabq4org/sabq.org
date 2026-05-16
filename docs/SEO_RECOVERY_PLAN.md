# خطة إنقاذ الفهرسة — sabq.org

> مرجع تنفيذي بناءً على تقرير Google Search Console بتاريخ 2026-05-16. يغطي ٤ مراحل، كل مرحلة لها commits محددة، KPIs قابلة للقياس، وأدوات التحقق. الوثيقة قابلة للتنفيذ بدون رجوع إلى استفسارات.

---

## ١. الوضع الحالي (Baseline)

### إيجابيات قائمة
- ✅ Discover يعطي **83%** من الزيارات (17.9M نقرة، 418M ظهور) → القناة الأهم
- ✅ Search: 3.5M نقرة، 42.2M ظهور، CTR 8.4% → فوق متوسط الصناعة (~3%)
- ✅ Sitemap index صحيح هيكلياً (1.3M URL عبر 73 child sitemap)
- ✅ Robots.txt صحيح (CF يضيف Content-Signals بدون حجب)
- ✅ Canonical يستعمل `englishSlug` (لا تعارض مع SEO injector)

### مشاكل حرجة
| # | المشكلة | الحجم | الأثر | السبب الجذري |
|---|---------|------|------|---------------|
| 1 | **5xx Server Errors** | 1,100 | فقدان مباشر للترتيب + فقدان ثقة Google | endpoints تنهار تحت ضغط (AI media proxy، ربما) |
| 2 | **404 pages** | 57,673 | crawl budget يُهدر + روابط خارجية ميّتة | محتوى محذوف بدون 410، slugs تغيرت بدون redirect |
| 3 | **Redirect chains** | 195,341 | crawl budget يُهدر | `/news/<arabic>` → `/article/<en>` قديمة |
| 4 | **Duplicate content** | 93,103 | تقسيم authority | `?utm_*` + Arabic slug + English slug لنفس المقال |
| 5 | **Canonical mismatch** | 38,619 | indexing tag confusion | seoInjector يعطي canonical مختلف عن المعروض |
| 6 | **Core Web Vitals** | 0 fast pages | mobile-first ranking سيّء | LCP > 2.5s، JS bundle ثقيل، CLS عالٍ |
| 7 | **noindex pages** | 3,628 | (مقصودة على الأرجح) | dashboard, profile, search — تأكد فقط |
| 8 | **Forbidden 403** | 996 | gated content يُحاول crawl | rate-limit aggressive أو CORS broken |
| 9 | **Soft 404** | 343 | empty pages تُرجع 200 | category صفحات بدون articles، tags خالية |
| 10 | **CTR "قطر"** | 534K ظهور / 20K نقرة = 3.7% | فرصة ضائعة | عنوان+meta للمقالات المتعلقة بقطر غير جذّاب |

---

## ٢. المرحلة الأولى — إيقاف النزيف (يوم-يومين)

**الهدف:** إصلاح أخطاء الخادم 5xx + إخراج صفحات 404 من sitemap حتى لا تستنزف crawl budget.

### 2.1 — تشخيص + إصلاح 5xx

**الخطوات:**
1. تفعيل تسجيل مفصّل في Railway للأسبوع القادم:
   ```ts
   // server/middleware/errorLogger.ts (new)
   app.use((err, req, res, next) => {
     console.error(`[5xx] ${req.method} ${req.originalUrl} — ${err.message}`, {
       stack: err.stack?.split("\n").slice(0, 5),
       userAgent: req.headers["user-agent"],
     });
     next(err);
   });
   ```
2. تجميع أنماط الـ 5xx بعد ٣ أيام:
   - `grep "\[5xx\]" railway-logs | awk '{print $3}' | sort | uniq -c | sort -rn | head`
3. الـ endpoints الأرجح للفشل (افتراض من معرفتي بالكود):
   - `/api/public-media/*` ← Replit sidecar (`127.0.0.1:1106`) لا يعمل على Railway
   - `/api/articles/:slug/ai-bullets` ← timeout على OpenAI أو rate limit
   - `/api/ai/insights/today` ← قد يفشل بسبب AI provider
   - `/api/objects/*` ← نفس مشكلة الـ sidecar

**Commit المتوقع:** `fix(reliability): error-log middleware + 5xx fallbacks for AI + public-media endpoints`

**KPI للقياس:** GSC → Pages → "Server error (5xx)" يجب أن ينخفض من 1,100 إلى < 100 خلال أسبوعين.

### 2.2 — تنظيف 404 من sitemap + إضافة 410 Gone

**المنطق:**
- 57K صفحة 404 = محذوفة أو slug تغيّر. Google يستمر يحاول crawlها لأنه يجدها في sitemap أو من روابط خارجية
- الحل: (أ) شيلها من sitemap (ب) ارجع 410 Gone بدل 404 ← Google يحذفها من index خلال ~7 أيام بدل أشهر

**التنفيذ:**
1. تعديل `server/routes.ts:26336` (`GET /sitemap.xml` chunks): إضافة فلتر `WHERE status NOT IN ('deleted', 'unpublished')`
2. إضافة 410 handler في seoInjector:
   ```ts
   // إذا الـ slug غير موجود في DB AND ليس في slugRedirect map → 410
   if (!article && !redirectTarget) {
     res.status(410).send(`<!DOCTYPE html>...410 Gone...`);
     return;
   }
   ```
3. تصدير قائمة الـ 404 من GSC (CSV):
   - GSC → Indexing → Pages → "Not found (404)" → Export
   - يحوي ~57K URL — يكفي script يفحصها ضد DB
4. سحب القائمة لتحليلها:
   - URLs لها مقابل في DB (slug تغيّر) → 301 redirect map
   - URLs بدون مقابل → ابقها 410

**Commit المتوقع:** 
- `fix(sitemap): exclude deleted/unpublished from sitemap chunks`
- `feat(seo): return 410 Gone for permanently-deleted articles`

**KPI:** GSC → "Not found (404)" ينخفض من 57K إلى < 5K خلال 4-6 أسابيع.

---

## ٣. المرحلة الثانية — استعادة authority (٣ أيام)

**الهدف:** حلّ مشاكل canonical + redirects + duplicates لاسترجاع ranking signals.

### 3.1 — Canonical strategy موحّد

**القاعدة الذهبية:** Canonical URL = `https://sabq.org/article/<englishSlug>` دائماً.

**الفحص الحالي:**
- ✅ seoInjector صحيح (canonical = englishSlug)
- ❓ edgeMeta.ts: canonical لكل route — صحيح
- ❓ المقالات بدون englishSlug → canonical يصير Arabic slug → duplicate مع English variant

**التنفيذ:**
1. Backfill `englishSlug` لكل المقالات بدون قيمة:
   ```sql
   -- scripts/seo-backfill-english-slugs.ts
   UPDATE articles 
   SET english_slug = generate_short_hash(id)
   WHERE english_slug IS NULL AND status = 'published';
   ```
2. تأكيد middleware: أي طلب على `/article/<arabic-slug>` → 301 redirect إلى `/article/<englishSlug>` (موجود في `slugRedirect.ts` — تأكد أنه يشتغل لكل مقال)
3. إصلاح alternate canonical (38K):
   - افحص لماذا canonical لا يطابق URL المعروض
   - أحد الأسباب: `?lang=en` يظهر بنفس canonical الأصلي

**Commit المتوقع:**
- `feat(seo): backfill englishSlug for legacy articles`
- `fix(seo): consistent canonical = /article/<englishSlug> across all formats`

**KPI:** "Alternate page with proper canonical tag" ينخفض من 38K إلى < 5K.

### 3.2 — معالجة 195K redirect chain

**التشخيص:** أغلبها `/news/<arabic-title>` قديمة. سبق كانت على هذا النمط، تم migration إلى `/article/<slug>`. Google لا يفهرس redirects.

**التنفيذ:**
1. خيار أ (الأبسط): اقبل الواقع — Google سيحذفها تدريجياً (months). فقط تأكد أن sitemap الحالي لا يحوي أي `/news/...`
2. خيار ب (أقوى): أرجع 410 Gone للـ `/news/*` بدل 301 — Google يحذفها أسرع
3. خيار ج (الأمثل): اجمع روابط `/news/` ذات backlinks خارجية قوية (من Ahrefs/Semrush)، احفظ لها 301 خاص، الباقي 410

**Commit المتوقع:**
- `feat(seo): legacy /news/ paths return 410 except whitelisted backlink-rich ones`

**KPI:** "Page with redirect" ينخفض من 195K إلى < 20K خلال 8-12 أسبوع.

### 3.3 — معالجة 93K duplicate

**أنماط متوقعة:**
- `?utm_source=...` ← canonical تجاهلها
- مقال بـ Arabic + English slug ← 301 موحّد على English
- Category صفحات مفلترة (`?sort=latest&page=2`) ← canonical للصفحة الأصلية أو noindex

**التنفيذ:**
```ts
// server/middleware/canonicalize.ts (new)
// 1. Strip utm_ params from canonical
// 2. Redirect ?utm_* to clean URL (302)
// 3. For paginated/filtered: rel="canonical" يشير للصفحة الأصلية
```

**Commit:** `fix(seo): canonicalize utm + paginated URLs`

**KPI:** "Duplicate" ينخفض من 93K إلى < 10K.

---

## ٤. المرحلة الثالثة — Core Web Vitals (أسبوع)

**الهدف:** من ٠ صفحة "سريعة" إلى > 60% خلال شهرين.

**الحالة الحالية المتوقعة (لكل صفحة):**
- LCP: ~3.5-4.5s (يجب < 2.5s)
- INP: ~250-400ms (يجب < 200ms)
- CLS: ~0.15-0.25 (يجب < 0.1)

### 4.1 — LCP (هدف < 2.5s على mobile)

| فرعية | الإجراء | المتوقع |
|------|---------|---------|
| Hero image | `<link rel="preload" as="image" fetchpriority="high">` + `loading="eager"` | -0.8s |
| Critical CSS | inline أول 12KB، lazy الباقي | -0.5s |
| Font | `<link rel="preload" as="font" crossorigin>` + `font-display: optional` | -0.4s |
| Server response | المرحلة 1 تحلها (5xx + connectivity) | -0.6s |
| **Total** | | **-2.3s** |

**Commit المتوقع:**
- `perf(lcp): preload hero + critical font + inline critical CSS`

### 4.2 — INP (هدف < 200ms)

- code-splitting أكبر للـ vendor chunks (موجود بالفعل لكن قابل للتحسين)
- defer كل non-critical JS (analytics, ads, comments) بـ `requestIdleCallback`
- استخدام `useDeferredValue` في React للـ search/filter

**Commit:** `perf(inp): defer non-critical JS + use deferred state for search`

### 4.3 — CLS (هدف < 0.1)

- كل `<img>` يحتاج `width` + `height` صريحة (يحجز المساحة قبل التحميل)
- ads slots لها min-height محدد
- font swap بـ font-display: optional (لا layout shift عند تبديل الخط)

**Commit:** `perf(cls): explicit dimensions for images + reserved ad slots`

**KPI:** GSC → Core Web Vitals → "Good" pages من 0 إلى > 50K خلال شهرين.

---

## ٥. المرحلة الرابعة — نمو مستدام (مستمر)

### 5.1 — CTR optimization

**أولوية: "قطر" (534K ظهور / 3.7% CTR)**:
- اصنع landing page `/topic/قطر` يجمع آخر أخبارها مع H1 جذّاب + meta description محرّكة
- في article meta، أضف "(آخر تحديث)" + emoji محايد إذا مقال جديد

**أدوات:**
- `npm install sharp` لتوليد OG images ديناميكية لكل مقال (موجود غالباً)

### 5.2 — Sitemap freshness

- أضف `<lastmod>` لكل URL في sitemap (موجود في الكود؟ تأكد)
- Ping IndexNow كل ساعة بآخر المقالات الجديدة:
  ```ts
  // server/jobs/indexnow-ping.ts
  cron("0 * * * *", async () => {
    const recent = await db.select(...).from(articles).where(gt(publishedAt, oneHourAgo));
    await fetch("https://www.bing.com/indexnow", { method: "POST", body: ... });
  });
  ```

### 5.3 — Structured data audit

افتح GSC → Enhancements → كل تقرير:
- Article structured data
- Breadcrumb
- News article (مهم لـ Google News + Discover)

تأكد لا يوجد warnings/errors.

### 5.4 — Discover optimization (الأهم! 83% من traffic)

Discover يعتمد على:
- **High-quality images** (1200x675 minimum، AVIF أفضل)
- **Strong title** (clear، not clickbait)
- **Freshness signal** (modified time + sitemap lastmod)
- **EAT signals** (author byline → موجود الآن مع reporter fix)

افحص top-10 articles في Discover (في التقرير) وحلّل ما يميّزها → كرّر النمط.

---

## ٦. الجدول الزمني المقترح

| الأسبوع | المرحلة | Deliverables |
|--------|--------|---------------|
| 1 | Phase 1 — 5xx + 404 | errorLogger، 410 handler، sitemap cleanup |
| 2 | Phase 2 — canonical + redirects + duplicates | backfill englishSlug، canonicalize middleware |
| 3-4 | Phase 3 — CWV | preload، critical CSS، defer JS، image dims |
| 5+ | Phase 4 — مستدام | IndexNow، CTR experiments، Discover optimization |

## ٧. مقاييس النجاح (KPIs)

تتبّع أسبوعياً في GSC:

| المقياس | الآن | الهدف 4w | الهدف 12w |
|---------|------|----------|-----------|
| Indexed pages | 545K | 700K (+28%) | 1.2M (+120%) |
| Not indexed | 1.65M | 1.2M (-27%) | 600K (-64%) |
| 5xx | 1,100 | 100 | < 50 |
| 404 | 57K | 20K | 5K |
| Core Web Vitals "Good" mobile | 0 | 15K | 80K |
| Total clicks (search) | 3.5M/3mo | +10% | +35% |
| Discover clicks | 17.9M/3mo | +5% | +20% |

## ٨. ما لا يجب فعله (Anti-patterns)

- ❌ **لا تحذف 195K redirects دفعة واحدة** — ستخسر backlink equity. اعمل audit أولاً
- ❌ **لا تضف noindex لجميع categories** — بعضها يستحق فهرسة (محليات، رياضة، إلخ)
- ❌ **لا تطلب فهرسة يدوية لـ > 10 URLs/يوم** — Google يعتبره spam
- ❌ **لا تغيّر URL structure الحالي** — أي تغيير = موجة 404 جديدة
- ❌ **لا تستخدم AI-generated content بدون مراجعة** — قد يقع تحت Helpful Content penalty

---

**مرجع آخر تحديث:** 2026-05-16 بعد قراءة تقرير GSC.
**صاحب الخطة:** Claude (مع Ali Alhazmi).
