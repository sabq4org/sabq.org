# حالة النشر الحالية — sabq.org

> **آخر تحديث:** 2026-11-02
>
> **تحديث 2026-11-02 (مراجعة Neon/Cloudflare/Render):** أُضيف قسم «خدمات Render» أدناه بأسماء الخدمات وخططها وثغرات التشغيل المفتوحة بعد الهجرة (TheSports، Twilio، web-next 500، الخروج). أقسام Railway بقيت لبيئة staging فقط.
>
> **تحديث 2026-10-21:** انتقل الـ API من Railway إلى **Render** (خدمة `sabq.org`، منطقة Virginia، `sabq-api-virginia.onrender.com`) بعد تعطل نشر Railway. `api.sabq.org` يمر عبر Cloudflare Worker `sabq-api-origin` الذي يوجّه إلى Render، وسجل DNS لـ`api.sabq.org` صار يشير إلى Render. أقسام Railway أدناه تاريخية حتى تُراجع الوثيقة كاملة.
>
> **ملاحظة تشغيلية:** انتقل الإنتاج الرسمي من **Replit** إلى **Cloudflare Pages** (الواجهة) + **Railway** (الـ API) في **منتصف مايو 2026** (~أسبوعين قبل هذا التاريخ). Replit لم يعد مسار النشر الحالي.

---

## الإنتاج اليوم

| الطبقة | المنصة | النطاق | ملاحظات |
|--------|--------|--------|---------|
| **الواجهة (SPA)** | Cloudflare Pages | `sabq.org` · `www.sabq.org` | `npm run build:client` → `dist/public/` · `functions/_middleware.js` |
| **الـ API** | Render (Dockerfile، Virginia) — كان Railway حتى 2026-10-21 | `api.sabq.org` | `SERVE_SPA=false` · `DB_DRIVER=pg` |
| **قاعدة البيانات** | Neon / Postgres (مشروع `sabq.org — PRODUCTION`، فرع `production`، compute 2–10 CU) | `NEON_DATABASE_URL` إن وُجد، وإلا `DATABASE_URL` في Environment الخدمة على Render | لا تشغّل `db:push` على prod؛ التغييرات عبر SQL مُراجَع (AGENTS.md § Workflow C) |
| **Redis** | Upstash عبر `REDIS_URL` في Environment الخدمة على Render | `REDIS_URL` | **مُستخدم في الإنتاج** لتخفيف جلسات Neon — انظر § Redis |
| **الوسائط** | R2 لصور الأخبار تدريجياً + Cloudflare Images fallback + R2/S3 لبقية الملفات | `media.sabq.org` | راجع [`R2_NEWS_IMAGES_ROLLOUT.md`](R2_NEWS_IMAGES_ROLLOUT.md) |

```
المتصفح → Cloudflare Pages (sabq.org)
              ├─ ملفات ثابتة (dist/public)
              ├─ functions/_middleware.js  (proxy /api، SEO، slug-redirect)
              └─ api.sabq.org (Worker sabq-api-origin: كاش حافة + توقيع IP)
                    └─ Render sabq-api-virginia.onrender.com (Express headless)
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
| **Railway (production)** | استضاف الـ API من مايو حتى 2026-10-21 ثم تعطل النشر وانتقلت الخدمات إلى Render. بقيت بيئة `staging` المعزولة فقط (انظر القسم أدناه). `railway.json` وملفات `railway*.json` تخدم staging لا الإنتاج |

---

## خدمات Render (الإنتاج منذ 2026-10-21)

Workspace واحد (`sabq@me.com`) في منطقة **Virginia**. كل خدمة تنشر تلقائياً عند أي commit على `main` إلا ما ذُكر. **Build Filters مضبوطة منذ 2026-11-02** (من لوحة Render، لا من ملف في المستودع): الـ API و`newsletter-worker` يُعاد نشرهما عند تغيّر `server/**`، `shared/**`، `package.json`، `package-lock.json`، `Dockerfile`، `.dockerignore`، `tsconfig.json`، `drizzle.config.ts`، `public/**`، `certs/**`، `docs/systems/**`؛ و`web-next` عند `web-next/**`؛ و`meetings-agent` عند `meetings-agent/**`. قبل ذلك كان أي commit على `main` (حتى تعديل iOS أو أندرويد فقط) يعيد نشر الخدمات كلها؛ في 2026-10-31 أعادت عشر commits لأندرويد نشر الـ API عشر مرات في ست ساعات. عند إضافة اعتماد جديد خارج هذه المسارات أضِفه في اللوحة لكل خدمة معنية.

| الخدمة | النوع والخطة | المصدر | ملاحظات |
|--------|---------------|--------|---------|
| `sabq.org` (`sabq-api-virginia.onrender.com`) | Web، `2c-8g`، autoscaling 1–2 نسخة (CPU 70% / ذاكرة 60%) | جذر المستودع، `Dockerfile` | هذا هو `api.sabq.org`. فعلياً نسخة واحدة طوال الوقت (مراجعة 2026-11-02)؛ health على `/health` بمهلة 5 ثوانٍ |
| `sabq-web-next-virginia` | Web، `1c-2g` | `web-next/`، `Dockerfile` | SSR العام؛ يعتمد على `seo-bundle` من الـ API، ويرد **500** للزواحف إن رد الـ API 503 |
| `sabq-newsletter-worker` | Background worker، `1c-2g` | جذر المستودع، أمر `node dist/newsletter-worker.js` | يبنيه `build:server` نفسه |
| `sabq-meetings-agent` | Background worker، `1c-2g` | `meetings-agent/`، `Dockerfile` خاص | لا يبنيه CI الجذر |
| `sabq-mirror-virginia` | Web، `0.5c-512mb` | فرع **`feature/readonly-mirror-news-subdomain`** و`Dockerfile.mirror` (غير موجود على `main`) | يقرأ من نقطة Neon للقراءة فقط `mirror`؛ الفرع متقادم عن `main` |
| `sabq-publisher` | Web، `0.5c-512mb`، قرص 1 GB على `/data` | مستودع `sabq4org/sabq-publisher` | بوت «نشر سبق» |

خدمات أخرى في نفس الـ workspace لا تخص sabq.org: `158` (منصة مدرسة) و`economy-week` (خطة Free تنام عند الخمول).

### مسار `api.sabq.org`

سجل DNS يشير إلى Cloudflare (proxied)، والمسار `api.sabq.org/*` مربوط بالـ Worker `sabq-api-origin` (`cloudflare-worker/api-origin-worker.js`، إعدادات `wrangler.api.toml`). الـ Worker يوقّع `X-Sabq-Client-IP` بسر `EDGE_PROXY_SHARED_SECRET`، ويخدم من كاش الحافة القراءات العامة (`public-api-burst-cache.js`)، وصوت «استمع»، وفيديو X، وخرائط الموقع، ثم يمرر الباقي إلى `API_ORIGIN` (الافتراضي Render). الخروج من Render يُحاسَب بالحجم، وكان نحو **25–30 GB/يوم** في مطلع نوفمبر 2026؛ أي قراءة عامة ساخنة جديدة تُضاف إلى قائمة الكاش في الـ Worker أو في `functions/_middleware.js`.

### ثغرات تشغيل مفتوحة بعد الهجرة (مراجعة 2026-11-02)

- **TheSports:** الـ API يرد «IP is not authorized» وMQTT يُرفض كل دقيقة؛ IP خروج Render غير مسجّل عند المزوّد. `/api/sports/summary` يرد 502 بعد انتظار 20 ثانية. العلاج: تسجيل IPs خروج Render الثابتة عند TheSports، أو `THESPORTS_MQTT_ENABLED=false` مؤقتاً لإيقاف الضجيج.
- **Twilio/WhatsApp:** كل إرسال يفشل بـ 401 ورمز 20003 (مصادقة)؛ `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` على Render غير صحيحة أو غائبة، فتنبيهات المحررين عبر واتساب لا تصل.
- **web-next:** صفحات `/article/*` ترد 500 لـ Googlebot وBingbot عند 503 من `seo-bundle` (نحو 45 حالة يومياً).
- **نسخة واحدة:** الحد الأدنى 1 بينما كان الإنتاج على Railway بنسختين منذ 2026-10-13. القرار عند المالك.
- **ذاكرة الـ API:** ترتفع تدريجياً بين النشرات (1.6 → 1.9 GB في 18 ساعة من حد 8 GB)؛ نمط التسرب القديم لم يُحسم.

---

## Railway staging المعزول

بيئة Railway الدائمة `staging` منفصلة عن `production` ولا تُنشأ بالنسخ منه.
مصدر النشر هو فرع GitHub الدائم `staging`، وليس `main`.

| الخدمة | المصدر | قاعدة البيانات/السلوك |
|--------|--------|------------------------|
| `sabq-staging-api` | جذر المستودع · `/railway.json` | شبكة Railway الداخلية فقط؛ PostgreSQL staging مستقل؛ `SERVE_SPA=false` وكل المجدولات/العمال معطّلة |
| `sabq-staging-web-next` | `Root Directory=/web-next` · `/web-next/railway.json` | API داخلي؛ `STAGING_NO_INDEX=true`؛ Basic Auth عبر `STAGING_ACCESS_TOKEN` |
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
read -rsp "STAGING_ACCESS_TOKEN: " STAGING_ACCESS_TOKEN; echo
curl -fsSI https://sabq-staging-web-next-staging.up.railway.app/ \
  -u "sabq:${STAGING_ACCESS_TOKEN}" \
  | grep -iE 'HTTP/|x-robots-tag|cache-control'
```

المتوقع: API يعيد `200` و`database=connected`، والويب يعيد `200` مع
`X-Robots-Tag: noindex, nofollow, noarchive` و`Cache-Control: private, no-store`.
بدون Basic Auth يجب أن يعيد الويب `401`، بينما يبقى `/health` عاماً لـ Railway.

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

> **تاريخي (قبل 2026-10-21):** ينطبق على خدمات Railway فقط. Render لا يقرأ `railway*.json`؛ ما يعيد النشر هناك هو Build Filters من لوحة Render، وقد ضُبطت في 2026-11-02 بالأنماط نفسها (انظر «خدمات Render» أعلاه).

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

**تشغيل مُستحسن مع Static IP:** (كُتب في عهد Railway) allowlist عناوين خروج Render الثابتة في Upstash إن فُعّلت القائمة.

### أين يُضبط

- **Render** → الخدمة `sabq.org` → Environment → `REDIS_URL` (مثال: `rediss://…upstash.io`)
- **ليس** على Cloudflare Pages — الواجهة لا تتصل بـ Redis

### كيف تتأكد

1. Render → Environment → `REDIS_URL` موجود
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

- **لا** `db:push` / `db:push:local` على رابط الإنتاج أو Neon — للتطوير المحلي فقط `db:push:local`. للإنتاج: ملف SQL إضافي مُراجَع في `migrations/` ينفّذه المالك في محرر Neon (AGENTS.md § Workflow C). `./push-to-production.sh` لا يستخدمه الوكلاء.
- **لا** تفترض أن الوثائق القديمة التي تذكر «Replit = production» ما زالت صحيحة — راجع هذا الملف أولاً
- عند تعديل الـ proxy أو SEO على الحافة: **`functions/_middleware.js`** على Pages، وليس `server/seoInjector.ts` وحده (الـ injector يخدم وضع single-process فقط)
- صيانة قاعدة البيانات عند إقلاع الخادم **متوقفة افتراضياً**. لا تعمل إلا مع `RUN_DB_STARTUP_MAINTENANCE=true`، ويظل `SKIP_DB_MAINTENANCE=true` مانعاً أعلى أولوية. لا تفعّلها على Render مع رابط Neon pooled؛ نفّذ أعمال الصيانة كعملية تشغيلية مقصودة وباتصال admin مباشر.
