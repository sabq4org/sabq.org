-- نقل صور Cloudflare Images النشطة إلى R2: صلاحيات حساب التشغيل على جدول المقابلة.
-- الجدول image_migrations موجود في الإنتاج (فارغ) ومعرّف في shared/schema.ts؛
-- هذا الملف لا ينشئ ولا يغيّر أي جدول، يمنح فقط القراءة والإدخال والتحديث (بلا حذف).
-- يُنفَّذ بمالك الجداول (neondb_owner) في محرر Neon قبل دمج الـPR.
-- التراجع: REVOKE SELECT, INSERT, UPDATE ON public.image_migrations FROM sabq_runtime;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    RAISE EXCEPTION 'role sabq_runtime does not exist';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON TABLE public.image_migrations TO sabq_runtime;
GRANT USAGE, SELECT ON SEQUENCE public.image_migrations_id_seq TO sabq_runtime;

-- يجب أن تكون القيم الأربع true.
SELECT
  has_table_privilege('sabq_runtime', 'public.image_migrations', 'SELECT') AS can_read,
  has_table_privilege('sabq_runtime', 'public.image_migrations', 'INSERT') AS can_insert,
  has_table_privilege('sabq_runtime', 'public.image_migrations', 'UPDATE') AS can_update,
  has_sequence_privilege('sabq_runtime', 'public.image_migrations_id_seq', 'USAGE') AS can_use_sequence;
