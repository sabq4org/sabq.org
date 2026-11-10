-- إيصال نشر بوت النسخة الإنجليزية.
-- جدول article_publish_operations.article_id يشير إلى articles(id) ولا يقبل معرّف en_articles.
-- هذا جدول جديد فارغ. لا يمس الجدول العربي ولا يغيّر قيوده.
-- يشغّله علي على الإنتاج قبل دمج الكود الذي يكتب operationId لمسار /api/internal/bot-drafts/en.
-- النشر الإنجليزي بلا operationId يعمل حتى قبل هذا الملف. مع operationId يحتاج الجدول والصلاحيات.

CREATE TABLE IF NOT EXISTS en_article_publish_operations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id varchar NOT NULL,
  actor_key varchar NOT NULL,
  article_id varchar NOT NULL REFERENCES en_articles(id) ON DELETE CASCADE,
  body_fingerprint varchar NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'succeeded', 'failed')),
  response jsonb,
  error jsonb,
  claimed_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_en_article_publish_operations_actor_article_operation
  ON en_article_publish_operations (actor_key, article_id, operation_id);

CREATE INDEX IF NOT EXISTS idx_en_article_publish_operations_article
  ON en_article_publish_operations (article_id, claimed_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.en_article_publish_operations TO sabq_runtime;
  END IF;
END
$$;

SELECT
  to_regclass('public.en_article_publish_operations') AS en_receipts_table,
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
      has_table_privilege('sabq_runtime', 'public.en_article_publish_operations', 'SELECT')
      AND has_table_privilege('sabq_runtime', 'public.en_article_publish_operations', 'INSERT')
      AND has_table_privilege('sabq_runtime', 'public.en_article_publish_operations', 'UPDATE')
    ELSE NULL
  END AS sabq_runtime_can_write_receipts;
