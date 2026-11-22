-- «غرفة المناوبة»: مناوبات إدارة المحتوى ومؤشرات الحضور.
-- إضافي فقط: ثلاثة جداول جديدة، لا يلمس أي جدول أو صف موجود. آمن للتكرار (IF NOT EXISTS).
-- يُنفَّذ بمالك الجداول في محرر Neon قبل دمج الـPR.
-- التراجع: DROP TABLE IF EXISTS staff_activity_minutes, content_duty_exceptions, content_duty_shifts;
--          (لا يُنفذ إلا بقرار صريح؛ الكود يعيد 503 ويخفي البطاقة إذا غابت الجداول)
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS content_duty_shifts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  days jsonb NOT NULL,
  start_minute integer NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute integer NOT NULL CHECK (end_minute BETWEEN 0 AND 1440),
  active boolean NOT NULL DEFAULT true,
  created_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_duty_shifts_user ON content_duty_shifts (user_id);

CREATE TABLE IF NOT EXISTS content_duty_exceptions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_date date NOT NULL,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cover_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  note text,
  created_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  cancelled_at timestamp
);
CREATE INDEX IF NOT EXISTS idx_content_duty_exceptions_date ON content_duty_exceptions (duty_date);

CREATE TABLE IF NOT EXISTS staff_activity_minutes (
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  minute timestamp NOT NULL,
  kind text NOT NULL DEFAULT 'view',
  PRIMARY KEY (user_id, minute)
);
CREATE INDEX IF NOT EXISTS idx_staff_activity_minutes_minute ON staff_activity_minutes (minute);

-- حساب التطبيق: الورديات والاستثناءات تُعطَّل ولا تُحذف (لا DELETE).
-- دقائق النشاط: UPDATE لترقية view إلى action، وDELETE لحذف ما يزيد على 90 يومًا فقط.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON content_duty_shifts, content_duty_exceptions TO sabq_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON staff_activity_minutes TO sabq_runtime;
  END IF;
END $$;

COMMIT;

-- التحقق بعد التنفيذ:
SELECT to_regclass('public.content_duty_shifts') AS shifts,
       to_regclass('public.content_duty_exceptions') AS exceptions,
       to_regclass('public.staff_activity_minutes') AS activity;
SELECT table_name,
       has_table_privilege('sabq_runtime', 'public.' || table_name, 'INSERT') AS can_insert,
       has_table_privilege('sabq_runtime', 'public.' || table_name, 'UPDATE') AS can_update,
       has_table_privilege('sabq_runtime', 'public.' || table_name, 'DELETE') AS can_delete
FROM (VALUES ('content_duty_shifts'), ('content_duty_exceptions'), ('staff_activity_minutes')) t(table_name)
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime');
