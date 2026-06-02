# P3 — خطة التحول إلى Server-Side Rendering (SSR)

**التاريخ:** 2026-06-02  
**النطاق:** sabq.org (واجهة الويب) — الموبايل (iOS/Android) خارج النطاق  
**المدة المقدّرة:** 4–6 أسابيع (فريق 2–3 مطوّرين + مراجعة SEO أسبوعية)

---

## 1. لماذا SSR؟ (ما الذي لا يحله P1/P2)

بعد P1/P2 يحصل Googlebot على:

- ترويسات تخزين سريعة + JSON-LD كامل + إشعار Indexing API
- HTML مخفي (`semanticHtml`) + روابط اكتشاف في الرئيسية/الأقسام

لكن البنية الأساسية تبقى **SPA (React + Vite)**:

| المشكلة | الأثر على Google |
|---------|------------------|
| `#root` فارغ حتى يُشغَّل JavaScript | Two-pass indexing — تأخير ساعات/أيام |
| لا `<main role="main">` في HTML الأولي | صعوبة تحديد المحتوى الرئيسي |
| Discover/News يفضّل نصاً كاملاً في أول ~200ms | بطء ظهور عاجل رغم edge injection |

**SSR** = النص الكامل + العنوان + الوسوم في **أول بايت HTML** دون انتظار bundle الـ JS.

---

## 2. الوضع الحالي (Baseline)

```
المستخدم/البوت → Cloudflare Pages (sabq.org)
                 ├─ functions/_middleware.js (proxy + SEO inject + edge HTML cache)
                 ├─ index.html (قشرة SPA)
                 └─ api.sabq.org (Railway — API + edgeMeta + seoInjector legacy)

لوحة التحكم / المحرر → نفس SPA (مسارات noindex — لا تُخزَّن على CDN)
```

**ما يُعاد استخدامه في SSR (لا يُرمى):**

- `shared/schema.ts` — Drizzle
- `/api/*` و `/api/v1/*` — بدون تغيير عقد
- `server/routes/edgeMeta.ts` — منطق SEO يُستخرج كـ «SEO service» مشترك
- `server/utils/newsArticleSchema.ts` — JSON-LD
- `server/indexNow.ts` + `googleIndexingService` — إشعار عند النشر
- `server/services/contentInvalidation.ts` + `cloudflarePurge` — إبطال بعد النشر

---

## 3. خيارات المعمارية

| الخيار | الجهد | الفائدة | المخاطر |
|--------|-------|---------|---------|
| **A — تعزيز Edge فقط** (لا Next.js) | 1–2 أسبوع | متوسطة — `<main>` + نص أوضح في HTML | لا يلغي two-pass بالكامل |
| **B — Next.js App Router (مقالات + أقسام فقط)** | 4–6 أسابيع | عالية — مسار موصى به في التقرير | ازدواجية routing مؤقتة |
| **C — Next.js كامل** | 8–12 أسبوع | عالية جداً | مخاطرة على الجدول والإنتاج |

**التوصية:** **B** — SSR لمسارات المحتوى العام فقط؛ الإبقاء على SPA الحالية للوحة التحكم (`/dashboard`, `/admin`, …) عبر subdomain أو مسار منفصل.

---

## 4. خطة التنفيذ المرحلية (الخيار B)

### المرحلة 0 — تحضير (أسبوع 0)

- [ ] تثبيت نجاح P1/P2 في الإنتاج (GSC + `x-edge-cache: HIT` + Rich Results)
- [ ] Freeze على مسارات URL الحالية (`/article/:slug`, `/category/:slug`, …)
- [ ] مستودع/مجلد: `web-next/` أو فرع `feat/next-ssr` — لا يستبدل `client/` فوراً

### المرحلة 1 — أساس Next.js (أسبوع 1–2)

- [ ] `npx create-next-app` — App Router, TypeScript, Tailwind (مطابقة تصميم الويب الحالي تدريجياً)
- [ ] مشاركة الأنواع من `@shared/*` عبر workspace أو path alias
- [ ] `apiUrl()` — نفس منطق `client/src/lib/queryClient.ts` (PROXY vs DIRECT)
- [ ] صفحة واحدة SSR: `/article/[slug]` — `generateMetadata` + `fetch` من `/api/articles/:slug` أو endpoint خفيف جديد `GET /api/articles/:slug/seo-bundle`

**مخرجات المرحلة 1:**

```html
<main id="main-content" role="main">
  <h1>عنوان الخبر</h1>
  <article>…نص كامل…</article>
</main>
<script type="application/ld+json">…NewsArticle…</script>
```

### المرحلة 2 — توسيع الأسطح (أسبوع 2–3)

- [ ] `/category/[slug]`, `/`, `/en/article/[slug]`, `/ur/article/[slug]`
- [ ] إعادة استخدام `buildNewsArticleSchemaExtras` من حزمة مشتركة (`shared/seo` أو استيراد من server عبر build step)
- [ ] Hydration اختيارية: «جزء تفاعلي» (تعليقات، مشاركة) كـ client components فقط

### المرحلة 3 — النشر والتوجيه (أسبوع 3–4)

- [ ] **Cloudflare:** مسارات `/article/*` → Next deployment؛ الباقي → Pages SPA الحالية  
  (Workers Route أو `_routes.json` + مشروع Pages ثانٍ)
- [ ] أو: Next على Vercel + Cloudflare يوجّه المسارات — يتطلب مزامنة env
- [ ] إيقاف `EDGE_SEO` injection للمسارات التي أصبحت SSR (تجنّب حقن مزدوج)
- [ ] اختبار: Google Search Console URL Inspection + Mobile-Friendly + Lighthouse

### المرحلة 4 — إيقاف التدريجي (أسبوع 4–6)

- [ ] مراقبة Crawl stats + Core Web Vitals 14 يوماً
- [ ] نقل الصفحات الثانوية (رأي، omq، world-day) حسب الأولوية في GSC
- [ ] توثيق «مسار واحد» للمطورين — لا ميزات جديدة في `client/` لمسارات تم نقلها

---

## 5. عقد API مقترح لـ SSR (اختياري — يقلل round-trips)

```
GET /api/articles/:slug/seo-bundle
→ { title, excerpt, contentHtml, imageUrl, publishedAt, author, category, seo, jsonLd }
```

يجمع ما يقرأه `edgeMeta` اليوم في طلب واحد — يُستخدم من Next `generateMetadata` + الصفحة.

---

## 6. مقاييس النجاح (P3)

| المقياس | قبل | هدف بعد SSR |
|---------|-----|-------------|
| TTFB مقالة (Googlebot) | ~1500ms (P1 يخفضه edge) | < 200ms من origin SSR |
| «View crawled page» في GSC | SPA فارغ + JS | نص كامل في `<main>` |
| Indexing delay (عاجل) | ساعات | < 15 دقيقة (مع Indexing API) |
| LCP | يعتمد على JS | تحسّن 20%+ |

---

## 7. ما لا يُفعل في P3

- لا إعادة كتابة `server/routes.ts` (~37k سطر)
- لا تغيير auth الموبايل (`/api/v1`)
- لا حذف `client/` قبل اكتمال نقل المسارات الحرجة
- لا `db:push` إلا لحقول SEO جديدة (additive فقط)

---

## 8. علاقة P3 بـ P1/P2

```
P1 (edge cache) ──► يبقى مفيداً للـ SPA المتبقية + الأصول الثابتة
P2 (schema + Indexing API) ──► يُستهلك مباشرة في generateMetadata + notifySearchEngines
P3 (SSR) ──► يستبدل الحاجة لـ semanticHtml المخفي تدريجياً
```

**الترتيب الإلزامي:** نشر P1/P2 → قياس 7 أيام → بدء P3.

---

## 9. قرار المنتج لأبو محمد

| سؤال | خيار مقترح |
|------|------------|
| هل نبدأ P3 قبل استقرار P1؟ | **لا** |
| Next.js كامل أم مقالات فقط؟ | **مقالات + أقسام + رئيسية** |
| أين يُستضاف Next؟ | Cloudflare (Workers/Pages) أو Vercel — حسب فريق CDN |
| هل نوقف Capacitor `android/`؟ | لا — الموبايل native منفصل |

---

*آخر تحديث: 2026-06-02 | مرتبط بـ `docs/MIGRATION_CLOUDFLARE_PAGES.md` و `docs/technical-seo-runbook-ar.md`*
