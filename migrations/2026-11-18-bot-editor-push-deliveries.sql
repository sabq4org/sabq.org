-- Run manually after a verified backup or Neon branch; do not apply automatically.
CREATE TABLE IF NOT EXISTS bot_editor_push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  language text NOT NULL CHECK (language IN ('ar', 'en')),
  article_id text NOT NULL,
  actor_id text REFERENCES users(id) ON DELETE SET NULL,
  original_source text,
  status text NOT NULL CHECK (status IN ('sending', 'sent', 'partial', 'failed', 'delivery_unknown')),
  total_devices integer NOT NULL,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (language, article_id)
);
-- Verify before enabling the endpoint:
-- SELECT to_regclass('public.bot_editor_push_deliveries');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON bot_editor_push_deliveries TO sabq_runtime;
  END IF;
END $$;
SELECT r.rolname, has_table_privilege(r.rolname, 'bot_editor_push_deliveries', 'SELECT') AS can_read,
       has_table_privilege(r.rolname, 'bot_editor_push_deliveries', 'INSERT') AS can_claim,
       has_table_privilege(r.rolname, 'bot_editor_push_deliveries', 'UPDATE') AS can_record_outcome
FROM pg_roles r WHERE r.rolname = 'sabq_runtime';
