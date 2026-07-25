-- =============================================================================
-- طلب تصحيح + مراجعة ملف الترخيص المهني (كاتب رأي + مراسل)
-- نفّذ على Neon SQL Editor قبل/مع نشر الكود.
-- =============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS media_license_admin_note text,
  ADD COLUMN IF NOT EXISTS media_license_correction_requested_at timestamp,
  ADD COLUMN IF NOT EXISTS media_license_correction_requested_by varchar,
  ADD COLUMN IF NOT EXISTS media_license_review_status varchar(32);

-- تحقق
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name LIKE 'media_license_%'
ORDER BY column_name;
