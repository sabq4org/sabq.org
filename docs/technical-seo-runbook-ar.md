# دليل تشغيل Technical SEO — سبق (يونيو 2026)

مرجع تنفيذي لأبو محمد والفريق التقني بعد تطبيق P1/P2 في الكود.

---

## ملخص سريع

| المرحلة | الحالة في الكود | يحتاج نشر |
|---------|-----------------|-----------|
| P1 — Cache + TTFB | ✅ | Cloudflare Pages + `EDGE_SEO=on` |
| P2 — JSON-LD + Indexing | ✅ | Railway env + Search Console |
| P3 — SSR/Next.js | 📋 خطة فقط | `docs/technical-seo-p3-ssr-plan-ar.md` |

---

## 1. نشر P1 (خلال 48 ساعة)

### المتطلبات

1. دمج التغييرات إلى فرع إنتاج Pages
2. **Pages → Environment variables (Production):**
   - `API_ORIGIN=https://api.sabq.org`
   - `EDGE_SEO=on` ← ضروري لحقن SEO + edge HTML cache
   - `EDGE_HTML_CACHE=on` (افتراضي — اتركه أو عطّله فقط للتشخيص)
3. إزالة routes الـ worker القديم `sabq-frontend-edge` من `sabq.org/*` (تجنّب حقن مزدوج)

### التحقق (بعد النشر)

```bash
# الطلب الأول — قد يكون MISS
curl -sS -D - -o /dev/null -A "Googlebot" \
  "https://sabq.org/article/<english-slug>" | grep -iE 'cache-control|x-edge-cache|cf-cache-status'

# الطلب الثاني — يجب HIT وTTFB < 0.2s
curl -sS -D - -o /dev/null -A "Googlebot" \
  "https://sabq.org/article/<english-slug>" | grep -iE 'x-edge-cache|cf-cache-status|time_starttransfer'

# لوحة التحكم — يجب no-store
curl -sS -D - -o /dev/null "https://sabq.org/dashboard" | grep -i cache-control
```

**مؤشرات النجاح:**

- `cache-control: public, max-age=120, s-maxage=300…`
- `x-edge-cache: HIT` (من الـ middleware) و/أو `cf-cache-status: HIT`
- `dashboard` → `private, no-store`

### Cache Rule اختياري (لوحة Cloudflare)

انظر جدول القاعدة في `docs/MIGRATION_CLOUDFLARE_PAGES.md` — مكمّل وليس بديلاً عن الكود.

---

## 2. نشر P2 (خلال أسبوع)

### أ) JSON-LD

```bash
curl -sS "https://api.sabq.org/api/edge/seo-meta?path=/article/<slug>" | \
  jq '.jsonLd | {hasBody: (.articleBody != null), wordCount, speakable, images: (.image | length)}'
```

توقّع: `hasBody: true`, `wordCount` > 0, `images: 3`, `speakable` موجود.

اختبار يدوي: [Google Rich Results Test](https://search.google.com/test/rich-results)

### ب) Google Indexing API (Railway)

```env
GOOGLE_INDEXING_CLIENT_EMAIL=...@....iam.gserviceaccount.com
GOOGLE_INDEXING_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

1. تفعيل **Indexing API** في Google Cloud
2. إضافة Service Account كـ **Owner** في Search Console لملكية `sabq.org`
3. إعادة نشر Railway

**عند كل نشر خبر:** `notifySearchEngines()` تلقائياً (IndexNow + Indexing API).

**إعادة فهرسة دفعة (بعد إصلاح المفتاح):**

```bash
tsx scripts/reindex-recent-articles.ts
```

حصة Google: ~200 طلب/يوم — السكربت يحذّر إن تجاوزت ~180 URL.

### ج) ما لا نستخدمه

- ❌ `https://www.google.com/ping?sitemap=...` — ملغى من Google (2023)
- ✅ IndexNow (Bing/Yandex) + Indexing API (Google عند التفعيل)

### د) إبطال CDN بعد النشر

موجود: `contentInvalidation` + `purgeArticle` — يشمل الآن:

- صفحة المقال على `sabq.org`
- `/api/edge/seo-meta` و `/api/edge/slug-redirect` على `api.sabq.org`

يتطلب: `CLOUDFLARE_ZONE_ID` + `CLOUDFLARE_API_TOKEN` على Railway.

---

## 3. مراقبة يومية (24 ساعة لأبو محمد)

| المقياس | أين | هدف |
|---------|-----|-----|
| TTFB مقالة | `curl` أعلاه | < 200ms (HIT) |
| Indexing delay | GSC → Pages | عاجل < 15 دقيقة (مع API) |
| Impressions | GSC Performance | +50% خلال 30 يوم (طموح) |
| CTR News/Discover | GSC | +30% بعد 30 يوم (طموح) |
| Core Web Vitals | GSC + Lighthouse | > 90 |

**قالب تقرير يومي (جملة واحدة):**

> «اليوم: X مقالة بـ edge HIT، Y إشعار Indexing API ناجح، Z خطأ purge/API — الإجراء: …»

---

## 4. الملفات التي تغيّرت (مرجع PR)

| ملف | الغرض |
|-----|--------|
| `functions/_middleware.js` | Cache headers + Workers Cache API + TTFB parallel |
| `client/src/lib/deployRecovery.ts` | أمان بعد النشر |
| `client/src/main.tsx` | تفعيل recovery |
| `server/utils/newsArticleSchema.ts` | JSON-LD مشترك |
| `server/routes/edgeMeta.ts` | حقول schema للحافة |
| `server/seoInjector.ts` | نفس الحقول لـ Replit |
| `server/indexNow.ts` | ربط Indexing API |
| `server/services/cloudflarePurge.ts` | purge edge meta عند النشر |

---

## 5. P3 — الخطوة التالية

اقرأ `docs/technical-seo-p3-ssr-plan-ar.md` — **لا تبدأ قبل استقرار P1 لمدة 7 أيام.**

---

## 6. استكشاف الأخطاء

| العرض | السبب المحتمل | الإجراء |
|-------|---------------|---------|
| لا يزال `no-store` | لم يُنشر Pages أو `EDGE_SEO` off | نشر + تفعيل env |
| `DYNAMIC` دائماً | Cache Rule غير مفعّلة والـ in-function cache off | `EDGE_SEO=on` |
| صفحة بيضاء بعد نشر | قشرة قديمة | `deployRecovery` يعيد التحميل؛ تحقق من purge |
| Indexing API فاشل | SA ليس Owner في GSC | أضف الحساب في Search Console |
| JSON-LD بدون articleBody | مقال بدون content | تحرير المحتوى في CMS |

---

*مسؤول المتابعة: الفريق التقني — تحديث أسبوعي للجدول أعلاه.*
