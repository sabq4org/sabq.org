-- تسوية دفتر رصيد الوكالات — 2026-10-06 (إضافة فقط)
--
-- يضيف قيدًا واحدًا من نوع credit_settled، بقيمة صفر، لكل خبر وكالة منشور
-- لا يملك قيد خصم (credit_used) ولا تسوية سابقة. لا يغيّر أي رصيد ولا أي
-- عدّاد ولا أي خبر. السبب: قبل PR #1812 كان النشر المجدول لا يخصم، ونُشرت
-- أخبار حين لم تكن للوكالة باقة صالحة. خدمة الخصم تعدّ هذا القيد «مخصومًا»
-- فلا يُخصم الخبر لاحقًا عند إعادة نشره.
--
-- الباقة المقيّد عليها: باقة الوكالة التي تغطي مدتها تاريخ النشر (النشطة
-- أولًا ثم الأحدث بدءًا)، وإلا آخر باقة بدأت قبل النشر، وإلا أقدم باقة.
-- يُعاد تشغيله بأمان: NOT EXISTS يمنع التكرار.
-- التراجع: DELETE FROM publisher_credit_logs WHERE action_type = 'credit_settled'
--   AND notes LIKE 'تسوية دفترية 2026-10-06%';

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

INSERT INTO publisher_credit_logs
  (publisher_id, credit_package_id, article_id, action_type,
   credits_before, credits_changed, credits_after, performed_by, notes)
SELECT a.publisher_id, pkg.id, a.id, 'credit_settled',
       pkg.remaining_credits, 0, pkg.remaining_credits, NULL,
       'تسوية دفترية 2026-10-06: خبر نُشر دون قيد خصم ('
         || CASE WHEN a.scheduled_at IS NOT NULL THEN 'نشر مجدول' ELSE 'بلا باقة صالحة وقت النشر' END
         || '). لا خصم من الرصيد.'
FROM articles a
CROSS JOIN LATERAL (
  SELECT c.id, c.remaining_credits
  FROM publisher_credits c
  WHERE c.publisher_id = a.publisher_id
  ORDER BY
    (c.start_date <= a.published_at AND (c.expiry_date IS NULL OR c.expiry_date >= a.published_at)) DESC,
    c.is_active DESC,
    (c.start_date <= a.published_at) DESC,
    CASE WHEN c.start_date <= a.published_at THEN c.start_date END DESC NULLS LAST,
    c.start_date ASC
  LIMIT 1
) pkg
WHERE a.publisher_id IS NOT NULL
  AND a.status = 'published'
  AND NOT EXISTS (
    SELECT 1 FROM publisher_credit_logs l
    WHERE l.article_id = a.id AND l.action_type IN ('credit_used', 'credit_settled')
  );

COMMIT;
