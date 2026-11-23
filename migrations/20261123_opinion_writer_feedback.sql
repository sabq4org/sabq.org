-- استبيان كتّاب الرأي: الاهتمامات (اختيار متعدد) ومقترحات التطوير.
-- إضافي فقط: جدول جديد وفهارس جديدة، لا يلمس أي جدول أو صف موجود. آمن للتكرار.
-- يُنفَّذ بمالك الجداول في محرر Neon قبل دمج الـPR.
-- التراجع (لا يُنفذ إلا بقرار صريح):
--   DROP TABLE IF EXISTS opinion_writer_feedback;
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS opinion_writer_feedback (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interests text[] NOT NULL DEFAULT '{}'::text[],
  other_interest text,
  suggestions text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_opinion_writer_feedback_user
  ON opinion_writer_feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_opinion_writer_feedback_updated
  ON opinion_writer_feedback (updated_at);

-- حساب التطبيق: قراءة وإضافة وتحديث (الكاتب يعدّل رده؛ لا حاجة لـ DELETE).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE opinion_writer_feedback TO sabq_runtime;
  END IF;
END $$;

COMMIT;

-- التحقق بعد التنفيذ (المتوقع: الجدول موجود وصلاحيات sabq_runtime كلها true):
SELECT to_regclass('public.opinion_writer_feedback') AS feedback_table;
SELECT has_table_privilege('sabq_runtime', 'public.opinion_writer_feedback', 'SELECT') AS can_select,
       has_table_privilege('sabq_runtime', 'public.opinion_writer_feedback', 'INSERT') AS can_insert,
       has_table_privilege('sabq_runtime', 'public.opinion_writer_feedback', 'UPDATE') AS can_update
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime');
