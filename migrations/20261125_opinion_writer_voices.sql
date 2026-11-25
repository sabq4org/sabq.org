-- «صوتي» لكتّاب الرأي: تسجيل صوت الكاتب لاستنساخه في ElevenLabs واستخدامه لمقالاته فقط وباختياره.
-- إضافي فقط: جدول جديد وفهرس جديد، لا يلمس أي جدول أو صف موجود. آمن للتكرار.
-- يُنفَّذ بمالك الجداول في محرر Neon قبل دمج الـPR.
-- صف واحد لكل كاتب (user_id فريد). الموافقة وسحبها تُسجَّل أيضًا في سجل النشاط.
-- التراجع (لا يُنفذ إلا بقرار صريح):
--   DROP TABLE IF EXISTS opinion_writer_voices;
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS opinion_writer_voices (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status varchar(20) NOT NULL DEFAULT 'processing',
  consent_version varchar(20),
  consented_at timestamp,
  consent_withdrawn_at timestamp,
  sample_storage_key text,
  sample_mime varchar(60),
  sample_bytes integer,
  sample_seconds integer,
  sample_deleted_at timestamp,
  preview_storage_key text,
  elevenlabs_voice_id varchar(64),
  error_message text,
  ready_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- لمهمة حذف التسجيل الأصلي بعد 30 يومًا من الجاهزية.
CREATE INDEX IF NOT EXISTS idx_opinion_writer_voices_sample_purge
  ON opinion_writer_voices (ready_at)
  WHERE sample_storage_key IS NOT NULL;

-- حساب التطبيق: قراءة وإضافة وتحديث فقط (الحذف حالة status='deleted' مع مسح المفاتيح).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE opinion_writer_voices TO sabq_runtime;
  END IF;
END $$;

COMMIT;

-- التحقق بعد التنفيذ (المتوقع: الجدول موجود وصلاحيات sabq_runtime كلها true):
SELECT to_regclass('public.opinion_writer_voices') AS voices_table;
SELECT has_table_privilege('sabq_runtime', 'public.opinion_writer_voices', 'SELECT') AS can_select,
       has_table_privilege('sabq_runtime', 'public.opinion_writer_voices', 'INSERT') AS can_insert,
       has_table_privilege('sabq_runtime', 'public.opinion_writer_voices', 'UPDATE') AS can_update
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime');
