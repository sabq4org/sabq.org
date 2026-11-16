-- تدوير رمز النشر في البريد الذكي: عمر الرمز، تاريخ انتهائه، ومهلة للرمز السابق.
-- إضافة فقط (أعمدة تقبل NULL بلا قيمة افتراضية): لا تعيد كتابة الجدول ولا تغيّر صفًا قائمًا.
-- يُنفَّذ في محرر Neon قبل دمج الـPR. آمن عند إعادة التنفيذ.
-- الجدول قائم وصلاحيات sabq_runtime عليه تشمل الأعمدة الجديدة تلقائيًا.

ALTER TABLE trusted_email_senders
  ADD COLUMN IF NOT EXISTS token_created_at timestamp,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamp,
  ADD COLUMN IF NOT EXISTS previous_token text,
  ADD COLUMN IF NOT EXISTS previous_token_valid_until timestamp;

-- تحقق: يجب أن تعود 4 صفوف.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'trusted_email_senders'
  AND column_name IN ('token_created_at', 'token_expires_at', 'previous_token', 'previous_token_valid_until')
ORDER BY column_name;

-- تحقق من صلاحية حساب التشغيل (يجب أن تعود true للثلاث).
SELECT has_table_privilege('sabq_runtime', 'trusted_email_senders', 'SELECT') AS can_select,
       has_table_privilege('sabq_runtime', 'trusted_email_senders', 'INSERT') AS can_insert,
       has_table_privilege('sabq_runtime', 'trusted_email_senders', 'UPDATE') AS can_update;
