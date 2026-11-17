-- Run outside a transaction; pg_trgm must already be installed by an operator.
-- These indexes support case-insensitive title and body searches in both editions.
-- No extension, table, or data changes are made by this migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    RAISE EXCEPTION 'pg_trgm is required; install it separately before running this migration';
  END IF;
END $$;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_articles_title_trgm_raw ON articles USING gin (title gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_articles_bot_editor_content_trgm ON articles USING gin (content gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_en_articles_bot_editor_title_trgm ON en_articles USING gin (title gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_en_articles_bot_editor_content_trgm ON en_articles USING gin (content gin_trgm_ops);

-- Check indisvalid and indisready; an interrupted concurrent build must be repaired by an operator.
SELECT c.relname, i.indisvalid, i.indisready
FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname IN ('idx_articles_title_trgm_raw', 'idx_articles_bot_editor_content_trgm',
                    'idx_en_articles_bot_editor_title_trgm', 'idx_en_articles_bot_editor_content_trgm');
