-- فحص ظل لتطابق العنوان مع المتن (Gemini Decisions) — جدول article_title_checks،
-- مطابق لتعريف articleTitleChecks في shared/schema.ts.
-- إضافي فقط: جدول جديد وفهرس عليه، لا يلمس أي جدول موجود. آمن للتكرار (IF NOT EXISTS).
-- يُنفَّذ بمالك الجداول (neondb_owner) في محرر Neon — حساب API هو sabq_runtime ولا يملك CREATE على public.
--
-- لماذا جدول مستقل لا عمود jsonb على articles:
--   الكتابة على صف الخبر ترفع updatedAt وتُبطل الكاش، وتسابق حفظ المحرر
--   (seo_metadata يُدمج عند الحفظ عبر buildEditorialMetadataUpdate). الجدول المستقل
--   إضافي ومعزول: نتيجة الفحص لا تغيّر الخبر ولا ظهوره.
--
-- الكود يتحمّل غياب الجدول: الميزة مطفأة افتراضياً (GEMINI_TITLE_CHECK_ENABLED)،
-- و GET /api/internal/title-checks يرد tableMissing:true إن لم يُنشأ بعد.
-- التراجع: DROP TABLE IF EXISTS public.article_title_checks;  (لا يُنفذ إلا بقرار صريح من المالك)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    RAISE EXCEPTION 'role sabq_runtime does not exist';
  END IF;
END $$;

BEGIN;

CREATE TABLE IF NOT EXISTS public.article_title_checks (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id varchar NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  input_hash text NOT NULL,
  probability real,
  decision text NOT NULL,
  flagged boolean NOT NULL DEFAULT false,
  model text NOT NULL DEFAULT 'gemini-decision-1',
  latency_ms integer,
  input_tokens integer,
  error text,
  checked_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT article_title_checks_article_id_unique UNIQUE (article_id)
);

-- جدول جديد فارغ: فهرس عادي داخل المعاملة مسموح.
CREATE INDEX IF NOT EXISTS idx_article_title_checks_flagged_checked
  ON public.article_title_checks (flagged, checked_at DESC);

-- التطبيق يقرأ ويُدرج ويحدّث (upsert على article_id)، بلا حذف.
GRANT SELECT, INSERT, UPDATE ON TABLE public.article_title_checks TO sabq_runtime;

COMMIT;

-- يجب أن تكون القيم الثلاث true.
SELECT
  has_table_privilege('sabq_runtime', 'public.article_title_checks', 'SELECT') AS can_read,
  has_table_privilege('sabq_runtime', 'public.article_title_checks', 'INSERT') AS can_insert,
  has_table_privilege('sabq_runtime', 'public.article_title_checks', 'UPDATE') AS can_update;
