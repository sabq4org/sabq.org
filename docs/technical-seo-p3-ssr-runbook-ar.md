# P3 SSR — Runbook التشغيل والتحقق

مرجع تشغيلي لإطلاق ومراقبة تطبيق Next.js (`web-next/`) الذي يقدّم SSR لمسارات
المحتوى العام. مكمّل لخطة [technical-seo-p3-ssr-plan-ar.md](technical-seo-p3-ssr-plan-ar.md).

> الإطلاق **قابل للعكس فوراً**: كل المنطق خلف `SSR_ROUTES=on`. لإيقافه فوراً اضبط
> `SSR_ROUTES=off` في Cloudflare Pages → الموقع يعود 100% إلى SPA.

---

## ما تم تنفيذه في الكود (PR)

- **الواجهة:** `web-next/` — تطبيق Next.js App Router. المسارات:
  `/`، `/article/[slug]`، `/category/[slug]`، `/en/article/[slug]`، `/ur/article/[slug]`.
  كلها ISR (`revalidate=60`) + `<main role="main">` بالنص الكامل + صورة LCP في أول
  بايت + JSON-LD مطابق لمسار الـ edge/Express.
- **الـ API (additive):** في [server/routes/edgeMeta.ts](../server/routes/edgeMeta.ts):
  - `GET /api/articles/:slug/seo-bundle?lang=ar|en|ur`
  - `GET /api/categories/:slug/seo-bundle`
  - `GET /api/edge/home-bundle`
  تعيد استخدام نفس `buildNewsArticleSchemaExtras` ودوال جلب المقالات → بيانات
  مهيكلة متطابقة عبر كل الأسطح.
- **التوجيه (edge):** [functions/_middleware.js](../functions/_middleware.js) —
  عند `SSR_ROUTES=on` + `NEXT_ORIGIN` تُمرَّر مسارات SSR إلى Next، وتتخطّى حقن
  `EDGE_SEO` (لا حقن مزدوج)، مع إبقاء slug-redirect والـ edge cache.

---

## تسلسل الإطلاق (Cutover)

1. **انشر الـ API** (Railway، الخدمة الحالية) ببنود الـ bundle الجديدة. تحقق:
   ```bash
   curl -fsS https://api.sabq.org/api/articles/<englishSlug>/seo-bundle | jq '.title, .jsonLd."@type"'
   ```
2. **انشر `web-next`** كخدمة Railway ثانية (Dockerfile). متغيرات البيئة:
   `API_ORIGIN=https://api.sabq.org`، `PUBLIC_SITE_URL=https://sabq.org`.
   اربط نطاقاً فرعياً (مثل `next.sabq.org`). تحقق مباشرةً من الأصل:
   ```bash
   curl -fsS https://next.sabq.org/article/<englishSlug> | grep -c 'id="main-content"'
   ```
3. **فعّل التوجيه في Cloudflare Pages** (Production env):
   `NEXT_ORIGIN=https://next.sabq.org` ثم `SSR_ROUTES=on`. أعد النشر إن لزم.
4. **شغّل سكربت التحقق:**
   ```bash
   scripts/verify-ssr.sh <englishSlug> saudi https://sabq.org https://api.sabq.org
   ```

---

## اختبار المرحلة 3 (تحقق فوري بعد الإطلاق)

- [ ] `scripts/verify-ssr.sh` يمرّ بكل الفحوص الصلبة.
- [ ] **Google Search Console → URL Inspection** لمقالة SSR: «View crawled page»
      يُظهر نصاً كاملاً داخل `<main>` (لا `#root` فارغ). «Test Live URL» أخضر.
- [ ] **Rich Results Test** على نفس الرابط: NewsArticle صالح (headline,
      datePublished, image, articleBody, wordCount).
- [ ] **PageSpeed/Lighthouse** (Mobile) للمقالة: LCP يتحسّن (الصورة قابلة
      للاكتشاف في HTML الأولي)، و«Request is discoverable in initial document»
      صار أخضر.
- [ ] `curl -I` على رابط مقالة: `x-edge-cache: HIT` في الطلب الثاني، وترويسة
      `cache-control: public, s-maxage=...`.
- [ ] **لا حقن مزدوج:** لا يظهر تعليق `sabq-edge-meta-injected` في HTML مسارات
      SSR (السكربت يفحص ذلك)، و`<title>` واحد فقط.
- [ ] مسار عربي بـ slug عربي/قديم ما زال 301 إلى `/article/<englishSlug>`.

---

## المرحلة 4 — المراقبة (14 يوماً) والإيقاف التدريجي

### مراقبة يومية في GSC
- [ ] **Crawl stats:** متوسط زمن استجابة المقالات ينخفض (هدف < 200ms من الأصل).
- [ ] **Page indexing:** لا ارتفاع في «Crawled - currently not indexed» أو
      «Duplicate without user-selected canonical» على مسارات SSR.
- [ ] **Core Web Vitals (الميداني/CrUX):** يبدأ LCP/INP بالتحسّن تدريجياً خلال
      نافذة الـ 28 يوماً (لا تتوقّع تغيّراً فورياً — البيانات تاريخية).
- [ ] **Indexing delay للعاجل:** < 15 دقيقة (مع Google Indexing API الحالي).

### بوابات الأمان (rollback)
- ارتفاع 5xx من `next.sabq.org`، أو هبوط مفاجئ في الـ impressions، أو ظهور حقن
  مزدوج → اضبط `SSR_ROUTES=off` فوراً (يعود لـ SPA دون نشر).

### الإيقاف التدريجي ونقل المسارات الثانوية
- [ ] بعد استقرار 14 يوماً، أضف مسارات Next للأسطح الأعلى أولوية في GSC
      (رأي `/opinion`, `/omq`, `/en/category`, `/ur/category`) ثم وسّع
      `isSsrPath()` في `_middleware.js` لتشملها.
- [ ] **قاعدة «مسار واحد»:** أي مسار انتقل إلى SSR لا تُضاف له ميزات جديدة في
      `client/` — التطوير يتم في `web-next/` فقط. وثّق ذلك في وصف الـ PR.
- [ ] لا تحذف `client/` قبل اكتمال نقل كل المسارات الحرجة.

---

## مقاييس النجاح (تذكير)

| المقياس | قبل | هدف بعد SSR |
|---------|-----|-------------|
| TTFB مقالة (أصل SSR) | ~1500ms | < 200ms |
| «View crawled page» | SPA فارغ + JS | نص كامل في `<main>` |
| LCP مخبري (مقالة) | يعتمد على JS | تحسّن 20%+ |
| Indexing delay (عاجل) | ساعات | < 15 دقيقة |
