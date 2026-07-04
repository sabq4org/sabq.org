# تنظيف تكرار إشعارات التحرير (لمرة واحدة قبل بناء الـ index)

> مرجع: PR `fix/editorial-notification-idempotency`
> التاريخ: 2026-07-04

## السياق

أضفنا **partial unique index** على جدول `editorial_notifications` بأسم
`idx_editorial_notifs_dedup` على الأعمدة `(user_id, article_id, type)` مع شرط
`WHERE article_id IS NOT NULL` (انظر `shared/schema.ts`). الهدف: منع تكرار
إشعار التحرير لنفس المستخدم+المقال+النوع تحت أيّ تزامن أو سباق طلبات.

المشكلة: لو وُجد في الإنتاج صفوف مكرّرة تاريخياً (نتيجة الـ bug قبل الإصلاح)،
فسيرفض PostgreSQL بناء الـ unique index عند تشغيل `npm run db:push`.

## الحلّ

شغّل هذا الـ SQL **يدوياً** على الإنتاج قبل أوّل `db:push` يحوي الـ index الجديد.
السكربت بصيغة `.sql` غير مُتابَع من git (لأنّ `.gitignore` يستثني `*.sql`)، لذا
نُوثّقه هنا.

### 1) معاينة العدد المتوقّع حذفه (للمراجعة قبل الحذف)

```sql
SELECT COUNT(*) FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY user_id, article_id, type
    ORDER BY created_at DESC
  ) AS rn
  FROM editorial_notifications
  WHERE article_id IS NOT NULL
) t WHERE rn > 1;
```

### 2) الحذف (أبقِ الأحدث لكل مزيج)

```sql
DELETE FROM editorial_notifications
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, article_id, type
             ORDER BY created_at DESC
           ) AS rn
    FROM editorial_notifications
    WHERE article_id IS NOT NULL
  ) t WHERE rn > 1
);
```

## خطوات النشر الآمنة

1. **staging أولاً**: شغّل معاينة العدد، ثم الحذف، ثم `npm run db:push` وراجع
   نجاح بناء الـ index.
2. **الإنتاج**: كرّر عبر قناة آمنة (psql / Railway console). **لا تستعمل
   `npm run db:push` ضد `DATABASE_URL` تحوي `prod`/`production`** — استخدم
   `./push-to-production.sh` التفاعلي (قاعدة `AGENTS.md`).
3. بعد بناء الـ index، الحارس الـ DB داخل `notifyEditorialEvent`
   (`onConflictDoNothing`) يمنع التكرار مستقبلاً بلا أيّ تدخّل يدوي إضافي.

## لماذا partial؟

`article_id` nullable عمودياً، وعند حذف مقال تُفرَّغ قيمته بـ `ON DELETE SET NULL`.
صفوف `NULL` مستثناة من الـ partial index فلا يصطدم بالأحداث التاريخية المُفرَّغة.
كل أحداث التحرير الفعلية (scheduled/published/rejected/needs_revision/archived/deleted)
تضبط `articleId` عند الإدراج، فيغطّي الـ index كل الصفوف الواقعية.
