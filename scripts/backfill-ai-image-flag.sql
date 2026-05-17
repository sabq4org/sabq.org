-- Backfill articles.is_ai_generated_image from media_files.is_ai_generated
--
-- WHY: The nano-banana dashboard flow (server/routes/nanoBananaRoutes.ts)
-- writes `is_ai_generated = true` to the media_files row when the editor
-- saves a generated image, but DOESN'T set `is_ai_generated_image = true`
-- on the articles row when that same image is later attached to a post.
-- Result: 50/50 recent articles have is_ai_generated_image=false even
-- though the bylines are clearly AI-generated.
--
-- This script reconciles the two tables for every existing article. From
-- here on, you still want to patch nanoBananaRoutes (or the article
-- update endpoints) so new articles set the flag automatically, but this
-- unlocks the iOS badge for the existing backlog immediately.
--
-- DRY-RUN first (counts what would change):
--   SELECT COUNT(*) FROM articles a
--   JOIN media_files mf ON mf.url = a.image_url
--   WHERE mf.is_ai_generated = true
--     AND (a.is_ai_generated_image IS NULL OR a.is_ai_generated_image = false);
--
-- APPLY:
--   psql $DATABASE_URL -f scripts/backfill-ai-image-flag.sql

BEGIN;

-- Primary backfill — image_url match.
UPDATE articles a
SET
  is_ai_generated_image = true,
  ai_image_model = COALESCE(a.ai_image_model, mf.ai_generation_model),
  ai_image_prompt = COALESCE(a.ai_image_prompt, mf.ai_generation_prompt)
FROM media_files mf
WHERE mf.url = a.image_url
  AND mf.is_ai_generated = true
  AND (a.is_ai_generated_image IS NULL OR a.is_ai_generated_image = false);

-- Secondary backfill — thumbnail_url match, only when image_url didn't
-- already pick it up. Covers articles that use the AI image only as
-- a thumbnail (rare but possible).
UPDATE articles a
SET
  is_ai_generated_thumbnail = true,
  ai_image_model = COALESCE(a.ai_image_model, mf.ai_generation_model)
FROM media_files mf
WHERE mf.url = a.thumbnail_url
  AND mf.is_ai_generated = true
  AND a.thumbnail_url IS NOT NULL
  AND a.thumbnail_url != COALESCE(a.image_url, '')
  AND (a.is_ai_generated_thumbnail IS NULL OR a.is_ai_generated_thumbnail = false);

-- Report what we updated so you can sanity-check before committing.
SELECT
  COUNT(*) FILTER (WHERE is_ai_generated_image = true) AS total_ai_image_articles,
  COUNT(*) FILTER (WHERE is_ai_generated_thumbnail = true) AS total_ai_thumb_articles,
  COUNT(*) AS total_articles
FROM articles;

-- COMMIT or ROLLBACK based on the counts above.
-- COMMIT;
-- ROLLBACK;
