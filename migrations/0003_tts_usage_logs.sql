-- Migration: Create tts_usage_logs table for TTS provider usage tracking
-- Logs every TTS request (generation, test, compare) across openai/elevenlabs/google
-- so admins can see per-provider usage, latency, costs, and failure rates.

CREATE TABLE IF NOT EXISTS tts_usage_logs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_id VARCHAR,
  provider TEXT NOT NULL,
  voice_id TEXT,
  language TEXT,
  char_count INTEGER DEFAULT 0 NOT NULL,
  duration_ms INTEGER DEFAULT 0 NOT NULL,
  estimated_cost_usd REAL DEFAULT 0 NOT NULL,
  success BOOLEAN DEFAULT TRUE NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tts_usage_provider ON tts_usage_logs(provider);
CREATE INDEX IF NOT EXISTS idx_tts_usage_created ON tts_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tts_usage_newsletter ON tts_usage_logs(newsletter_id);
