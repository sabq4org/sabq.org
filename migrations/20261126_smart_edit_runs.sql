-- سجل «تحرير وتوليد شامل»: صف لكل تشغيل فيه من شغّله ومتى، والنص المدخل والناتج كاملين،
-- ونسبة ما بقي من الناتج في الخبر المحفوظ.
-- إضافي فقط: جدول جديد، لا يلمس أي جدول أو صف موجود. آمن للتكرار.
-- يُنفَّذ بمالك الجداول في محرر Neon قبل دمج الـPR.
-- قبل التنفيذ: التحرير الذكي يعمل كالمعتاد، والتسجيل يفشل بصمت (تحذير في السجل فقط).
-- التراجع (لا يُنفذ إلا بقرار صريح):
--   DROP TABLE IF EXISTS smart_edit_runs;
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS smart_edit_runs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id varchar REFERENCES articles(id) ON DELETE SET NULL,
  user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  channel varchar(16) NOT NULL,
  status varchar(16) NOT NULL,
  error_type varchar(32),
  input_content text NOT NULL,
  output_content text,
  output_title text,
  output_fields jsonb,
  input_words integer NOT NULL DEFAULT 0,
  output_words integer NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  adoption jsonb,
  adoption_at timestamp,
  linked_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_smart_edit_runs_article ON smart_edit_runs (article_id, created_at);
CREATE INDEX IF NOT EXISTS idx_smart_edit_runs_user ON smart_edit_runs (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_smart_edit_runs_created ON smart_edit_runs (created_at);

-- حساب التطبيق: قراءة وإضافة وتحديث فقط (لا حذف).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON smart_edit_runs TO sabq_runtime;
  END IF;
END $$;

COMMIT;

-- التحقق بعد التنفيذ (المتوقع: الجدول موجود والصلاحيات الثلاث true):
SELECT to_regclass('public.smart_edit_runs') AS runs_table,
       has_table_privilege('sabq_runtime', 'public.smart_edit_runs', 'SELECT') AS can_select,
       has_table_privilege('sabq_runtime', 'public.smart_edit_runs', 'INSERT') AS can_insert,
       has_table_privilege('sabq_runtime', 'public.smart_edit_runs', 'UPDATE') AS can_update
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime');
