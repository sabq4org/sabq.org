# PostgreSQL المحلي للتطوير

> **الإنتاج يبقى على Neon عبر Railway — لا تغيّر ذلك.**  
> هذا الدليل للتطوير على الجهاز فقط (`DB_DRIVER=pg` + Docker).

## الرابط المحلي (يطابق `docker-compose.yml`)

```
postgresql://sabq:sabq_password@localhost:5432/sabq_db
```

| الحقل | القيمة |
|--------|--------|
| المستخدم | `sabq` |
| كلمة المرور | `sabq_password` |
| المضيف | `localhost` |
| المنفذ | `5432` |
| القاعدة | `sabq_db` |
| السائق | `DB_DRIVER=pg` |

## التشغيل السريع

### 1) تشغيل PostgreSQL (+ Redis اختياري)

**المسار المفضّل — Docker:**

```bash
npm run db:up
# أو: docker compose up -d postgres redis
```

```bash
docker compose ps postgres
docker compose exec postgres pg_isready -U sabq -d sabq_db
```

**بديل بدون Docker (Homebrew Postgres على المنفذ 5432):** أنشئ مستخدماً وقاعدة مطابقين لـ compose ثم استخدم نفس `DATABASE_URL`:

```bash
createuser sabq WITH PASSWORD 'sabq_password';
create database sabq_db OWNER sabq;
# ثم: GRANT ALL ON SCHEMA public TO sabq; (داخل sabq_db)
```

> إن كان Homebrew يستمع على `5432`، لا تشغّل حاوية Docker على نفس المنفذ في آن واحد — أوقف أحدهما أو غيّر منفذ الـ publish في compose.

### 2) ضبط `.env.local` (يدوياً — لا يُرفع للـ git)

انسخ من `.env.example` وحدّث على الأقل:

```bash
DATABASE_URL=postgresql://sabq:sabq_password@localhost:5432/sabq_db
DB_DRIVER=pg
```

**مهم:** احذف أو علّق `NEON_DATABASE_URL` إن وُجد — وإلا سيتجاهل التطبيق `DATABASE_URL` المحلي ويتصل بـ Neon.

### 3) تطبيق المخطط محلياً فقط

```bash
npm run db:push:local
```

هذا السكربت يرفض أي hostname غير `localhost` / `127.0.0.1` ويرفض روابط تحتوي `neon.tech`.  
**لا** تستخدم `npm run db:push` مباشرة أثناء التطوير إن كان `.env.local` ما زال يشير لـ Neon.

للإنتاج: `./push-to-production.sh '<PROD_URL>'` فقط.

### Railway staging (ليس تطويراً محلياً)

قاعدة `staging` على Railway مستقلة عن Neon والإنتاج. لتجربة تغيير المخطط قبل
production استخدم خدمة `Postgres` في البيئة `staging` فقط:

```bash
# مؤقتاً فقط: أنشئ TCP proxy وسجّل id الناتج
railway tcp-proxy create --port 5432 \
  --project 49260270-79b7-40af-9e91-2599a6161f46 \
  --environment staging --service Postgres --json

railway run --project 49260270-79b7-40af-9e91-2599a6161f46 \
  --environment staging --service Postgres --no-local \
  npm run db:push:staging

# ثم أغلقه فوراً؛ قاعدة staging داخلية في الوضع الطبيعي
railway tcp-proxy delete <PROXY_ID> --yes \
  --project 49260270-79b7-40af-9e91-2599a6161f46 \
  --environment staging --service Postgres
```

`db:push:staging` يرفض التشغيل إن لم تكن `RAILWAY_ENVIRONMENT_NAME=staging`،
أو كان المشروع/الخدمة مختلفين، أو ظهر `NEON_DATABASE_URL`، أو لم يكن المضيف
Railway Postgres. كما يفعّل امتداد `vector` المطلوب قبل تطبيق مخطط Drizzle.

### 4) Seed (اختياري)

```bash
DB_DRIVER=pg DATABASE_URL='postgresql://sabq:sabq_password@localhost:5432/sabq_db' \
  npx tsx scripts/create-admin.ts

# RBAC إن وُجد ملف seed محلي (غالباً gitignored):
# DB_DRIVER=pg DATABASE_URL='…' npx tsx scripts/seed-rbac.ts
```

### 5) تشغيل التطبيق

```bash
npm run dev
```

عند الإقلاع يجب أن ترى شيئاً مثل:  
`[DB] Initializing connection (Standard PG via node-postgres)`  
وليس مسار Neon WebSocket.

### 6) إيقاف البيئة دون حذف البيانات

```bash
npm run db:down
# أو: docker compose stop postgres redis
```

الـ volume `postgres_data` يبقى — البيانات محفوظة.  
لحذف البيانات نهائياً (تطوير فقط): `docker compose down -v` — **احذر**.

---

## ماذا عن فرع Neon `test`؟

- لا نحذفه ولا نعطّله من هنا.
- أوقف الاعتماد عليه في `.env.local` فقط (إزالة `NEON_DATABASE_URL`).
- أرشفة/حذف الفرع لاحقاً قرار يدوي من Neon Console إن رغبت.

## أوامر مفيدة

| أمر | المعنى |
|-----|--------|
| `npm run db:up` | تشغيل Postgres + Redis |
| `npm run db:down` | إيقافهما مع إبقاء البيانات |
| `npm run db:push:local` | schema → محلي فقط |
| `npm run db:push:staging` | schema → Railway staging المعزول فقط |
| `docker compose --profile full up -d` | اختياري: حاوية التطبيق كاملة |
