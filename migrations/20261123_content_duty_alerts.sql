-- «عين المناوبة»: سجل تنبيهات ورديات مديري المحتوى + صلاحية القراءة content_duty.monitor.
-- إضافي فقط: جدول جديد وصف صلاحية جديد، لا يلمس أي جدول أو صف موجود. آمن للتكرار.
-- يُنفَّذ بمالك الجداول في محرر Neon قبل دمج الـPR.
-- قبل التنفيذ: المحرك يكتب سطرًا واحدًا في السجل ويتوقف بهدوء، والخادم لا يتأثر.
-- الصلاحية ليست في أي دور ولا تُمنح لأحد هنا (المدير العام يمر عبر "*").
-- التراجع (لا يُنفذ إلا بقرار صريح):
--   DROP TABLE IF EXISTS content_duty_alerts;
--   DELETE FROM permissions WHERE code = 'content_duty.monitor';
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS content_duty_alerts (
  id bigserial PRIMARY KEY,
  -- مفتاح منع التكرار: <وردية>:<مستخدم>:<نوع>[:<جولة>] أو breaking:<مادة>:<دقيقة>
  dedupe_key text NOT NULL,
  kind text NOT NULL,
  user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  occurrence_key text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  -- تولّد في ساعات الهدوء: يُرسل في ملخص الصباح عند هذا الوقت (UTC)
  deferred_until timestamp,
  -- التوصيل عبر DUTY_ALERT_WEBHOOK_URL: محاولات محدودة، وحجز ذري قبل الإرسال
  delivered_at timestamp,
  delivery_attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamp,
  last_error text,
  CONSTRAINT content_duty_alerts_dedupe_key_key UNIQUE (dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_content_duty_alerts_occurrence ON content_duty_alerts (occurrence_key);
CREATE INDEX IF NOT EXISTS idx_content_duty_alerts_created ON content_duty_alerts (created_at);
CREATE INDEX IF NOT EXISTS idx_content_duty_alerts_pending ON content_duty_alerts (id) WHERE delivered_at IS NULL;

-- حساب التطبيق: إضافة وقراءة وتحديث حالة التوصيل، وحذف ما زاد على 90 يومًا فقط.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON content_duty_alerts TO sabq_runtime;
    GRANT USAGE, SELECT ON SEQUENCE content_duty_alerts_id_seq TO sabq_runtime;
  END IF;
END $$;

INSERT INTO permissions (code, label, label_ar, module, description)
SELECT
  'content_duty.monitor',
  'Monitor content duty shifts (bot API, read-only)',
  'متابعة ورديات المناوبة (واجهة البوت، قراءة فقط)',
  'content_duty',
  'يقرأ تنبيهات «عين المناوبة» وحالة الورديات وتقاريرها عبر /api/internal/bot-desk/duty/*. قراءة فقط؛ لا يعدّل الجدول ولا الإعدادات ولا يعمل في مسارات اللوحة.'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'content_duty.monitor');

COMMIT;

-- التحقق بعد التنفيذ (المتوقع: الجدول موجود، صف صلاحية واحد، لا دور يملكها، وصلاحيات sabq_runtime كلها true):
SELECT to_regclass('public.content_duty_alerts') AS alerts_table,
       (SELECT count(*) FROM permissions WHERE code = 'content_duty.monitor') AS permission_rows,
       (SELECT count(*) FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
         WHERE p.code = 'content_duty.monitor') AS roles_with_permission;
SELECT has_table_privilege('sabq_runtime', 'public.content_duty_alerts', 'SELECT') AS can_select,
       has_table_privilege('sabq_runtime', 'public.content_duty_alerts', 'INSERT') AS can_insert,
       has_table_privilege('sabq_runtime', 'public.content_duty_alerts', 'UPDATE') AS can_update,
       has_table_privilege('sabq_runtime', 'public.content_duty_alerts', 'DELETE') AS can_delete,
       has_sequence_privilege('sabq_runtime', 'public.content_duty_alerts_id_seq', 'USAGE') AS can_use_seq
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime');
