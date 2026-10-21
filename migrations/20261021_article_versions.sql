-- سجل نسخ المادة (article_versions) — مطابق لتعريفه في shared/schema.ts.
-- إضافي فقط: جدول جديد لا يلمس أي جدول موجود. آمن للتكرار (IF NOT EXISTS).
-- يُنفَّذ بمالك الجداول في Neon SQL Editor قبل دمج الكود؛ حساب API هو sabq_runtime.
-- قبل تنفيذه يعمل الكود الجديد بلا كسر: تسجيل النسخ يفشل بصمت ويبقى الحفظ سليمًا.
-- التراجع: DROP TABLE IF EXISTS article_versions;  (لا يُنفذ إلا بقرار صريح)
BEGIN;

CREATE TABLE IF NOT EXISTS article_versions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id varchar NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  action text NOT NULL,
  actor_id varchar REFERENCES users(id) ON DELETE SET NULL,
  snapshot jsonb NOT NULL,
  changed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  restored_from_version_id varchar,
  reason text,
  created_at timestamp NOT NULL DEFAULT now()
);

-- الجدول جديد وفارغ، فالفهارس العادية لا تقفل شيئًا.
CREATE UNIQUE INDEX IF NOT EXISTS uq_article_versions_article_number
  ON article_versions (article_id, version_number);
CREATE INDEX IF NOT EXISTS idx_article_versions_article_created
  ON article_versions (article_id, created_at DESC);

-- التطبيق يقرأ ويضيف فقط؛ لا تحديث ولا حذف (الحذف يتم بالـ CASCADE مع المادة).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT ON TABLE public.article_versions TO sabq_runtime;
  ELSE
    RAISE EXCEPTION 'sabq_runtime role not found — grant manually before deploying';
  END IF;
END $$;

COMMIT;

-- تحقق: يجب أن تكون النتيجتان true
SELECT
  has_table_privilege('sabq_runtime', 'public.article_versions', 'SELECT') AS can_select,
  has_table_privilege('sabq_runtime', 'public.article_versions', 'INSERT') AS can_insert;
