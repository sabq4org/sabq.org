-- «طلب تعديل» على الخبر (article_edit_requests) — مطابق لتعريفه في shared/schema.ts.
-- إضافي فقط: جدول جديد لا يلمس أي جدول موجود. آمن للتكرار (IF NOT EXISTS).
-- يُنفَّذ بمالك الجداول في Neon SQL Editor قبل دمج الكود؛ حساب API هو sabq_runtime.
-- قبل تنفيذه: مسارات الطلبات ترد 503 «الميزة غير مفعّلة بعد» ولا يتأثر شيء آخر.
-- التراجع: DROP TABLE IF EXISTS article_edit_requests;  (لا يُنفذ إلا بقرار صريح)
BEGIN;

CREATE TABLE IF NOT EXISTS article_edit_requests (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id varchar NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  requester_id varchar REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  urgent boolean NOT NULL DEFAULT false,
  note text NOT NULL DEFAULT '',
  proposed jsonb NOT NULL DEFAULT '{}'::jsonb,
  base_snapshot jsonb,
  applied_fields jsonb,
  decided_by varchar REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamp,
  decision_note text,
  applied_version_id varchar,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- الجدول جديد وفارغ، فالفهارس العادية لا تقفل شيئًا.
CREATE INDEX IF NOT EXISTS idx_article_edit_requests_article_status
  ON article_edit_requests (article_id, status);
CREATE INDEX IF NOT EXISTS idx_article_edit_requests_status_created
  ON article_edit_requests (status, created_at DESC);

-- التطبيق يقرأ ويضيف ويحدّث الحالة فقط؛ لا حذف (الحذف بالـ CASCADE مع المادة).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.article_edit_requests TO sabq_runtime;
  ELSE
    RAISE EXCEPTION 'sabq_runtime role not found — grant manually before deploying';
  END IF;
END $$;

COMMIT;

-- تحقق: يجب أن تكون النتائج الثلاث true
SELECT
  has_table_privilege('sabq_runtime', 'public.article_edit_requests', 'SELECT') AS can_select,
  has_table_privilege('sabq_runtime', 'public.article_edit_requests', 'INSERT') AS can_insert,
  has_table_privilege('sabq_runtime', 'public.article_edit_requests', 'UPDATE') AS can_update;
