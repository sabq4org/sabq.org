-- Migration: Create article_events table for timeline/audit log
-- This table tracks all events related to articles (creation, updates, publishing, etc.)

CREATE TABLE IF NOT EXISTS article_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id VARCHAR NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  summary TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_article_events_article_id ON article_events(article_id);
CREATE INDEX IF NOT EXISTS idx_article_events_created_at ON article_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_events_actor_id ON article_events(actor_id);
