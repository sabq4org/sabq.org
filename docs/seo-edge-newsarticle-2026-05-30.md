# استرجاع إشارات SEO لمسار الحافة — تنفيذ 2026-05-30

## الخلفية (السبب الجذري)
الإنتاج (`sabq.org`) يُخدَم عبر **Cloudflare Worker → Vercel** ويستهلك بيانات SEO من
`/api/edge/seo-meta` ([edgeMeta.ts](../server/routes/edgeMeta.ts))، **لا** عبر
`seoInjector.ts` (مسار Express). فحص حيّ لمقال أثبت أن الإنتاج كان يُصدِر رؤوساً مبتورة:
بلا `NewsArticle` JSON-LD، بلا `hreflang`، بلا توقيت نشر/تعديل، بلا `og:locale/site_name`.
أي أن كل إشارات Google News المبنية في `seoInjector.ts` لم تكن تصل إلى الزواحف.

## ما نُفِّذ (3 commits على فرع `feat/seo-edge-newsarticle-p0`)

### P0 — استرجاع البيانات المهيكلة (`cb20adb`)
- `edgeMeta.ts`: معالجات المقال (عربي/رأي/إنجليزي/أردي) تجلب المؤلف (reporter→author→brand)
  والقسم وتاريخ التعديل والكلمات المفتاحية، وتبني عبر `articleMetaPayload()`:
  `NewsArticle` JSON-LD + `datePublished` + `dateModified` (clamp 30/7 يوم) + `inLanguage`
  + `publisher`/logo + سلسلة `hreflang` + حقول `og`/`twitter` كاملة.
- `frontend-edge-worker.js`: `buildMetaBlock` يُصدِر JSON-LD (بتأمين `</script>`) + `article:*`
  + `og:locale/site_name/image dimensions` + `twitter:site` + روابط `hreflang`، ويزيل
  أي وسوم `article:`/`hreflang` قديمة قبل الحقن.

### P1 — حداثة الأخبار + اكتشاف الأقسام (`a17ba88`)
- `computeArticleRobots()`: مقالات > 30 يوماً → `googlebot-news=noindex` (تبقى في بحث الويب)،
  و > سنة → `noarchive` + رفع حدود المقتطفات.
- الرئيسية تحقن الآن كتلة "أقسام سبق" (روابط `/category/` قابلة للزحف — كانت **صفراً**)
  بجانب "أحدث الأخبار".

### P2 — إثراء خرائط الموقع (`0807c0d`)
- `<image:image>` لكل مقال في خرائط المقالات (فهرسة الصور + المصغّرات).
- `<lastmod>` لأبناء فهرس `/sitemap.xml` المتغيّرة (استعلام `MAX(published_at)` واحد).

**تحقّق محلي:** `tsc` نظيف، اختبارات وحدة على الدوال الفعلية للـ Worker (15/15).

---

## التحقق بعد النشر (إلزامي)
بعد دمج الفرع ونشر **الـ Worker** (`wrangler`) و**الـ backend** (Railway):

```bash
# 1) المقال يحوي NewsArticle + hreflang + توقيت النشر الآن:
curl -s https://sabq.org/article/<slug> | grep -c 'application/ld+json'      # ≥ 2
curl -s https://sabq.org/article/<slug> | grep -o '"@type":"NewsArticle"'    # موجود
curl -s https://sabq.org/article/<slug> | grep -oc 'rel="alternate" hreflang' # ≥ 1
curl -s https://sabq.org/article/<slug> | grep -o 'article:published_time'   # موجود
# 2) خريطة المقالات فيها صور:
curl -s https://sabq.org/sitemap-articles-1.xml | grep -c 'image:image'      # > 0
# 3) فهرس الخرائط فيه lastmod:
curl -s https://sabq.org/sitemap.xml | grep -c '<lastmod>'                    # > 0
```
ثم: **اختبار النتائج الغنية من Google** على رابط مقال → يجب أن يمرّ `NewsArticle` بلا أخطاء.

---

## قرار مؤجَّل: تخزين HTML على الحافة (لا تُنفَّذ الآن)
الـ Worker يفرض `private, no-store` على كل HTML **عمداً** لمنع "الصفحة البيضاء بعد النشر"
(القالب القديم يشير إلى `/assets/index-<hash>.js` يدور بعد كل نشر من Vercite).

- نتيجة: **HTML طازج دائماً** → تأخّر الظهور في Google **ليس** مشكلة بيانات قديمة.
- تفعيل تخزين الحافة سيحسّن TTFB/كفاءة الزحف لكنه **يعيد خطر الصفحة البيضاء** ولا يعالج
  سرعة الفهرسة.
- **التوصية:** الإبقاء على `no-store`. إن صار حِمل الأصل مشكلة، الحل الآمن لاحقاً = تخزين HTML
  مُفتاحاً بـ asset-manifest hash مع تطهير عند النشر بعد جهوزية البناء (مشروع أكبر).

---

## روافع Google الحقيقية (تشغيلية — خارج الكود)
1. **Google News Publisher Center**: تأكيد تسجيل/اعتماد منشور `sabq.org` وربط الأقسام.
2. **Search Console**: تقديم `sitemap.xml` و`sitemap-news.xml`؛ مراقبة "اكتُشِفت – غير مفهرسة"،
   وإحصاءات الزحف (زمن الاستجابة)، وتقرير الأخبار.
3. مراقبة وسيط زمن أول ظهور (هدف: من 2–8 ساعات إلى < 60 دقيقة).
