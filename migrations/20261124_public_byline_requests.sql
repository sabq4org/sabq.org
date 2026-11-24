-- «صفتك تحت اسمك»: طلبات الكاتب والمراسل لتعديل الصفة والنبذة العامتين (PR البند 2).
-- إضافي فقط: جدول جديد وفهرسه، لا يلمس أي جدول أو صف موجود. آمن للتكرار.
-- يُنفَّذ بمالك الجداول في محرر Neon قبل دمج الـPR.
-- التراجع (لا يُنفذ إلا بقرار صريح):
--   DROP TABLE IF EXISTS public_byline_requests;
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public_byline_requests (
  user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  title_ar text,
  bio_ar text,
  status varchar(16) NOT NULL,
  review_note text,
  submitted_at timestamp NOT NULL DEFAULT now(),
  reviewed_at timestamp,
  reviewed_by varchar REFERENCES users(id),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS public_byline_requests_status_idx
  ON public_byline_requests (status);

-- حساب التطبيق: قراءة وإضافة وتحديث فقط (السحب حالة withdrawn، لا حذف).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public_byline_requests TO sabq_runtime;
  END IF;
END $$;

COMMIT;

-- التحقق بعد التنفيذ (المتوقع: true ثلاث مرات، أو صف فارغ إن لم يوجد sabq_runtime):
SELECT has_table_privilege('sabq_runtime', 'public_byline_requests', 'SELECT') AS can_select,
       has_table_privilege('sabq_runtime', 'public_byline_requests', 'INSERT') AS can_insert,
       has_table_privilege('sabq_runtime', 'public_byline_requests', 'UPDATE') AS can_update
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime');
