-- Additive only. Apply to an isolated local database first; production rollout is separate.
CREATE TABLE IF NOT EXISTS editorial_research_jobs (
  id varchar(36) PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id),
  topic text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'queued',
  session_id text,
  research jsonb,
  result jsonb,
  usage jsonb,
  error text,
  lease_until timestamptz,
  remote_closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS editorial_research_jobs_owner_created_idx ON editorial_research_jobs(user_id, created_at);
CREATE INDEX IF NOT EXISTS editorial_research_jobs_status_idx ON editorial_research_jobs(status);
