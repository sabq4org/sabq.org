-- مراجعة ملف المنسوب قبل إصدار شهادة التعريف (additive)
-- محلياً: npm run db:push:local
-- إنتاج: نفّذ يدوياً — لا db:push ضد Neon.

BEGIN;

ALTER TABLE staff_profiles
  ADD COLUMN IF NOT EXISTS profile_review_status varchar(32) DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS profile_review_note text,
  ADD COLUMN IF NOT EXISTS profile_reviewed_at timestamp,
  ADD COLUMN IF NOT EXISTS profile_reviewed_by varchar REFERENCES users(id);

CREATE INDEX IF NOT EXISTS staff_profiles_review_status_idx
  ON staff_profiles (profile_review_status);

COMMIT;
