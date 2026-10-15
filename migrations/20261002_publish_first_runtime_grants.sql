-- إصلاح 42501 في النشر أولاً: حساب API هو sabq_runtime.
-- يُنفّذ بمالك الجداول بعد 20260927_publish_first.sql.
-- قابل لإعادة التنفيذ؛ لا يغير البيانات أو الملكية ولا يمنح UPDATE/DELETE.
-- يفشل صراحة إذا غاب الدور أو أحد الجداول بدلاً من إظهار نجاح مضلل.
BEGIN;

GRANT SELECT, INSERT ON TABLE
  public.article_reviewer_verdicts,
  public.article_revisions,
  public.article_publish_overrides
TO sabq_runtime;

COMMIT;

-- يجب أن تكون can_read وcan_insert صحيحتين لكل صف.
SELECT
  table_name,
  has_table_privilege('sabq_runtime', 'public.' || table_name, 'SELECT') AS can_read,
  has_table_privilege('sabq_runtime', 'public.' || table_name, 'INSERT') AS can_insert
FROM (VALUES
  ('article_reviewer_verdicts'),
  ('article_revisions'),
  ('article_publish_overrides')
) AS required_tables(table_name);
