-- الاسم الرباعي الرسمي للشهادات فقط (لا يظهر في المقالات)
-- محلياً: npm run db:push:local | إنتاج: نفّذ يدوياً

BEGIN;

ALTER TABLE staff_profiles
  ADD COLUMN IF NOT EXISTS official_full_name_ar text;

COMMIT;
