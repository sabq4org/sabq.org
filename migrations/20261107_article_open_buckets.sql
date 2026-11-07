-- «مرات فتح الأخبار» الحقيقية في داشبورد غرفة الأخبار — مطابق لـ articleOpenBuckets
-- في shared/schema.ts. جدول جديد صغير (صف لكل 10 دقائق ≈ 144 صفًا يوميًا).
-- إضافي فقط: لا يلمس أي جدول قائم. آمن للتكرار.
-- يُنفَّذ بمالك الجداول في Neon SQL Editor قبل دمج الكود
-- (الكود يتحمّل غيابه ويرجع للحساب القديم، لكن العدّاد لا يبدأ إلا بوجوده).
--
-- التراجع (بقرار صريح فقط): الجدول لا يحمل بيانات أخبار؛ يكفي إيقاف الكود.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS article_open_buckets (
  bucket_start timestamptz PRIMARY KEY,
  opens integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.article_open_buckets TO sabq_runtime;
  ELSE
    RAISE EXCEPTION 'sabq_runtime role not found — grant manually before deploying';
  END IF;
END $$;
COMMIT;

-- تحقق: كل القيم true
SELECT
  to_regclass('public.article_open_buckets') IS NOT NULL AS table_ready,
  has_table_privilege('sabq_runtime', 'public.article_open_buckets', 'SELECT') AS can_read,
  has_table_privilege('sabq_runtime', 'public.article_open_buckets', 'INSERT') AS can_insert,
  has_table_privilege('sabq_runtime', 'public.article_open_buckets', 'UPDATE') AS can_update;
