-- «غرفة المناوبة»: تغطية بوقت محدد بدل الوردية كاملة.
-- إضافي فقط: عمودان اختياريان في content_duty_exceptions، لا يغيّر أي صف موجود
-- (الصفوف القديمة تبقى NULL = الوردية كاملة كما هي اليوم). آمن للتكرار (IF NOT EXISTS).
-- يُنفَّذ بمالك الجداول في محرر Neon قبل دمج الـPR.
-- الصلاحيات: sabq_runtime يملك SELECT, INSERT, UPDATE على الجدول كله من 20261122، فتشمل العمودين.
-- التراجع: ALTER TABLE content_duty_exceptions DROP COLUMN IF EXISTS start_minute, DROP COLUMN IF EXISTS end_minute;
--          (بعد إرجاع الكود فقط؛ لا يُنفذ إلا بقرار صريح)
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE content_duty_exceptions
  ADD COLUMN IF NOT EXISTS start_minute integer CHECK (start_minute BETWEEN 0 AND 1440),
  ADD COLUMN IF NOT EXISTS end_minute integer CHECK (end_minute BETWEEN 0 AND 1440);

COMMIT;

-- التحقق بعد التنفيذ (يجب أن يظهر العمودان، وصلاحيتا الإضافة والتعديل true):
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'content_duty_exceptions' AND column_name IN ('start_minute', 'end_minute');
SELECT has_table_privilege('sabq_runtime', 'public.content_duty_exceptions', 'INSERT') AS can_insert,
       has_table_privilege('sabq_runtime', 'public.content_duty_exceptions', 'UPDATE') AS can_update
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime');
