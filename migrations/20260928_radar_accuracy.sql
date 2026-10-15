-- رادار سبق: فرز الدقة (إصدار 2026-09-28). إضافي فقط على Postgres/Neon.
-- شغّل هذا الملف قبل نشر نسخة الـ API التي تقرأ الأعمدة، وإلا تفشل استعلامات
-- radar_items لأن Drizzle يحدد الأعمدة صراحة.
-- كل الأعمدة nullable بلا default (لا إعادة كتابة للجدول). الفهرس عادي: الجدول
-- صغير نسبيًا (احتفاظ 14 يومًا) والقفل قصير؛ لا CONCURRENTLY داخل transaction.
-- التراجع: الكود القديم يتجاهل الأعمدة؛ لا حاجة لحذفها.

SET lock_timeout = '5s';
SET statement_timeout = '120s';

ALTER TABLE radar_items ADD COLUMN IF NOT EXISTS publisher_key text;
ALTER TABLE radar_items ADD COLUMN IF NOT EXISTS publisher_type text;
ALTER TABLE radar_items ADD COLUMN IF NOT EXISTS wire_origin text;
ALTER TABLE radar_items ADD COLUMN IF NOT EXISTS text_basis text;
ALTER TABLE radar_items ADD COLUMN IF NOT EXISTS quality_flags jsonb;
ALTER TABLE radar_items ADD COLUMN IF NOT EXISTS screen_reason text;
ALTER TABLE radar_items ADD COLUMN IF NOT EXISTS duplicate_of_id varchar;
ALTER TABLE radar_items ADD COLUMN IF NOT EXISTS event_timing text;
ALTER TABLE radar_items ADD COLUMN IF NOT EXISTS timing_evidence text;
ALTER TABLE radar_items ADD COLUMN IF NOT EXISTS content_type text;
ALTER TABLE radar_items ADD COLUMN IF NOT EXISTS evidence_score integer;
ALTER TABLE radar_items ADD COLUMN IF NOT EXISTS freshness_score integer;
ALTER TABLE radar_items ADD COLUMN IF NOT EXISTS priority_score integer;
ALTER TABLE radar_items ADD COLUMN IF NOT EXISTS lane text;
ALTER TABLE radar_items ADD COLUMN IF NOT EXISTS breaking_until timestamp;

CREATE INDEX IF NOT EXISTS idx_radar_items_priority ON radar_items (priority_score DESC);

-- تحقق بعد التنفيذ:
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'radar_items' AND column_name IN
--  ('publisher_key','publisher_type','wire_origin','text_basis','quality_flags','screen_reason',
--   'duplicate_of_id','event_timing','timing_evidence','content_type','evidence_score',
--   'freshness_score','priority_score','lane','breaking_until') ORDER BY column_name;
