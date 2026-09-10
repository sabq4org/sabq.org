-- Targeted production reconciliation: deploy the input-validation PR first.
-- Run through a direct administrative connection, after the isolated restore test.
-- No data updates, type casts, or table/index removal. Each lock phase is bounded.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.article_media_assets'::regclass AND conname='article_media_assets_alt_text_nn') THEN
    ALTER TABLE public.article_media_assets ADD CONSTRAINT article_media_assets_alt_text_nn CHECK (alt_text IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.opinion_author_applications'::regclass AND conname='opinion_author_applications_profile_photo_url_nn') THEN
    ALTER TABLE public.opinion_author_applications ADD CONSTRAINT opinion_author_applications_profile_photo_url_nn CHECK (profile_photo_url IS NOT NULL) NOT VALID;
  END IF;
END $$;
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
ALTER TABLE public.article_media_assets VALIDATE CONSTRAINT article_media_assets_alt_text_nn;
ALTER TABLE public.opinion_author_applications VALIDATE CONSTRAINT opinion_author_applications_profile_photo_url_nn;
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
ALTER TABLE public.article_media_assets ALTER COLUMN alt_text SET NOT NULL;
ALTER TABLE public.opinion_author_applications ALTER COLUMN profile_photo_url SET NOT NULL;
ALTER TABLE public.article_media_assets DROP CONSTRAINT article_media_assets_alt_text_nn;
ALTER TABLE public.opinion_author_applications DROP CONSTRAINT opinion_author_applications_profile_photo_url_nn;
COMMIT;
