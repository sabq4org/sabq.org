# حالة النشر الحالية — sabq.org

> **آخر تحديث:** 2026-11-03
>
> الإنتاج: **Cloudflare Pages** (الواجهة) + **Render** (الـ API وبقية الخدمات) + **Neon** (Postgres).
> انتقل الـ API من Railway إلى Render في 2026-10-21. **Railway لم يعد جزءاً من سبق**، وأُزيلت ملفات إعداده من المستودع.
> الوثائق المؤرخة في `docs/` التي تذكر Railway سجلّ تاريخي فقط.

---

## الإنتاج اليوم

| الطبقة | المنصة | النطاق | ملاحظات |
|--------|--------|--------|---------|
| **الواجهة (SPA)** | Cloudflare Pages | `sabq.org` · `www.sabq.org` | `npm run build:client` → `dist/public/` · `functions/_middleware.js` |
| **الـ API** | Render، خدمة `sabq.org` (Dockerfile، Virginia) | `api.sabq.org` | `SERVE_SPA=false` · `DB_DRIVER=pg` · `/health` |
| **قاعدة البيانات** | Neon / Postgres | `NEON_DATABASE_URL` إن وُجد، وإلا `DATABASE_URL` | التغييرات بملف SQL إضافي يشغّله المالك (AGENTS.md § Workflow C) |
| **Redis** | Upstash | `REDIS_URL` على خدمة Render | **مُستخدم في الإنتاج** لتخفيف جلسات Neon — انظر § Redis |
| **الوسائط** | R2 لصور الأخبار تدريجياً + Cloudflare Images fallback + R2/S3 لبقية الملفات | `media.sabq.org` | راجع [`R2_NEWS_IMAGES_ROLLOUT.md`](R2_NEWS_IMAGES_ROLLOUT.md) |

```
المتصفح → Cloudflare Pages (sabq.org)
              ├─ ملفات ثابتة (dist/public)
              ├─ functions/_middleware.js  (proxy /api، SEO، slug-redirect)
              └─ api.sabq.org → Worker sabq-api-origin → Render (Express headless)
```

**مراجع تفصيلية:**
- [`docs/MIGRATION_CLOUDFLARE_PAGES.md`](MIGRATION_CLOUDFLARE_PAGES.md) — إعداد Pages والـ middleware
- [`docs/ratelimit-edge-ip-fix-2026-06-03.md`](ratelimit-edge-ip-fix-2026-06-03.md) — تمرير `X-Sabq-Client-IP` عبر Pages
- [`docs/R2_NEWS_IMAGES_ROLLOUT.md`](R2_NEWS_IMAGES_ROLLOUT.md) — تشغيل صور الأخبار على R2 وسياسة الكاش والتراجع

---

## خدمات Render من هذا المستودع

كلها في منطقة Virginia وتنشر تلقائياً عند الدمج في `main`، عدا `sabq-mirror-virginia`.
Render لا يقرأ ملف إعداد من المستودع: الخطة ومسارات البناء (Build Filters) والمتغيرات تُضبط من لوحة Render.

| الخدمة | النوع | المصدر | ما يعيد نشرها (Build Filters) |
|--------|-------|--------|-------------------------------|
| `sabq.org` (API، `sabq-api-virginia.onrender.com`) | Web Service، 2c-8g، توسّع تلقائي 1–2 نسخة | `Dockerfile` الجذري | `server/**` و`shared/**` و`package*.json` و`Dockerfile` و`.dockerignore` و`tsconfig.json` و`drizzle.config.ts` و`public/**` و`certs/**` و`docs/systems/**` |
| `sabq-newsletter-worker` | Background Worker | `Dockerfile` الجذري، أمر `node dist/newsletter-worker.js` | نفس مسارات الـ API |
| `sabq-meetings-agent` | Background Worker | `meetings-agent/` | `meetings-agent/**` |
| `sabq-web-next-virginia` | Web Service | `web-next/` | `web-next/**` |
| `sabq-mirror-virginia` | Web Service | `Dockerfile.mirror` من فرع `feature/readonly-mirror-news-subdomain` | — |

- تعديل `Dockerfile` الجذري يعيد نشر الـ API وعامل النشرة معاً.
- تغيير توثيق خارج `docs/systems/**` أو تطبيق موبايل فقط لا يعيد نشر أي خدمة.
- الخدمة قد تعمل بنسختين عند الضغط، لذلك يبقى الكود آمناً لتعدد النسخ: الكاش داخل العملية لكل نسخة، والحالة المشتركة في Redis أو Postgres، والمجدولات على القائد فقط (`server/leaderElection.ts`).
- لا توجد بيئة staging حالياً. اختبار المخطط يتم محلياً عبر `npm run db:push:local` على Docker Postgres.

---

## ما لم يعد إنتاجاً

| المنصة | الحالة |
|--------|--------|
| **Railway** | كان الـ API عليه من مايو حتى 2026-10-21. لم يعد جزءاً من سبق؛ أُزيلت `railway*.json` و`.env.railway.example` وسكربت `db:push:staging` |
| **Replit** | legacy — كان الإنتاج الأصلي (عملية واحدة: API + SPA). الكود ما زال يدعم هذا الوضع محلياً عبر `npm run dev` |
| **Vercel** | مُستبدَل بـ Cloudflare Pages على `sabq.org` (كان وسيطاً قبل Pages) |
| **`sabq.news`** | تجريبي سابق — ليس الإنتاج الرسمي |

---

## `REDIS_URL` — الجلسات وتخفيف ضغط Neon

### لماذا استخدمناه؟

على **Neon Postgres**، تخزين الجلسات في جدول `sessions` كان يولّد استعلاماً (قراءة/كتابة) على **كل طلب** يحمل كوكي جلسة — ضغطاً ملحوظاً على اتصالات Neon وتكلفة الحوسبة.  
**القرار التشغيلي:** تفعيل `REDIS_URL` على خدمة الـ API (**Upstash Redis**) ونقل الجلسات إلى `connect-redis` في `server/auth.ts`، بهدف:

- تخفيف ~50% من حركة الجلسات على Postgres (تقدير من `تقرير_الأداء_المعماري_سبق.md`)
- تقليل احتكاك حد الاتصالات (pool ~45) عند الذروة
- إبقاء Neon مخصصاً للمحتوى والاستعلامات وليس لقراءة/كتابة session TTL

هذا ليس «ميزة اختيارية للتجربة» — **مُفعّل في الإنتاج منذ فترة** كجزء من تحسين الأداء.

### في الكود (سلوك failover — منذ 2026-07-18)

- مع `REDIS_URL`: الجلسات **Redis أساسي + Postgres احتياطي** عبر `SessionFailoverStore`.
- أوامر Redis لها `commandTimeout=2.5s` و`enableOfflineQueue=false` — لا تعليق بلا نهاية عند انقطاع Upstash أو تغيّر Static IP egress.
- عند فشل Redis: تحويل تلقائي لجدول `sessions` في Neon لمدة ~30 ثانية (cooldown) ثم إعادة المحاولة.
- بدون `REDIS_URL`: Postgres فقط.
- مخزن Postgres للجلسات معزول عن pool المحتوى: افتراضياً 4 اتصالات فقط، بمهلة اتصال 2s ومهلة استعلام 2.5s. يمكن ضبط الحد بين 1 و10 عبر `SESSION_FALLBACK_POOL_MAX`.

| الوظيفة | مع Redis (الإنتاج) | عند انقطاع Redis | بدون REDIS_URL |
|---------|-------------------|------------------|----------------|
| **الجلسات** | Redis → failover إلى Neon | Neon `sessions` | Neon `sessions` |
| SSE / إشعارات بين النسخ | pub/sub عبر Redis | ذاكرة العملية الواحدة | ذاكرة العملية |
| Editor presence | متزامن بين pods | نسخة واحدة | نسخة واحدة |
| الكاش الساخن | `memoryCache.ts` | نفس السلوك | نفس السلوك |

**عند تقييد الوصول بالعناوين:** أضف عناوين الخروج الثابتة لخدمة Render إلى allowlist في Upstash.

### أين يُضبط

- **Render** → خدمة `sabq.org` → Environment → `REDIS_URL` (مثال: `rediss://…upstash.io`)
- **ليس** على Cloudflare Pages — الواجهة لا تتصل بـ Redis

### كيف تتأكد

1. Render → خدمة `sabq.org` → Environment → `REDIS_URL` موجود
2. سجلات الإقلاع: `[Session Pool] Isolated PostgreSQL pool initialized` ثم `[Session] Redis primary + isolated PostgreSQL failover` ✅
   أو `Using isolated PostgreSQL store` ⚠️ بدون Redis
3. عند انقطاع: `[Session] Redis unhealthy … using PostgreSQL` ثم الموقع يبقى يستجيب (بدون 502 على csrf)

### محلي

التطوير يستخدم **PostgreSQL في Docker** (`DB_DRIVER=pg`) وليس فرع Neon للتطوير:

```bash
npm run db:up                                          # postgres + redis
# .env.local: DATABASE_URL=postgresql://sabq:sabq_password@localhost:5432/sabq_db
#             DB_DRIVER=pg  — وبدون NEON_DATABASE_URL
npm run db:push:local                                  # schema على localhost فقط
npm run dev
npm run db:down                                        # إيقاف مع الإبقاء على الـ volume
```

الدليل: [`docs/setup/LOCAL_POSTGRES_AR.md`](setup/LOCAL_POSTGRES_AR.md).  
`REDIS_URL=redis://localhost:6379` اختياري؛ بدونها الجلسات على Postgres المحلي أو ذاكرة العملية.

**الإنتاج على Neon لم يتغير** — لا تلمس متغيرات Render ولا فرع Neon من هذا المسار.

---

## أوامر وقواعد سلامة

```bash
npm run dev           # محلي: Express + Vite على منفذ واحد
npm run db:up         # Postgres + Redis محليان
npm run db:push:local # مخطط → localhost فقط (يرفض Neon)
npm run build         # بناء كامل
npm run check         # TypeScript
```

- **لا** `db:push` / `db:push:local` على رابط الإنتاج أو Neon — للتطوير المحلي فقط `db:push:local`. للإنتاج: ملف SQL إضافي مؤرخ في `migrations/` يشغّله المالك في Neon (AGENTS.md § Workflow C).
- **لا** تفترض أن الوثائق القديمة التي تذكر «Replit = production» ما زالت صحيحة — راجع هذا الملف أولاً
- عند تعديل الـ proxy أو SEO على الحافة: **`functions/_middleware.js`** على Pages، وليس `server/seoInjector.ts` وحده (الـ injector يخدم وضع single-process فقط)
- صيانة قاعدة البيانات عند إقلاع الخادم **متوقفة افتراضياً**. لا تعمل إلا مع `RUN_DB_STARTUP_MAINTENANCE=true`، ويظل `SKIP_DB_MAINTENANCE=true` مانعاً أعلى أولوية. لا تفعّلها في الإنتاج مع رابط Neon pooled؛ نفّذ أعمال الصيانة كعملية تشغيلية مقصودة وباتصال admin مباشر.
