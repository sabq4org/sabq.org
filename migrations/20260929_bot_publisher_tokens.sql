-- Per-user Sabq publisher bot credentials (Issue #1780).
-- Raw tokens are never persisted; token_hash is SHA-256(botpub_* value).
CREATE TABLE IF NOT EXISTS bot_publisher_tokens (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  token_prefix varchar(32) NOT NULL,
  label varchar(120),
  expires_at timestamp NOT NULL,
  revoked_at timestamp,
  issued_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  last_used_at timestamp
);

CREATE INDEX IF NOT EXISTS bot_publisher_tokens_user_id_idx
  ON bot_publisher_tokens(user_id);
CREATE INDEX IF NOT EXISTS bot_publisher_tokens_expires_at_idx
  ON bot_publisher_tokens(expires_at);
CREATE INDEX IF NOT EXISTS bot_publisher_tokens_revoked_at_idx
  ON bot_publisher_tokens(revoked_at);
