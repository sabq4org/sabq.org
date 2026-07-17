# SQL additive — المرحلة أ/ب (قصص + فجوات v2)

نفّذ على staging ثم الإنتاج إن لم تستخدم `db:push`:

```sql
CREATE TABLE IF NOT EXISTS radar_stories (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  title text NOT NULL,
  summary text,
  status text NOT NULL DEFAULT 'active',
  source_count integer NOT NULL DEFAULT 1,
  top_news_value integer NOT NULL DEFAULT 0,
  saudi_relevance integer NOT NULL DEFAULT 0,
  momentum_score integer NOT NULL DEFAULT 0,
  embedding jsonb,
  first_seen_at timestamp NOT NULL DEFAULT now(),
  last_seen_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_radar_stories_status_seen ON radar_stories (status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_stories_fingerprint ON radar_stories (fingerprint);

ALTER TABLE radar_items ADD COLUMN IF NOT EXISTS story_id varchar REFERENCES radar_stories(id) ON DELETE SET NULL;
ALTER TABLE radar_items ADD COLUMN IF NOT EXISTS metrics jsonb;
CREATE INDEX IF NOT EXISTS idx_radar_items_story ON radar_items (story_id);

CREATE TABLE IF NOT EXISTS radar_story_snapshots (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id varchar NOT NULL REFERENCES radar_stories(id) ON DELETE CASCADE,
  captured_at timestamp NOT NULL DEFAULT now(),
  mention_count integer NOT NULL,
  source_count integer NOT NULL,
  x_engagement integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_snapshots_story_time ON radar_story_snapshots (story_id, captured_at DESC);

ALTER TABLE coverage_gaps ADD COLUMN IF NOT EXISTS story_id varchar REFERENCES radar_stories(id) ON DELETE SET NULL;
ALTER TABLE coverage_gaps ADD COLUMN IF NOT EXISTS relevance_score integer;
ALTER TABLE coverage_gaps ADD COLUMN IF NOT EXISTS momentum_score integer;
ALTER TABLE coverage_gaps ADD COLUMN IF NOT EXISTS gap_reason jsonb;
CREATE INDEX IF NOT EXISTS idx_coverage_gaps_story ON coverage_gaps (story_id);
```

تفعيل تدريجي على Railway بعد `db:push`/SQL:

```
RADAR_CLUSTERING_ENABLED=true
RADAR_MOMENTUM_ENABLED=true
RADAR_RELEVANCE_ENABLED=true
# بعد أسبوع ثبات + قبول:
# RADAR_GAP_V2_ENABLED=true
```

## أسبوع الثبات (قبل فجوات v2)

1. `db:push` أو SQL أعلاه على staging ثم الإنتاج.
2. فعّل أعلام المرحلة أ فقط (لا `RADAR_GAP_V2_ENABLED` بعد).
3. يومياً: `npx tsx scripts/radar-phase1-acceptance.ts` — الهدف: قصة متعددة المصادر ≥ 3، وإيران ≤ 1 قصة، وإشارات momentum/relevance قابلة للقياس.
4. عيّنة يدوية: إيران/مونديال/سعودي — تأكد أن المواد من مصادر مختلفة تشارك `story_id`.
5. بعد أسبوع قبول: فعّل `RADAR_GAP_V2_ENABLED` وأعد التقرير — فجوة إيران ≤ 1 (أو drafting/covered).
