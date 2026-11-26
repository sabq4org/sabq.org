-- «محادثة المناوب»: رسائل ثنائية بين المسؤول ومديري المحتوى داخل لوحة التحكم، مع آخر ظهور.
-- إضافي فقط: جدولان جديدان، لا يلمس أي جدول أو صف موجود. آمن للتكرار.
-- يُنفَّذ بمالك الجداول في محرر Neon قبل دمج الـPR.
-- قبل التنفيذ: مسارات /api/duty-chat/* تعيد 503 والشريط وزر «راسل» لا يظهران، ولا يتأثر شيء آخر.
-- التراجع (لا يُنفذ إلا بقرار صريح):
--   DROP TABLE IF EXISTS duty_chat_messages;
--   DROP TABLE IF EXISTS duty_chat_presence;
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS duty_chat_messages (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  -- normal = رسالة عادية، alert = «تنبيه» يطلب من المستلم زر «استلمت»
  kind text NOT NULL DEFAULT 'normal' CHECK (kind IN ('normal', 'alert')),
  -- المرفق في التخزين الخاص (R2)، يُقرأ عبر /api/duty-chat/attachments/:id لطرفي المحادثة فقط
  attachment_key text,
  attachment_name text,
  attachment_mime text,
  attachment_size integer,
  created_at timestamp NOT NULL DEFAULT now(),
  delivered_at timestamp,
  read_at timestamp,
  acked_at timestamp
);
CREATE INDEX IF NOT EXISTS idx_duty_chat_messages_pair ON duty_chat_messages (sender_id, recipient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_duty_chat_messages_recipient ON duty_chat_messages (recipient_id, created_at);

CREATE TABLE IF NOT EXISTS duty_chat_presence (
  user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_seen_at timestamp NOT NULL DEFAULT now()
);

-- حساب التطبيق: قراءة وإضافة وتحديث فقط (لا حذف).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON duty_chat_messages TO sabq_runtime;
    GRANT SELECT, INSERT, UPDATE ON duty_chat_presence TO sabq_runtime;
  END IF;
END $$;

COMMIT;

-- التحقق بعد التنفيذ (المتوقع: الجدولان موجودان، وصلاحيات sabq_runtime كلها true):
SELECT to_regclass('public.duty_chat_messages') AS messages_table,
       to_regclass('public.duty_chat_presence') AS presence_table;
SELECT has_table_privilege('sabq_runtime', 'public.duty_chat_messages', 'SELECT') AS msg_select,
       has_table_privilege('sabq_runtime', 'public.duty_chat_messages', 'INSERT') AS msg_insert,
       has_table_privilege('sabq_runtime', 'public.duty_chat_messages', 'UPDATE') AS msg_update,
       has_table_privilege('sabq_runtime', 'public.duty_chat_presence', 'SELECT') AS presence_select,
       has_table_privilege('sabq_runtime', 'public.duty_chat_presence', 'INSERT') AS presence_insert,
       has_table_privilege('sabq_runtime', 'public.duty_chat_presence', 'UPDATE') AS presence_update
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime');
