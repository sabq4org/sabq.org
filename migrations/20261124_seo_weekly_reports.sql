-- تقرير البحث الأسبوعي (seo_weekly_reports) — مطابق لتعريفه في shared/schema.ts.
-- إضافي فقط: جدول جديد لا يلمس أي جدول موجود. آمن للتكرار (IF NOT EXISTS).
-- يُنفَّذ بمالك الجداول (neondb_owner) قبل دمج الكود. حساب API هو sabq_runtime.
-- التراجع: DROP TABLE IF EXISTS seo_weekly_reports;  (لا يُنفذ إلا بقرار صريح)
BEGIN;

CREATE TABLE IF NOT EXISTS seo_weekly_reports (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start text NOT NULL,
  period_end text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  created_by varchar,
  emailed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- قراءة وإضافة وتحديث (قرارات الفرص والتجارب). لا حذف.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.seo_weekly_reports TO sabq_runtime;
  ELSE
    RAISE EXCEPTION 'role sabq_runtime not found — grant manually to the API role';
  END IF;
END $$;

COMMIT;

-- يجب أن تكون الأعمدة الثلاثة true.
SELECT
  has_table_privilege('sabq_runtime', 'public.seo_weekly_reports', 'SELECT') AS can_read,
  has_table_privilege('sabq_runtime', 'public.seo_weekly_reports', 'INSERT') AS can_insert,
  has_table_privilege('sabq_runtime', 'public.seo_weekly_reports', 'UPDATE') AS can_update;
