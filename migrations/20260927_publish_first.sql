-- ضمانات «النشر أولاً». إضافي فقط على Postgres/Neon.
-- شغّل هذا الملف قبل نشر نسخة الـ API التي تقرأ الأعمدة، وإلا تفشل
-- استعلامات articles لأن Drizzle يحدد الأعمدة صراحة.
-- لا افتراض now() على articles (عمود متطاير يعيد كتابة الجدول).
-- الجداول الجديدة فارغة، وفهارسها عادية وليست CONCURRENTLY.

ALTER TABLE articles ADD COLUMN IF NOT EXISTS risk_label text;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS draft_created_at timestamp;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS corrected_at timestamp;

CREATE TABLE IF NOT EXISTS article_reviewer_verdicts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id varchar NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  verdict text NOT NULL,
  reviewer_name text NOT NULL,
  note text,
  verdict_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_article_reviewer_verdicts_article
  ON article_reviewer_verdicts (article_id, verdict_at DESC);

CREATE TABLE IF NOT EXISTS article_revisions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id varchar NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  editor_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  editor_name text,
  changed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  previous_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  update_reason text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_article_revisions_article
  ON article_revisions (article_id, created_at ASC);

CREATE TABLE IF NOT EXISTS article_publish_overrides (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id varchar NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  actor_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  actor_name text,
  action text NOT NULL,
  reason text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_article_publish_overrides_article
  ON article_publish_overrides (article_id, created_at DESC);
