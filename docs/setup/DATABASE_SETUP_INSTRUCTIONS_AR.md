# إعداد قاعدة البيانات — سبق

## التطوير المحلي (المسار الحالي)

استخدم **PostgreSQL عبر Docker** على جهازك، وليس فرع Neon للتطوير.

الدليل الكامل: [`LOCAL_POSTGRES_AR.md`](./LOCAL_POSTGRES_AR.md)

```bash
npm run db:up
# في .env.local: DATABASE_URL=postgresql://sabq:sabq_password@localhost:5432/sabq_db
#               DB_DRIVER=pg   — وبدون NEON_DATABASE_URL
npm run db:push:local
npm run dev
```

- `npm run db:push:local` يطبّق المخطط على `localhost` فقط ويرفض Neon/الإنتاج.
- الإنتاج: Neon على Railway — ادفع المخطط عبر `./push-to-production.sh '<PROD_URL>'` فقط.

---

## ملاحظة تاريخية (Neon endpoint معطّل)

المحتوى السابق عن تفعيل endpoint Neon كان لبيئة تطوير قديمة على فرع Neon.  
ذلك المسار **لم يعد موصى به للتطوير**. أبقِ Neon للإنتاج (أو تجارب بعيدة مقصودة)، وطوّر على Postgres المحلي.
