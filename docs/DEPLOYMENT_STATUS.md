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
| **Redis** | Upstash (أو Redis مُدار) على Railway | `REDIS_URL` | **مُستخدم في الإنتاج** لتخفيف جلسات Neon — انظر § Redis |
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

## `REDIS_URL` — الجلسات وتخفيف ضغط Neon

### لماذا استخدمناه؟

على **Neon Postgres**، تخزين الجلسات في جدول `sessions` كان يولّد استعلاماً (قراءة/كتابة) على **كل طلب** يحمل كوكي جلسة — ضغطاً ملحوظاً على اتصالات Neon وتكلفة الحوسبة.  
**القرار التشغيلي:** تفعيل `REDIS_URL` على Railway (غالباً **Upstash Redis**) ونقل الجلسات إلى `connect-redis` في `server/auth.ts`، بهدف:

- تخفيف ~50% من حركة الجلسات على Postgres (تقدير من `تقرير_الأداء_المعماري_سبق.md`)
- تقليل احتكاك حد الاتصالات (pool ~45) عند الذروة
- إبقاء Neon مخصصاً للمحتوى والاستعلامات وليس لقراءة/كتابة session TTL

هذا ليس «ميزة اختيارية للتجربة» — **مُفعّل في الإنتاج منذ فترة** كجزء من تحسين الأداء بعد الانتقال إلى Railway.

### في الكود (سلوك fallback)

الكود يبقى مرناً: بدون `REDIS_URL` يعود تلقائياً إلى جدول `sessions` في Postgres — مفيد للتطوير المحلي فقط، **ليس الوضع المستهدف للإنتاج**.

| الوظيفة | مع Redis (الإنتاج) | بدون Redis (fallback) |
|---------|-------------------|----------------------|
| **الجلسات** | `connect-redis` → Upstash | جدول `sessions` في Neon |
| SSE / إشعارات بين النسخ | pub/sub عبر Redis | ذاكرة العملية الواحدة |
| Editor presence | متزامن بين pods | نسخة واحدة |
| الكاش الساخن | `memoryCache.ts` (ذاكرة العملية) | نفس السلوك |

### أين يُضبط

- **Railway** → Variables → `REDIS_URL` (مثال: `rediss://…upstash.io`)
- **ليس** على Cloudflare Pages — الواجهة لا تتصل بـ Redis

### كيف تتأكد

1. Railway → Variables → `REDIS_URL` موجود
2. سجلات الإقلاع: `[Session] Using Redis store (fast, no DB pressure)` ✅  
   أو `Using PostgreSQL store (add REDIS_URL...)` ⚠️ يعني الجلسات عادت لـ Neon

### محلي

`docker-compose.yml` يشغّل Redis (`redis://redis:6379`). `npm run dev` بدون Docker لا يحتاج Redis — الجلسات تذهب لـ Postgres المحلي أو in-memory حسب الإعداد.

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
