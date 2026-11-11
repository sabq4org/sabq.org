-- كلمات محظورة من النشر (publish_banned_words + publish_banned_word_blocks) — مطابق لتعريفهما في shared/schema.ts.
-- إضافي فقط: جدولان جديدان لا يلمسان أي جدول موجود. آمن للتكرار (IF NOT EXISTS).
-- يُنفَّذ بمالك الجداول (neondb_owner) قبل دمج الكود. حساب API هو sabq_runtime.
-- التراجع: DROP TABLE IF EXISTS publish_banned_word_blocks, publish_banned_words;  (لا يُنفذ إلا بقرار صريح)
BEGIN;

CREATE TABLE IF NOT EXISTS publish_banned_words (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  word text NOT NULL,
  normalized_word text NOT NULL UNIQUE,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  blocked_count integer NOT NULL DEFAULT 0,
  added_by varchar,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS publish_banned_word_blocks (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id varchar,
  word text NOT NULL,
  article_id varchar,
  article_title text,
  actor_id varchar,
  actor_label text,
  action text NOT NULL,
  surface text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
-- الجدول جديد وفارغ: الفهرس العادي داخل المعاملة آمن.
CREATE INDEX IF NOT EXISTS publish_banned_word_blocks_created_idx ON publish_banned_word_blocks (created_at);

-- القائمة: قراءة وإضافة وتعديل وحذف (زر الحذف في صفحة الإدارة). السجل: قراءة وإضافة فقط.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.publish_banned_words TO sabq_runtime;
    GRANT SELECT, INSERT ON TABLE public.publish_banned_word_blocks TO sabq_runtime;
  ELSE
    RAISE EXCEPTION 'role sabq_runtime not found — grant manually to the API role';
  END IF;
END $$;

COMMIT;

-- يجب أن تكون الأعمدة الأربعة true.
SELECT
  has_table_privilege('sabq_runtime', 'public.publish_banned_words', 'SELECT') AS words_read,
  has_table_privilege('sabq_runtime', 'public.publish_banned_words', 'DELETE') AS words_delete,
  has_table_privilege('sabq_runtime', 'public.publish_banned_word_blocks', 'SELECT') AS blocks_read,
  has_table_privilege('sabq_runtime', 'public.publish_banned_word_blocks', 'INSERT') AS blocks_insert;
