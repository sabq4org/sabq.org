-- Durable idempotency receipts for POST /api/internal/bot-drafts/:id/publish.
-- Additive only. Run this migration explicitly before enabling operationId.

CREATE TABLE IF NOT EXISTS article_publish_operations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id varchar NOT NULL,
  actor_key varchar NOT NULL,
  article_id varchar NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  body_fingerprint varchar NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'succeeded', 'failed')),
  response jsonb,
  error jsonb,
  claimed_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_article_publish_operations_actor_article_operation
  ON article_publish_operations (actor_key, article_id, operation_id);

CREATE INDEX IF NOT EXISTS idx_article_publish_operations_article
  ON article_publish_operations (article_id, claimed_at DESC);

-- Runtime needs only the receipt lifecycle and the publish-first audit writes.
GRANT SELECT, INSERT, UPDATE ON TABLE article_publish_operations TO sabq_runtime;
GRANT SELECT, INSERT ON TABLE article_reviewer_verdicts TO sabq_runtime;
GRANT SELECT, INSERT ON TABLE article_revisions TO sabq_runtime;
GRANT SELECT, INSERT ON TABLE article_publish_overrides TO sabq_runtime;
