-- Apply before deploying English edit-lock consumers, after a verified backup.
CREATE TABLE IF NOT EXISTS en_article_edit_locks (
  article_id varchar PRIMARY KEY REFERENCES en_articles(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name text NOT NULL,
  acquired_at timestamp NOT NULL DEFAULT now(),
  expires_at timestamp NOT NULL,
  last_heartbeat timestamp NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON en_article_edit_locks TO sabq_runtime;
  END IF;
END $$;
-- Verify the table and runtime privileges after applying:
SELECT to_regclass('public.en_article_edit_locks') AS lock_table;
SELECT privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'en_article_edit_locks' AND grantee = 'sabq_runtime';
