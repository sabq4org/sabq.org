-- =============================================================================
-- إصلاح مخطط impressions (و deep_analyses إن لزم) بعد DROP يدوي خاطئ
-- التاريخ: 2026-07-25
-- السبب: أُعيد إنشاء impressions بـ SERIAL/INTEGER بينما schema.ts يتوقع varchar UUID
--        → operator does not exist: integer = character varying على
--          ads:active-slot-locations
--
-- التشغيل: على Neon SQL Editor (إنتاج) بعد مراجعة. لا تستخدم npm run db:push.
-- البيانات: الجدول المكسور كان فارغاً أو يدوياً بلا صفوف مفيدة — DROP آمن هنا.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) impressions — يطابق shared/schema.ts (impressions)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.impressions CASCADE;

CREATE TABLE public.impressions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  creative_id varchar NOT NULL REFERENCES public.creatives(id) ON DELETE CASCADE,
  campaign_id varchar NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  slot_id varchar REFERENCES public.inventory_slots(id),
  user_agent text,
  ip_address text,
  country text DEFAULT 'SA',
  device text,
  page_url text,
  referrer text,
  "timestamp" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_impressions_creative ON public.impressions (creative_id);
CREATE INDEX IF NOT EXISTS idx_impressions_campaign ON public.impressions (campaign_id);
CREATE INDEX IF NOT EXISTS idx_impressions_slot ON public.impressions (slot_id);
CREATE INDEX IF NOT EXISTS idx_impressions_timestamp ON public.impressions ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_impressions_country ON public.impressions (country);
CREATE INDEX IF NOT EXISTS idx_impressions_device ON public.impressions (device);

-- أعد FK من clicks إن وُجد العمود (CASCADE أسقط القيد سابقاً)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clicks' AND column_name = 'impression_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clicks_impression_id_impressions_id_fk'
  ) THEN
    BEGIN
      ALTER TABLE public.clicks
        ADD CONSTRAINT clicks_impression_id_impressions_id_fk
        FOREIGN KEY (impression_id) REFERENCES public.impressions(id);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'skip clicks FK: %', SQLERRM;
    END;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) deep_analyses — إن حُذف أو نُقص عمود status
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deep_analyses (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title text NOT NULL,
  topic text NOT NULL,
  description text,
  category_id varchar REFERENCES public.categories(id),
  reporter_id varchar REFERENCES public.users(id),
  keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  analysis_depth text NOT NULL DEFAULT 'deep',
  analysis_type text NOT NULL DEFAULT 'comprehensive',
  use_multi_model boolean NOT NULL DEFAULT true,
  models_used text[] NOT NULL DEFAULT ARRAY['openai', 'gemini']::text[],
  gpt_analysis text,
  gemini_analysis text,
  claude_analysis text,
  merged_analysis text,
  executive_summary text,
  recommendations text,
  created_by varchar NOT NULL REFERENCES public.users(id),
  status text NOT NULL DEFAULT 'draft',
  generation_time integer,
  ai_keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  smart_entities jsonb,
  model_insights jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE public.deep_analyses
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';

CREATE INDEX IF NOT EXISTS idx_deep_analyses_created_by ON public.deep_analyses (created_by);
CREATE INDEX IF NOT EXISTS idx_deep_analyses_status ON public.deep_analyses (status);
CREATE INDEX IF NOT EXISTS idx_deep_analyses_category ON public.deep_analyses (category_id);
CREATE INDEX IF NOT EXISTS idx_deep_analyses_created_at ON public.deep_analyses (created_at DESC);

-- تحقق سريع
DO $$
DECLARE
  slot_udt text;
BEGIN
  SELECT udt_name INTO slot_udt
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'impressions' AND column_name = 'slot_id';

  IF slot_udt IS DISTINCT FROM 'varchar' AND slot_udt IS DISTINCT FROM 'text' THEN
    RAISE EXCEPTION 'impressions.slot_id type is % — expected varchar/text', slot_udt;
  END IF;

  RAISE NOTICE 'OK: impressions.slot_id=% ; deep_analyses.status present', slot_udt;
END $$;

COMMIT;
