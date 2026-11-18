-- Additive history for English articles. Execute before enabling the bot editor API.
CREATE TABLE IF NOT EXISTS en_article_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id varchar NOT NULL REFERENCES en_articles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id varchar REFERENCES users(id) ON DELETE SET NULL,
  summary text,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_en_article_events_article ON en_article_events (article_id, created_at);
CREATE TABLE IF NOT EXISTS en_article_revisions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id varchar NOT NULL REFERENCES en_articles(id) ON DELETE CASCADE,
  editor_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  editor_name text,
  changed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  previous_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  update_reason text,
  original_source text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_en_article_revisions_article ON en_article_revisions (article_id, created_at);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT ON TABLE en_article_events, en_article_revisions TO sabq_runtime;
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS bot_editor_operations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id varchar REFERENCES users(id) ON DELETE SET NULL,
  operation text NOT NULL,
  outcome text NOT NULL,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bot_editor_operations_created ON bot_editor_operations (created_at);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT ON TABLE bot_editor_operations TO sabq_runtime;
  END IF;
END $$;

-- Nullable additive provenance for old and new revisions.
ALTER TABLE article_revisions ADD COLUMN IF NOT EXISTS original_source text;
ALTER TABLE en_article_revisions ADD COLUMN IF NOT EXISTS original_source text;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT ON TABLE article_revisions, article_versions, article_events TO sabq_runtime;
    GRANT SELECT ON TABLE activity_logs TO sabq_runtime;
  END IF;
END $$;
-- Verify the named runtime role can read history and append audit records.
DO $$ DECLARE t text; BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    FOREACH t IN ARRAY ARRAY['article_revisions','en_article_revisions','en_article_events','bot_editor_operations'] LOOP
      IF NOT has_table_privilege('sabq_runtime', t, 'SELECT') OR NOT has_table_privilege('sabq_runtime', t, 'INSERT') THEN
        RAISE EXCEPTION 'Missing SELECT/INSERT on % for sabq_runtime', t;
      END IF;
    END LOOP;
    FOREACH t IN ARRAY ARRAY['article_versions','article_events','activity_logs'] LOOP
      IF NOT has_table_privilege('sabq_runtime', t, 'SELECT') THEN
        RAISE EXCEPTION 'Missing SELECT on % for sabq_runtime', t;
      END IF;
    END LOOP;
  END IF;
END $$;
