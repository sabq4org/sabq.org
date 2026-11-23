-- ملفات ومستندات كتّاب الرأي (PDF مثل محاضر الاجتماعات والتعاميم):
-- إضافي فقط: جدول جديد وفهرس جديد، لا يلمس أي جدول أو صف موجود. آمن للتكرار.
-- يُنفَّذ بمالك الجداول في محرر Neon قبل دمج الـPR.
-- التراجع (لا يُنفذ إلا بقرار صريح):
--   DROP TABLE IF EXISTS opinion_writer_files;
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS opinion_writer_files (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  storage_key text NOT NULL,
  original_file_name text NOT NULL,
  mime_type varchar(120) NOT NULL DEFAULT 'application/pdf',
  file_size_bytes integer NOT NULL,
  uploaded_by varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamp NOT NULL DEFAULT now(),
  deleted_at timestamp
);

CREATE INDEX IF NOT EXISTS idx_opinion_writer_files_created
  ON opinion_writer_files (created_at DESC)
  WHERE deleted_at IS NULL;

-- حساب التطبيق: قراءة وإضافة وتحديث (للحذف اللطيف deleted_at فقط — لا حاجة لصلاحية DELETE).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE opinion_writer_files TO sabq_runtime;
  END IF;
END $$;

COMMIT;

-- التحقق بعد التنفيذ (المتوقع: الجدول موجود وصلاحيات sabq_runtime كلها true):
SELECT to_regclass('public.opinion_writer_files') AS files_table;
SELECT has_table_privilege('sabq_runtime', 'public.opinion_writer_files', 'SELECT') AS can_select,
       has_table_privilege('sabq_runtime', 'public.opinion_writer_files', 'INSERT') AS can_insert,
       has_table_privilege('sabq_runtime', 'public.opinion_writer_files', 'UPDATE') AS can_update
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime');
