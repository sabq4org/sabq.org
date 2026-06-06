# حالة النشر الحالية — sabq.org

> **آخر تحديث:** 2026-06-06  
> **ملاحظة تشغيلية:** انتقل الإنتاج الرسمي من **Replit** إلى **Cloudflare Pages** (الواجهة) + **Railway** (الـ API) في **منتصف مايو 2026** (~أسبوعين قبل هذا التاريخ). Replit لم يعد مسار النشر الحالي.

---

## الإنتاج اليوم

| الطبقة | المنصة | النطاق | ملاحظات |
|--------|--------|--------|---------|
| **الواجهة (SPA)** | Cloudflare Pages | `sabq.org` · `www.sabq.org` | `npm run build:client` → `dist/public/` · `functions/_middleware.js` |
| **الـ API** | Railway (Dockerfile) | `api.sabq.org` | `SERVE_SPA=false` · `DB_DRIVER=pg` |
| **قاعدة البيانات** | Neon / Postgres | عبر `DATABASE_URL` على Railway | لا تشغّل `db:push` على prod بدون `./push-to-production.sh` |
| **Redis** | اختياري على Railway | `REDIS_URL` | انظر قسم Redis أدناه |
| **الوسائط** | Cloudflare Images + R2/S3 | — | كما في `CLAUDE.md` |

```
المتصفح → Cloudflare Pages (sabq.org)
              ├─ ملفات ثابتة (dist/public)
              ├─ functions/_middleware.js  (proxy /api، SEO، slug-redirect)
              └─ Railway api.sabq.org       (Express headless)
```

**مراجع تفصيلية:**
- [`docs/MIGRATION_CLOUDFLARE_PAGES.md`](MIGRATION_CLOUDFLARE_PAGES.md) — إعداد Pages والـ middleware
- [`docs/ratelimit-edge-ip-fix-2026-06-03.md`](ratelimit-edge-ip-fix-2026-06-03.md) — تمرير `X-Sabq-Client-IP` عبر Pages
- [`SPLIT_ROADMAP.md`](../SPLIT_ROADMAP.md) — تاريخ المسار التجريبي `sabq.news` (قديم)

---

## ما لم يعد إنتاجاً

| المنصة | الحالة |
|--------|--------|
| **Replit** | legacy — كان الإنتاج الأصلي (عملية واحدة: API + SPA). الكود ما زال يدعم هذا الوضع محلياً عبر `npm run dev` |
| **Vercel** | مُستبدَل بـ Cloudflare Pages على `sabq.org` (كان وسيطاً قبل Pages) |
| **`sabq.news`** | تجريبي سابق (Vercel + Railway) — ليس الإنتاج الرسمي |

---

## `REDIS_URL` — هل هو مفعّل؟

**في الكود:** Redis **اختياري**. إذا لم يُضبط `REDIS_URL` على Railway يعمل النظام بشكل طبيعي مع بدائل:

| الوظيفة | مع Redis | بدون Redis |
|---------|----------|------------|
| الجلسات | `connect-redis` | جدول `sessions` في PostgreSQL |
| SSE / إشعارات بين النسخ | pub/sub | ذاكرة العملية الواحدة |
| Editor presence | متزامن بين pods | نسخة واحدة |
| الكاش الساخن | `memoryCache.ts` (ذاكرة العملية) | نفس السلوك |

**أين يُضبط:** متغير بيئة على **خدمة Railway** (ليس على Cloudflare Pages — Pages لا تستخدم Redis).

**كيف تتأكد:**
1. Railway → Service → Variables → هل `REDIS_URL` موجود؟
2. سجلات الإقلاع: `[Session] Using Redis store` = مفعّل · `Using PostgreSQL store (add REDIS_URL...)` = غير مفعّل

**متى تحتاجونه:**
- أكثر من replica لـ Railway → **مستحسن** (جلسات + pub/sub بين النسخ)
- replica واحدة (الوضع الشائع حالياً) → **اختياري**؛ PostgreSQL للجلسات يكفي لكنه يزيد ضغط DB

**محلي:** `docker-compose.yml` يشغّل Redis تلقائياً (`redis://redis:6379`). التطوير بـ `npm run dev` بدون Docker لا يحتاج Redis.

---

## أوامر وقواعد سلامة

```bash
npm run dev      # محلي: Express + Vite على منفذ واحد (مثل Replit القديم)
npm run build    # بناء كامل
npm run check    # TypeScript
```

- **لا** `db:push` مباشرة على `DATABASE_URL` الإنتاجي — استخدم `./push-to-production.sh`
- **لا** تفترض أن الوثائق القديمة التي تذكر «Replit = production» ما زالت صحيحة — راجع هذا الملف أولاً
- عند تعديل الـ proxy أو SEO على الحافة: **`functions/_middleware.js`** على Pages، وليس `server/seoInjector.ts` وحده (الـ injector يخدم وضع single-process فقط)
