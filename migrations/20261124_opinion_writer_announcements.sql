-- إعلانات كتّاب الرأي + متابعة التفاعل بالأسماء (من رأى، من حمّل أو صوّت أو فتح).
-- إضافي فقط: جدولان جديدان وفهارسهما، لا يلمس أي جدول أو صف موجود. آمن للتكرار.
-- يُنفَّذ بمالك الجداول في محرر Neon قبل دمج الـPR.
-- يعتمد على opinion_writer_files و users (موجودان).
-- التراجع (لا يُنفذ إلا بقرار صريح):
--   DROP TABLE IF EXISTS opinion_writer_engagement;
--   DROP TABLE IF EXISTS opinion_writer_announcements;
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS opinion_writer_announcements (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  kind varchar(16) NOT NULL,
  title text NOT NULL,
  body text,
  file_id varchar REFERENCES opinion_writer_files(id) ON DELETE SET NULL,
  link_url text,
  poll_options text[] NOT NULL DEFAULT '{}'::text[],
  expires_at timestamp NOT NULL,
  email_requested boolean NOT NULL DEFAULT false,
  emailed_at timestamp,
  last_reminded_at timestamp,
  reminder_count integer NOT NULL DEFAULT 0,
  created_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  archived_at timestamp
);

CREATE INDEX IF NOT EXISTS idx_opinion_writer_announcements_expires
  ON opinion_writer_announcements (expires_at);

CREATE TABLE IF NOT EXISTS opinion_writer_engagement (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type varchar(24) NOT NULL,
  subject_id varchar NOT NULL,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action varchar(16) NOT NULL,
  option_index integer,
  count integer NOT NULL DEFAULT 1,
  first_at timestamp NOT NULL DEFAULT now(),
  last_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_opinion_writer_engagement
  ON opinion_writer_engagement (subject_type, subject_id, user_id, action);
CREATE INDEX IF NOT EXISTS idx_opinion_writer_engagement_subject
  ON opinion_writer_engagement (subject_type, subject_id);

-- حساب التطبيق: قراءة وإضافة وتحديث فقط (الإخفاء عبر archived_at، لا حذف).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE opinion_writer_announcements TO sabq_runtime;
    GRANT SELECT, INSERT, UPDATE ON TABLE opinion_writer_engagement TO sabq_runtime;
  END IF;
END $$;

COMMIT;

-- التحقق بعد التنفيذ (المتوقع: الجدولان موجودان وكل الصلاحيات true):
SELECT to_regclass('public.opinion_writer_announcements') AS announcements_table,
       to_regclass('public.opinion_writer_engagement') AS engagement_table;
SELECT t AS table_name,
       has_table_privilege('sabq_runtime', t, 'SELECT') AS can_select,
       has_table_privilege('sabq_runtime', t, 'INSERT') AS can_insert,
       has_table_privilege('sabq_runtime', t, 'UPDATE') AS can_update
FROM unnest(ARRAY['public.opinion_writer_announcements', 'public.opinion_writer_engagement']) AS t
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime');
