-- طلبات تسجيل الناشرين من الرابط العام /publisher/register — مطابق لـ publisherApplications في shared/schema.ts.
-- إضافي فقط: جدول جديد لا يلمس أي جدول موجود. آمن للتكرار (IF NOT EXISTS).
-- يُنفَّذ بمالك الجداول (neondb_owner) في محرر Neon قبل دمج الـPR.
-- التراجع (بقرار صريح فقط): DROP TABLE IF EXISTS publisher_applications;
BEGIN;

CREATE TABLE IF NOT EXISTS publisher_applications (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_name text NOT NULL,
  agency_name_en text,
  contact_person text NOT NULL,
  contact_person_en text,
  email text NOT NULL,
  phone_number text NOT NULL,
  logo_url text NOT NULL,
  commercial_registration text,
  tax_number text,
  address text,
  login_first_name text NOT NULL,
  login_last_name text NOT NULL,
  login_email text NOT NULL,
  consent_at timestamp NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by varchar CONSTRAINT publisher_applications_reviewed_by_users_id_fk REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamp,
  review_notes text,
  created_publisher_id varchar CONSTRAINT publisher_applications_created_publisher_id_publishers_id_fk REFERENCES publishers(id) ON DELETE SET NULL,
  created_user_id varchar CONSTRAINT publisher_applications_created_user_id_users_id_fk REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS publisher_applications_status_idx ON publisher_applications (status, created_at);
CREATE INDEX IF NOT EXISTS publisher_applications_login_email_idx ON publisher_applications (login_email);

-- حساب التطبيق: قراءة وإضافة وتحديث، بلا حذف.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.publisher_applications TO sabq_runtime;
  ELSE
    RAISE EXCEPTION 'sabq_runtime role not found';
  END IF;
END $$;

COMMIT;

-- يجب أن تكون الأعمدة الثلاثة true.
SELECT
  has_table_privilege('sabq_runtime', 'public.publisher_applications', 'SELECT') AS can_read,
  has_table_privilege('sabq_runtime', 'public.publisher_applications', 'INSERT') AS can_insert,
  has_table_privilege('sabq_runtime', 'public.publisher_applications', 'UPDATE') AS can_update;
