-- مركز تنبيهات «مكتب سبق» (staff_desk_events) — مطابق لتعريفه في shared/schema.ts.
-- إضافي فقط: جدول جديد لا يلمس أي جدول موجود. آمن للتكرار (IF NOT EXISTS).
-- يُنفَّذ بمالك الجداول (neondb_owner) قبل دمج الكود. حساب API هو sabq_runtime.
-- التراجع: DROP TABLE IF EXISTS staff_desk_events;  (لا يُنفذ إلا بقرار صريح)
BEGIN;

CREATE TABLE IF NOT EXISTS staff_desk_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  kind varchar(32) NOT NULL,
  category varchar(16) NOT NULL,
  title text NOT NULL,
  actor_name text,
  actor_user_id varchar,
  target_id varchar NOT NULL,
  link_url text,
  scheduled_at timestamptz,
  dedupe_key varchar(200) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- الجدول جديد وفارغ: الفهارس العادية داخل المعاملة آمنة.
CREATE UNIQUE INDEX IF NOT EXISTS staff_desk_events_dedupe_uidx ON staff_desk_events (dedupe_key);
CREATE INDEX IF NOT EXISTS staff_desk_events_created_idx ON staff_desk_events (created_at);
CREATE INDEX IF NOT EXISTS staff_desk_events_category_created_idx ON staff_desk_events (category, created_at);

-- التطبيق يسجّل الأحداث ويقرؤها فقط: قراءة وإضافة، بلا تحديث ولا حذف.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT ON TABLE public.staff_desk_events TO sabq_runtime;
  ELSE
    RAISE EXCEPTION 'role sabq_runtime not found — grant manually to the API role';
  END IF;
END $$;

COMMIT;

-- يجب أن يكون العمودان true.
SELECT
  has_table_privilege('sabq_runtime', 'public.staff_desk_events', 'SELECT') AS can_read,
  has_table_privilege('sabq_runtime', 'public.staff_desk_events', 'INSERT') AS can_insert;
