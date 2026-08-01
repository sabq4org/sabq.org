# حالة النشر الحالية — sabq.org

> **آخر تحديث:** 2026-08-01
>
> **ملاحظة تشغيلية:** انتقل الإنتاج الرسمي من **Replit** إلى **Cloudflare Pages** (الواجهة) + **Railway** (الـ API) في **منتصف مايو 2026** (~أسبوعين قبل هذا التاريخ). Replit لم يعد مسار النشر الحالي.

---

## الإنتاج اليوم

| الطبقة | المنصة | النطاق | ملاحظات |
|--------|--------|--------|---------|
| **الواجهة (SPA)** | Cloudflare Pages | `sabq.org` · `www.sabq.org` | `npm run build:client` → `dist/public/` · `functions/_middleware.js` |
| **الـ API** | Railway (Dockerfile) | `api.sabq.org` | `SERVE_SPA=false` · `DB_DRIVER=pg` |
| **قاعدة البيانات** | Neon / Postgres | `NEON_DATABASE_URL` إن وُجد، وإلا `DATABASE_URL` على Railway | لا تشغّل `db:push` على prod بدون `./push-to-production.sh` |
| **Redis** | Upstash (أو Redis مُدار) على Railway | `REDIS_URL` | **مُستخدم في الإنتاج** لتخفيف جلسات Neon — انظر § Redis |
| **الوسائط** | R2 لصور الأخبار تدريجياً + Cloudflare Images fallback + R2/S3 لبقية الملفات | `media.sabq.org` | راجع [`R2_NEWS_IMAGES_ROLLOUT.md`](R2_NEWS_IMAGES_ROLLOUT.md) |

```
المتصفح → Cloudflare Pages (sabq.org)
              ├─ ملفات ثابتة (dist/public)
              ├─ functions/_middleware.js  (proxy /api، SEO، slug-redirect)
              └─ Railway api.sabq.org       (Express headless)
```

**مراجع تفصيلية:**
- [`docs/MIGRATION_CLOUDFLARE_PAGES.md`](MIGRATION_CLOUDFLARE_PAGES.md) — إعداد Pages والـ middleware
- [`docs/ratelimit-edge-ip-fix-2026-06-03.md`](ratelimit-edge-ip-fix-2026-06-03.md) — تمرير `X-Sabq-Client-IP` عبر Pages
- [`docs/R2_NEWS_IMAGES_ROLLOUT.md`](R2_NEWS_IMAGES_ROLLOUT.md) — تشغيل صور الأخبار على R2 وسياسة الكاش والتراجع
- [`SPLIT_ROADMAP.md`](../SPLIT_ROADMAP.md) — تاريخ المسار التجريبي `sabq.news` (قديم)

---

## ما لم يعد إنتاجاً

| المنصة | الحالة |
|--------|--------|
| **Replit** | legacy — كان الإنتاج الأصلي (عملية واحدة: API + SPA). الكود ما زال يدعم هذا الوضع محلياً عبر `npm run dev` |
| **Vercel** | مُستبدَل بـ Cloudflare Pages على `sabq.org` (كان وسيطاً قبل Pages) |
| **`sabq.news`** | تجريبي سابق (Vercel + Railway) — ليس الإنتاج الرسمي |

---

## Railway staging المعزول

بيئة Railway الدائمة `staging` منفصلة عن `production` ولا تُنشأ بالنسخ منه.
مصدر النشر هو فرع GitHub الدائم `staging`، وليس `main`.

| الخدمة | المصدر | قاعدة البيانات/السلوك |
|--------|--------|------------------------|
| `sabq-staging-api` | جذر المستودع · `/railway.json` | شبكة Railway الداخلية فقط؛ PostgreSQL staging مستقل؛ `SERVE_SPA=false` وكل المجدولات/العمال معطّلة |
| `sabq-staging-web-next` | `Root Directory=/web-next` · `/web-next/railway.json` | `API_ORIGIN` يشير إلى API الداخلي؛ `STAGING_NO_INDEX=true` |
| `Postgres` | Railway Postgres 18 + pgvector | volume مستقل، ولا يوجد `NEON_DATABASE_URL` |

لا توجد خدمات `newsletter-worker` أو `meetings-agent` أو `sabq-mirror` في
staging. لا تُنسخ قيم أسرار production؛ تُنشأ أسرار الجلسة/JWT خاصة بـ staging،
وتُترك تكاملات الطرف الثالث غير مضبوطة. الاستثناء الوحيد هو
`OPENAI_API_KEY=staging-disabled-invalid-key`: قيمة حارسة غير صالحة وليست مفتاحاً،
لأن استيراد عميل embeddings القديم يرفض الإقلاع عند غياب الاسم كلياً؛ وتظل كل
مهام AI الخلفية معطّلة. كذلك يستخدم `PRIVATE_OBJECT_DIR` مجلداً مؤقتاً داخل
حاوية staging بدلاً من أي مفاتيح R2 أو bucket إنتاجي.

### ترقية commit إلى staging

بعد نجاح فحوصات الفرع، ادفع commit المطلوب إلى فرع `staging` ثم راقب خدمتي
staging. لا تعدّل `main` ولا بيئة production في هذا الاختبار:

```bash
git push origin <COMMIT_SHA>:staging
```

فحوصات القبول:

```bash
railway ssh --project 49260270-79b7-40af-9e91-2599a6161f46 \
  --environment staging --service sabq-staging-web-next \
  node -e 'fetch(process.env.API_ORIGIN + "/health").then(async r => { \
    const j = await r.json(); console.log(r.status, j.status, j.database); \
    if (!r.ok || j.database !== "connected") process.exit(1); })'
curl -fsSI https://sabq-staging-web-next-staging.up.railway.app/ \
  | grep -iE 'HTTP/|x-robots-tag|cache-control'
```

المتوقع: API يعيد `200` و`database=connected`، والويب يعيد `200` مع
`X-Robots-Tag: noindex, nofollow, noarchive` و`Cache-Control: private, no-store`.

### تطبيق المخطط على staging أولاً

يُستخدم فقط مع متغيرات خدمة `Postgres` داخل بيئة Railway `staging`:

```bash
# افتح TCP مؤقتاً وسجّل id الناتج
railway tcp-proxy create --port 5432 \
  --project 49260270-79b7-40af-9e91-2599a6161f46 \
  --environment staging --service Postgres --json

railway run --project 49260270-79b7-40af-9e91-2599a6161f46 \
  --environment staging --service Postgres --no-local \
  npm run db:push:staging

# أغلق المنفذ العام فور نجاح Drizzle
railway tcp-proxy delete <PROXY_ID> --yes \
  --project 49260270-79b7-40af-9e91-2599a6161f46 \
  --environment staging --service Postgres
```

السكربت يرفض أي بيئة غير `staging`، ويرفض Neon، ويتحقق من مشروع Railway
والخدمة، ثم يفعّل pgvector قبل Drizzle. لا تترك TCP proxy فعالاً بعد العملية؛
الوضع الطبيعي لقاعدة staging هو الشبكة الداخلية فقط. راجع أيضاً
[`docs/setup/LOCAL_POSTGRES_AR.md`](setup/LOCAL_POSTGRES_AR.md).

---

## Railway Watch Paths — خدمات المستودع الواحد

خدمات Railway المرتبطة بفرع `main` تستخدم `build.watchPatterns` داخل ملفات
`railway*.json`. الأنماط تُحسب من جذر المستودع حتى عندما تضبط الخدمة
`Root Directory`، وتمنع إنشاء deployment إذا لم يطابق أي ملف متغيّر.

| الخدمة | Config File | ما يعيد نشرها |
|--------|-------------|----------------|
| `sabq.org` (API) | `/railway.json` | `server/**` و`shared/**`، اعتماديات npm، Docker، ملفات TypeScript/Drizzle، وأصول التشغيل المنسوخة للصورة (`public/**` و`certs/**` و`docs/systems/**`) |
| `newsletter-worker` | `/railway.newsletter-worker.json` | نقطة دخول العامل واعتمادياتها المشتركة المباشرة/الانتقالية، `shared/**`، اعتماديات npm، وملفات Docker/Railway/TypeScript/Drizzle |
| `meetings-agent` | `/meetings-agent/railway.json` | `meetings-agent/**` فقط؛ يشمل Dockerfile واعتمادياته المحلية |
| `web-next` | `/web-next/railway.json` | `web-next/**` فقط؛ يشمل Dockerfile وملف Railway واعتماديات Next المحلية |

### قواعد الصيانة

- أي خدمة جديدة في monorepo يجب أن تضيف Watch Patterns قبل تفعيل النشر التلقائي.
- عند إضافة import جديد إلى `server/newsletterWorker.ts` أو أحد اعتمادياته، أضف مساره
  إلى `/railway.newsletter-worker.json` في نفس PR. تغيير الملف المستورِد نفسه سيطلق
  أول نشر، لكن إدراج الاعتماد الجديد يمنع فقدان نشر تعديلاته اللاحقة.
- تعديل `Dockerfile` الجذري يعيد نشر `sabq.org` و`newsletter-worker` لأنهما يستخدمانه معاً.
- `sabq-mirror` غير مشمول هنا؛ يتبع فرع `feature/readonly-mirror-news-subdomain`
  وتتم معالجة تقادمه في #1329.
- تغيير توثيق أو تطبيق موبايل فقط لا يعيد تشغيل خدمات Railway الأربع ما لم يطابق
  أحد أصول التشغيل المذكورة أعلاه.

---

## `REDIS_URL` — الجلسات وتخفيف ضغط Neon

### لماذا استخدمناه؟

على **Neon Postgres**، تخزين الجلسات في جدول `sessions` كان يولّد استعلاماً (قراءة/كتابة) على **كل طلب** يحمل كوكي جلسة — ضغطاً ملحوظاً على اتصالات Neon وتكلفة الحوسبة.  
**القرار التشغيلي:** تفعيل `REDIS_URL` على Railway (غالباً **Upstash Redis**) ونقل الجلسات إلى `connect-redis` في `server/auth.ts`، بهدف:

- تخفيف ~50% من حركة الجلسات على Postgres (تقدير من `تقرير_الأداء_المعماري_سبق.md`)
- تقليل احتكاك حد الاتصالات (pool ~45) عند الذروة
- إبقاء Neon مخصصاً للمحتوى والاستعلامات وليس لقراءة/كتابة session TTL

هذا ليس «ميزة اختيارية للتجربة» — **مُفعّل في الإنتاج منذ فترة** كجزء من تحسين الأداء بعد الانتقال إلى Railway.

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

**تشغيل مُستحسن مع Static IP:** Redis على Railway (شبكة داخلية) بدل Upstash العام، أو allowlist عناوين Static IP في Upstash.

### أين يُضبط

- **Railway** → Variables → `REDIS_URL` (مثال: `rediss://…upstash.io` أو `redis://…railway.internal`)
- **ليس** على Cloudflare Pages — الواجهة لا تتصل بـ Redis

### كيف تتأكد

1. Railway → Variables → `REDIS_URL` موجود
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

**الإنتاج على Neon لم يتغير** — لا تلمس متغيرات Railway ولا فرع Neon من هذا المسار.

---

## أوامر وقواعد سلامة

```bash
npm run dev           # محلي: Express + Vite على منفذ واحد
npm run db:up         # Postgres + Redis محليان
npm run db:push:local # مخطط → localhost فقط (يرفض Neon)
npm run build         # بناء كامل
npm run check         # TypeScript
```

- **لا** `db:push` / `db:push:local` على رابط الإنتاج أو Neon — للتطوير المحلي فقط `db:push:local`. للإنتاج: `./push-to-production.sh` مع رابط Railway الفعلي (`NEON_DATABASE_URL` أولًا) عبر `SCHEMA_DATABASE_URL`.
- **لا** تفترض أن الوثائق القديمة التي تذكر «Replit = production» ما زالت صحيحة — راجع هذا الملف أولاً
- عند تعديل الـ proxy أو SEO على الحافة: **`functions/_middleware.js`** على Pages، وليس `server/seoInjector.ts` وحده (الـ injector يخدم وضع single-process فقط)
- صيانة قاعدة البيانات عند إقلاع الخادم **متوقفة افتراضياً**. لا تعمل إلا مع `RUN_DB_STARTUP_MAINTENANCE=true`، ويظل `SKIP_DB_MAINTENANCE=true` مانعاً أعلى أولوية. لا تفعّلها على Railway مع رابط Neon pooled؛ نفّذ أعمال الصيانة كعملية تشغيلية مقصودة وباتصال admin مباشر.
