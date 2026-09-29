-- Per-user Sabq publisher bot credentials (Issue #1780).
-- Raw tokens are never persisted; token_hash is SHA-256(botpub_* value).
-- Run as the database owner in Neon SQL Editor:
-- project jolly-sky-77868412 / branch br-bold-sound-admvvr1a / database neondb.
BEGIN;

CREATE TABLE IF NOT EXISTS public.bot_publisher_tokens (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  token_prefix varchar(32) NOT NULL,
  label varchar(120),
  expires_at timestamp NOT NULL,
  revoked_at timestamp,
  issued_by varchar REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  last_used_at timestamp
);

CREATE INDEX IF NOT EXISTS bot_publisher_tokens_user_id_idx
  ON public.bot_publisher_tokens(user_id);
CREATE INDEX IF NOT EXISTS bot_publisher_tokens_expires_at_idx
  ON public.bot_publisher_tokens(expires_at);
CREATE INDEX IF NOT EXISTS bot_publisher_tokens_revoked_at_idx
  ON public.bot_publisher_tokens(revoked_at);

-- Runtime can manage credentials, but cannot delete records or alter the schema.
GRANT SELECT, INSERT, UPDATE ON TABLE public.bot_publisher_tokens TO sabq_runtime;

COMMIT;

-- Expected: table_name populated and all three permission columns true.
SELECT
  to_regclass('public.bot_publisher_tokens') AS table_name,
  has_table_privilege('sabq_runtime', 'public.bot_publisher_tokens', 'SELECT') AS can_read,
  has_table_privilege('sabq_runtime', 'public.bot_publisher_tokens', 'INSERT') AS can_insert,
  has_table_privilege('sabq_runtime', 'public.bot_publisher_tokens', 'UPDATE') AS can_update;
