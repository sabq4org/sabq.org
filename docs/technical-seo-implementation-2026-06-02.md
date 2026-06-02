# توثيق تنفيذ Technical SEO — صحيفة سبق

**التاريخ:** 2026-06-02
**النطاق:** sabq.org (أرشفة Google News & Discover)
**الـ commit:** `4e3b53d` على `main`
**المرجع:** «التقرير الفني الشامل: فحص أداء أرشفة صحيفة سبق»

---

## 1. الخلاصة التنفيذية (لأبو محمد)

| النتيجة | قبل | بعد (مُتحقَّق على الإنتاج) |
|---------|-----|---------------------------|
| سرعة استجابة المقال (TTFB) | **1529 ms** | **~300–500 ms** (انخفاض ~3–5×) |
| التخزين المؤقت على الحافة | لا يوجد (`no-store`) | `x-edge-cache: HIT` |
| بيانات Google News (JSON-LD) | ناقصة | كاملة (نص + 3 صور + صوتي) |
| الأرشفة الفورية | زحف دوري | IndexNow فوري + Indexing API (عند المفتاح) |

تم التحقق على مقال حقيقي منشور:
`https://sabq.org/article/qzVBFf1`

---

## 2. التشخيص الفعلي للبنية

خلافاً لما في بعض الوثائق القديمة، الواجهة الحية تعمل عبر:

```
المستخدم / Googlebot
   → Cloudflare Pages (مشروع sabq-org، نطاقا sabq.org + www)
   → functions/_middleware.js  (proxy + حقن SEO + تخزين HTML على الحافة)
   → api.sabq.org (Railway: API + /api/edge/seo-meta + /api/edge/slug-redirect)
```

السبب الجذري للترويسة المعطوبة (`private, no-store…`) كان في `functions/_middleware.js`
وليس nginx/Apache. وكان متعمداً لتجنّب «الصفحة البيضاء بعد النشر»، لكن آلية
الاسترداد (`build-info.json`) لم تكن مربوطة — فعالجنا السبب الجذري قبل تفعيل التخزين.

---

## 3. ما نُفّذ (P1)

### 3.1 ترويسات + تخزين على الحافة — `functions/_middleware.js`
- محتوى قابل للأرشفة على sabq.org →
  `Cache-Control: public, max-age=120, s-maxage=300, stale-while-revalidate=60`
- تخزين HTML المحقون فعلياً عبر **Workers Cache API**، بمفتاح يتضمّن
  `CF_PAGES_COMMIT_SHA` → كل نشر = namespace جديد (لا قشرة قديمة تشير لـ JS محذوف).
- `noindex` (dashboard/admin/auth) + المضيفات غير القانونية (`*.pages.dev`,
  `sabq.news`) + أي `robots=noindex` → تبقى `no-store` (حماية أمنية).
- ترويسة تشخيص `x-edge-cache: HIT|MISS`.

### 3.2 خفض TTFB
- جلب `slug-redirect` + قشرة SPA + `seo-meta` **بالتوازي** (`Promise.all`)
  بدل التسلسل → حذف دورة edge→origin من كل زحف.

### 3.3 أمان ما بعد النشر — `client/src/lib/deployRecovery.ts`
- يلتقط فشل تحميل chunk (`vite:preloadError` + رفض dynamic import) ويعيد
  التحميل مرة واحدة بكاسر تخزين `?_dr=` (مع cooldown لمنع الحلقات).
- مُفعّل في `client/src/main.tsx` (إنتاج فقط).

---

## 4. ما نُفّذ (P2)

### 4.1 NewsArticle JSON-LD — `server/utils/newsArticleSchema.ts` (مشترك)
حقول أُضيفت لكلا مساري SEO (الحافة + Replit):

| الحقل | الوصف |
|-------|--------|
| `articleBody` | نص الخبر الكامل بدون HTML |
| `wordCount` | عدد الكلمات (محسوب) |
| `speakable` | `SpeakableSpecification` + `cssSelector` (للمساعدات الصوتية) |
| `image` | 3 نسب: 16:9 (1200×675)، 4:3 (1200×900)، 1:1 (1200×1200) |

مطبّق في:
- `server/routes/edgeMeta.ts` (مسار Cloudflare — ما يراه Googlebot فعلاً)
- `server/seoInjector.ts` (مسار Replit — عربي/إنجليزي/أردي)

### 4.2 الأرشفة الفورية — `server/indexNow.ts`
- `notifySearchEngines()` تُستدعى عند كل نشر (6 مواضع في `routes.ts`):
  - **IndexNow** (Bing/Yandex/Naver) — يعمل.
  - **Google Indexing API** (URL_UPDATED) — يُفعّل تلقائياً عند توفّر المفاتيح.
- **لم نُضف** `google.com/ping?sitemap=` — ألغته Google (يونيو 2023).

### 4.3 إبطال CDN عند النشر — `server/services/cloudflarePurge.ts`
`purgeArticle()` يمسح الآن أيضاً:
- صفحة المقال (ar/en/ur) على sabq.org
- `/api/edge/seo-meta?path=…` و `/api/edge/slug-redirect?path=…` على api.sabq.org

---

## 5. تغييرات Cloudflare (لوحة التحكم — ليست في Git)

| الإجراء | الحالة |
|---------|--------|
| Pages `sabq-org`: نطاقا `sabq.org` + `www.sabq.org` | Active + SSL |
| Pages env: `EDGE_SEO=on` | مفعّل |
| حذف Workers Routes `sabq.org/*` + `www.sabq.org/*` → `sabq-frontend-edge` | تم |
| الإبقاء على `cache-fix` (api/homepage) + `image-proxy` (cdn-img) | كما هي |

نتيجة: لا حقن SEO مزدوج، وكل ترافيك sabq.org يمرّ على Pages middleware.

---

## 6. نتائج التحقق (إنتاج — 2026-06-02 21:21)

مقال الاختبار: `https://sabq.org/article/qzVBFf1`

**الترويسات:**
```
cache-control: public, max-age=120, s-maxage=300, stale-while-revalidate=60
cdn-cache-control: public, max-age=300, stale-while-revalidate=60
x-edge-cache: HIT
TTFB ≈ 0.31s  (الطلب الأول)  /  0.50s (الثاني)
sabq-edge-meta-injected ×1  (حقن مرة واحدة)
```

**JSON-LD (من api.sabq.org/api/edge/seo-meta):**
```json
{
  "@type": "NewsArticle",
  "wordCount": 140,
  "image": [ /* 3 نسب imagedelivery */ ],
  "articleBody": "… (879 حرف)",
  "speakable": { "@type": "SpeakableSpecification", "cssSelector": [...] },
  "datePublished": "2026-06-02T18:13:46.427Z",
  "dateModified": "2026-06-02T18:15:42.741Z"
}
```
`wordCount:140` يظهر أيضاً داخل HTML الذي يراه Googlebot ✅

---

## 7. الملفات المتغيّرة (commit 4e3b53d)

| ملف | الغرض |
|-----|--------|
| `functions/_middleware.js` | ترويسات + Workers Cache API + جلب متوازٍ |
| `client/src/lib/deployRecovery.ts` | استرداد بعد النشر (جديد) |
| `client/src/main.tsx` | تفعيل الاسترداد |
| `client/public/_headers` | تحديث تعليق التخزين |
| `server/utils/newsArticleSchema.ts` | حقول JSON-LD مشتركة (جديد) |
| `server/routes/edgeMeta.ts` | حقول schema للحافة |
| `server/seoInjector.ts` | نفس الحقول (ar/en/ur) |
| `server/indexNow.ts` | ربط Google Indexing API |
| `server/services/cloudflarePurge.ts` | مسح edge meta + en/ur عند النشر |
| `server/services/googleIndexingService.ts` | استخدام PUBLIC_SITE_URL |
| `server/routes.ts` | تحديث تعليق |
| `docs/MIGRATION_CLOUDFLARE_PAGES.md` | قسم P1 + Indexing API |
| `docs/technical-seo-runbook-ar.md` | دليل تشغيل (جديد) |
| `docs/technical-seo-p3-ssr-plan-ar.md` | خطة SSR (جديد) |

> لم تُدفع تغييرات iOS غير المرتبطة ولا ملفات `.bak`.

---

## 8. ما تبقّى (خارج الكود — صلاحيات)

### لإكمال أرشفة Google الفورية
1. **Railway** (`api.sabq.org`) →
   `GOOGLE_INDEXING_CLIENT_EMAIL`، `GOOGLE_INDEXING_PRIVATE_KEY`
2. **Google Cloud** → تفعيل Web Search Indexing API + Service Account (JSON key)
3. **Search Console** → إضافة بريد الـ Service Account كـ **Owner** على sabq.org
4. (موجودان غالباً) `CLOUDFLARE_ZONE_ID` + `CLOUDFLARE_API_TOKEN` على Railway لـ purge

بعد المفاتيح: كل خبر يُرسَل تلقائياً إلى Google لحظة النشر.
إعادة فهرسة دفعة (عند الحاجة): `tsx scripts/reindex-recent-articles.ts`

---

## 9. P3 — الخطوة الاستراتيجية (لاحقاً)

التحوّل إلى SSR/Next.js لمسارات المحتوى — خطة كاملة في
`docs/technical-seo-p3-ssr-plan-ar.md`. **لا تبدأ قبل 7 أيام استقرار P1** في GSC.

---

## 10. مراقبة (24 ساعة)

| المقياس | أين | هدف |
|---------|-----|-----|
| TTFB مقالة | curl (runbook) | < 200ms |
| Indexing delay (عاجل) | GSC → Pages | < 15 دقيقة (مع API) |
| Impressions | GSC Performance | +50% / 30 يوم |
| CTR (News/Discover) | GSC | +30% / 30 يوم |
| Core Web Vitals | GSC + Lighthouse | > 90 |

⚠️ تنبيه: `DEPLOY_PURGE_URL` على Pages قد يمسح CDN بعد كل نشر — راقب أي صفحة
بيضاء بعد النشر؛ `deployRecovery` يخفّفها لكن راقب أول 24 ساعة.

---

*أُعدّ آلياً بعد تنفيذ P1+P2 والتحقق على الإنتاج. مرجع التشغيل:
`docs/technical-seo-runbook-ar.md`.*
