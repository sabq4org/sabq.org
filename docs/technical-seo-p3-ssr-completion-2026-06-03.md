# توثيق إنجاز Technical SEO — المرحلة P3 (SSR) + ما بعدها

**التاريخ:** 2026-06-03
**النطاق:** sabq.org (أرشفة Google News & Discover + Core Web Vitals)
**يكمل:** `docs/technical-seo-implementation-2026-06-02.md` (P1 + P2)
**المرجع التشغيلي:** `docs/technical-seo-p3-ssr-runbook-ar.md`

---

## 1. الخلاصة التنفيذية (لأبو محمد)

بعد P1 (التخزين + TTFB) وP2 (JSON-LD + الأرشفة الفورية)، فعّلنا **P3: التصيير من الخادم (SSR)**
لمسارات المحتوى العامة عبر تطبيق Next.js على Railway خلف Cloudflare.

**النتيجة المُتحقَّق منها على الإنتاج:** الأخبار تظهر في Google بسرعة، والصفحة تصل
لـ Googlebot **بمحتوى كامل + JSON-LD من أول بايت** بدل قشرة JavaScript فارغة.

| النتيجة | قبل (SPA) | بعد (SSR) — مُتحقَّق |
|---------|-----------|---------------------|
| محتوى المقال في أول بايت | قشرة JS فارغة | HTML كامل + `<h1>` + `<main>` |
| البيانات المنظّمة | تُحقن بـ JS | JSON-LD في المصدر مباشرة |
| روابط داخلية قابلة للزحف (الرئيسية/الأقسام) | **0** | **30 رابط/صفحة** |
| حقن SEO مزدوج | محتمل | لا يوجد (علامة الحقن غائبة) |
| تخزين الحافة | — | `x-edge-cache: HIT` |

---

## 2. البنية بعد P3

```
المستخدم / Googlebot
   → Cloudflare Pages (functions/_middleware.js)
        ├─ مسارات SSR (/ , /article/* , /category/* , /en/article/* , /ur/article/*)
        │     → proxy إلى web-next (Next.js على Railway)  ← محتوى كامل من الخادم
        │     → تخزين الناتج على الحافة (Workers Cache API)
        └─ بقية المسارات
              → قشرة SPA + حقن SEO عبر /api/edge/seo-meta (مسار P1/P2)
   → api.sabq.org (Railway: API + seo-bundle + home-bundle + edge meta)
```

التبديل بين المسارين يتم عبر متغيّرات بيئة فقط (بدون فروع كود):
- `NEXT_ORIGIN` = أصل خدمة Next.js على Railway.
- `SSR_ROUTES=on` = تفعيل تحويل مسارات المحتوى إلى SSR.

عند إيقاف `SSR_ROUTES`، يعود كل شيء فوراً إلى مسار P1/P2 (قابلية تراجع لحظية).

---

## 3. ما نُفّذ (P3)

### 3.1 تطبيق SSR جديد — `web-next/` (Next.js App Router)
- صفحات: `/`، `/article/[slug]`، `/category/[slug]`، ومرايا `en/` و`ur/` للمقالات.
- ISR (`revalidate = 60`) — تصيير مُخزّن يُجدَّد دورياً.
- `generateMetadata` يصيّر `<head>` (عنوان، OG، canonical) من الخادم.
- يحقن نص المقال + JSON-LD عبر `dangerouslySetInnerHTML` (محتوى مُعقّم من الـ API).
- صورة LCP تُصيّر من الخادم بـ `fetchpriority="high"`.
- نظام التصميم (ألوان/خطوط) مطابق للويب الحالي.

### 3.2 نقاط API تجميعية (إضافية فقط — `server/routes/edgeMeta.ts`)
| Endpoint | الغرض |
|----------|--------|
| `GET /api/articles/:slug/seo-bundle` | حزمة مقال كاملة (meta + contentHtml + JSON-LD) لـ ar/en/ur |
| `GET /api/categories/:slug/seo-bundle` | تفاصيل القسم + قائمة مقالاته |
| `GET /api/edge/home-bundle` | أحدث المقالات + الأقسام للرئيسية |

كلها **إضافية** لا تمسّ نقاطاً قائمة — لا كسر للويب/الموبايل.

### 3.3 توجيه الحافة — `functions/_middleware.js`
- `isSsrPath()` يطابق مسارات SSR.
- عند `SSR_ROUTES=on` + مسار SSR → proxy إلى `NEXT_ORIGIN` + تخزين على الحافة،
  مع **تخطّي حقن SEO** (تجنّب الحقن المزدوج).

### 3.4 النشر والتحقق
- `web-next/Dockerfile` + `web-next/railway.json` — خدمة Railway مستقلة.
- `scripts/verify-ssr.sh` — فحص آلي (محتوى + JSON-LD + غياب الحقن المزدوج + الكاش).

---

## 4. نتائج التحقق (إنتاج — 2026-06-03)

`scripts/verify-ssr.sh qzVBFf1 saudi` → **كل الفحوصات نجحت ✅**

```
▶ API bundle endpoints      → article/category/home: ✅
▶ SSR HTML أول بايت         → <main> ✅ , <h1> ✅ , JSON-LD ✅
                              لا حقن مزدوج ✅ , <title> واحد ✅
▶ Edge cache                → x-edge-cache: HIT ✅
▶ Category + home SSR       → <main> حاضر ✅
```

روابط داخلية حقيقية (تحقُّق مباشر):
```
/category/saudi (SSR) → 30 × <a href="/article/...">
/            (SSR)    → 30 × <a href="/article/...">
/categories  (SPA)    → 0   (لا روابط — صفحة محورية ما زالت SPA)
```

---

## 5. تشخيص «صفحة الإحالة: لم يُرصد أي صفحات» (GSC)

**العَرَض:** مقالات مفهرسة بنجاح، لكن فحص URL في Search Console يُظهر في قسم «الإحالة»:
«حدث خطأ مؤقت أثناء الزحف للصفحة المعالِجة» + «صفحة الإحالة: لم يُرصد أي صفحات».

**التشخيص (مُتحقَّق):** كل البيانات سليمة — الخريطة 200، المقالة داخل `sitemap-news.xml`،
Googlebot يصل بـ 200 بلا إعادة توجيه، robots يسمح. السبب الجذري **بنيوي من SPA القديم**:
الروابط الداخلية كانت تُبنى بـ JavaScript فلا يراها Googlebot في الـ HTML، فاكتشف المقالات
**عبر الخريطة فقط** ولم يسجّل «صفحة إحالة» (رابط داخلي مُشير).

**الإصلاح:** SSR على الرئيسية + الأقسام صار يُخرج 30 رابطاً حقيقياً/صفحة. مع إعادة زحف
Google، ستمتلئ «صفحة الإحالة» وتختفي رسالة «الخطأ المؤقت» تدريجياً — تحسّن تلقائي.

---

## 6. تحسين صفحة الأقسام `/categories` (UX/أداء)

`client/src/pages/CategoriesListPage.tsx` (commit `ab894fc`):
- **إزالة صور الأقسام** (hero images) من عرضَي الشبكة والقائمة.
- بطاقات نظيفة: خلفية ناعمة بلون التصنيف (~6%) + حدّ واضح (~25%) + مربّع أيقونة ملوّن.
- النصوص بلون المقدّمة (مقروءة) بدل الأبيض فوق صورة، ونبض النشاط `inline`.
- فائدة الأداء: لا تحميل صور لكل قسم في صفحة القائمة.

---

## 7. الملفات الرئيسية (P3)

| ملف | الغرض |
|-----|--------|
| `web-next/**` | تطبيق Next.js SSR (جديد) |
| `server/routes/edgeMeta.ts` | seo-bundle + home-bundle (إضافي) |
| `functions/_middleware.js` | توجيه مسارات SSR + تخطّي الحقن المزدوج |
| `scripts/verify-ssr.sh` | فحص ما بعد النشر (جديد) |
| `docs/technical-seo-p3-ssr-plan-ar.md` | الخطة |
| `docs/technical-seo-p3-ssr-runbook-ar.md` | دليل التشغيل + التراجع |
| `client/src/pages/CategoriesListPage.tsx` | تحسين بطاقات الأقسام |

---

## 8. إعدادات Cloudflare / Railway (خارج Git)

| الإجراء | الحالة |
|---------|--------|
| Railway: خدمة `web-next` (Dockerfile) | Active |
| Pages env: `NEXT_ORIGIN` = أصل web-next | مضبوط |
| Pages env: `SSR_ROUTES=on` | مفعّل |
| تفريغ كاش Cloudflare بعد التفعيل | تم (انتشر عبر الـ colos خلال دقائق) |

> درس تشغيلي: «Retry deployment» في Pages لا يغيّر `CF_PAGES_COMMIT_SHA`، فيُبقي
> نفس مفتاح الكاش. **للتفريغ النظيف الفوري: ادفع commit جديد** (SHA جديد = namespace
> كاش جديد)، أو Purge Everything والانتظار حتى انتهاء `s-maxage=300`.

---

## 9. المراقبة (14 يوماً)

| المقياس | أين | الهدف |
|---------|-----|-------|
| زمن الفهرسة بعد النشر | GSC → فحص URL | دقائق |
| «صفحة الإحالة» تمتلئ | GSC → فحص URL → الإحالة | روابط داخلية تظهر |
| LCP (بعد إزالة الصور) | GSC Core Web Vitals + Lighthouse | < 2.5s / نقاط > 90 |
| Impressions / CTR | GSC Performance | +30–50% خلال 30 يوم |
| استقرار `web-next` | Railway metrics | لا تسرّب ذاكرة تحت حمل الزحف |
| الحقن المزدوج | `verify-ssr.sh` | يبقى غائباً |

### 9.1 لقطة أساس PageSpeed (2026-06-03) — `/category/saudi`

> ملاحظة مهمة: **بيانات المختبر (Lab)** تعكس SSR الجديد، بينما **بيانات الميدان (CrUX)**
> متوسط متحرّك 28 يوماً ما زال يغلب عليه تجربة SPA القديمة — تتحسّن مع تحرّك النافذة.

| | موبايل | ديسكتوب |
|---|--------|---------|
| **Lab — Performance** | **99** | **100** |
| Lab — SEO | 100 | 100 |
| Lab — Accessibility | 93 | 93 |
| Lab — Best Practices | 92 | 92 |
| Field — LCP | 3.7s 🟠 | 3.4s 🟠 |
| Field — INP | 318ms 🟠 | 114ms 🟢 |
| Field — CLS | **0.4 🔴** | 0.18 🟠 |
| Field — FCP | 2.1s | 1.5s |
| Field — TTFB | 1s | 0.7s |

أولوية المتابعة: **CLS على الموبايل (0.4)** — مرشّحات السبب: تأخّر تحميل الإعلانات،
الترطيب (hydration) المتأخّر، صور بلا أبعاد. عولج جزئياً (أبعاد الشعار/الإعلانات +
إزالة صور الهيرو من الأقسام)؛ يُعاد القياس بعد تجدّد نافذة CrUX.

**تراجع طارئ:** ضبط `SSR_ROUTES=off` على Pages → عودة فورية لمسار P1/P2.

---

## 10. الخطوات الاختيارية التالية (بعد الاستقرار)

1. نقل المسارات الثانوية إلى SSR: `/omq/*` (التحليلات العميقة)، أيام العالم، الخليج.
2. جعل صفحة `/categories` المحورية قابلة للزحف (روابط الأقسام في HTML).
3. تنظيف `robots.txt` من تكرار مجموعة `User-agent: *` (Cloudflare Managed + الخاصة)
   — Google يدمجهما فلا ضرر فعلي، لكن الدمج أنظف.

---

*أُعدّ بعد تفعيل P3 والتحقق على الإنتاج (2026-06-03). يكمل توثيق P1+P2 في
`docs/technical-seo-implementation-2026-06-02.md`.*
