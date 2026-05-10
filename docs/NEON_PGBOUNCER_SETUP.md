# تفعيل PgBouncer في Neon (Connection Pooling)

## لماذا هذا مهم؟

تفعيل PgBouncer يقلل زمن إنشاء الاتصالات بشكل كبير ويسمح للخادم بالتعامل مع آلاف المستخدمين المتزامنين بكفاءة.

---

## خطوات التفعيل

### 1. الدخول إلى Neon Console

اذهب إلى: [console.neon.tech](https://console.neon.tech)

### 2. اختيار المشروع

- اختر مشروع `sabq-smart-prod`

### 3. الانتقال إلى Endpoints

- من القائمة الجانبية: **Branches** → اختر الفرع الرئيسي
- أو: **Settings** → **Endpoints**

### 4. تفعيل Connection Pooler

1. انقر على **Compute endpoint** الخاص بك
2. ابحث عن قسم **Connection Pooler** أو **PgBouncer**
3. فعّل الخيار: **Enable pooling**
4. اختر الإعدادات:
   - **Pool Mode**: `transaction` (موصى به)
   - **Pool Size**: افتراضي أو حسب الحاجة

### 5. نسخ Connection String الجديد

بعد التفعيل، ستحصل على **Pooled connection string** جديد:

```
postgres://user:password@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require
```

لاحظ: الفرق هو إضافة `-pooler` في اسم الـ endpoint

### 6. تحديث متغيرات البيئة

في Replit:
1. اذهب إلى **Secrets**
2. حدّث `NEON_DATABASE_URL` بـ Pooled connection string الجديد
3. أعد تشغيل التطبيق

---

## التحقق من التفعيل

بعد التحديث، يجب أن ترى في السجلات:
```
🔗 Initializing database connection (External Neon)...
✅ Database connection initialized successfully
📊 Pool config: max=25, min=2, idleTimeout=30s, connTimeout=2s
```

---

## النتائج المتوقعة

| المقياس | قبل PgBouncer | بعد PgBouncer |
|---------|--------------|---------------|
| زمن إنشاء الاتصال | ~100-500ms | ~10-50ms |
| الاتصالات المتاحة | محدودة | مجمعة ومشتركة |
| الأداء مع 2000 زائر | بطيء | سريع |

---

## ملاحظات مهمة

- **لا تغير إعدادات Pool في الكود** - الإعدادات الحالية في `server/db.ts` محسنة للعمل مع PgBouncer
- **استخدم Transaction mode** - هذا الوضع يعمل بشكل أفضل مع تطبيقات الويب
- **اختبر قبل الإنتاج** - تأكد من عمل كل شيء في بيئة التطوير أولاً

---

*آخر تحديث: يناير 2026*
