-- مواعيدك (mawaeed) — جداول جديدة إضافية فقط.
-- إن تعارض اسم هذا الملف مع ترحيل آخر، أعد تسميته. لا يعدّل جداول قائمة.
-- Idempotent: CREATE TABLE IF NOT EXISTS. المصدر البنيوي: shared/schema.ts
-- المحلي: npm run db:push:local ثم npx tsx scripts/seed-mawaeed.ts
-- الإنتاج: ./push-to-production.sh أو تشغيل هذا الملف ثم سكربت البذرة بوعي.

CREATE TABLE IF NOT EXISTS mawaeed_series (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(80) NOT NULL,
  kind varchar(40) NOT NULL,
  title_ar text NOT NULL,
  summary_ar text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  tag_id varchar REFERENCES tags(id) ON DELETE SET NULL,
  content_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mawaeed_series_slug_uidx ON mawaeed_series (slug);

CREATE TABLE IF NOT EXISTS mawaeed_occurrences (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id varchar NOT NULL REFERENCES mawaeed_series(id) ON DELETE CASCADE,
  seed_key varchar(400),
  title_ar text NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  source_url text NOT NULL,
  source_title text NOT NULL,
  certainty varchar(20) NOT NULL DEFAULT 'confirmed',
  status varchar(20) NOT NULL DEFAULT 'scheduled',
  published boolean NOT NULL DEFAULT false,
  region_group varchar(20) NOT NULL DEFAULT 'all',
  hijri_label text,
  public_note text,
  rule_note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mawaeed_occurrences_certainty_chk CHECK (certainty IN ('confirmed', 'expected', 'unverified')),
  CONSTRAINT mawaeed_occurrences_status_chk CHECK (status IN ('scheduled', 'cancelled', 'superseded')),
  CONSTRAINT mawaeed_occurrences_region_chk CHECK (region_group IN ('all', 'riyadh_most', 'western'))
);

CREATE UNIQUE INDEX IF NOT EXISTS mawaeed_occurrences_seed_key_uidx ON mawaeed_occurrences (seed_key);
CREATE INDEX IF NOT EXISTS mawaeed_occurrences_series_date_idx ON mawaeed_occurrences (series_id, starts_on);

CREATE TABLE IF NOT EXISTS mawaeed_changes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id varchar NOT NULL REFERENCES mawaeed_series(id) ON DELETE CASCADE,
  occurrence_id varchar REFERENCES mawaeed_occurrences(id) ON DELETE SET NULL,
  actor_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  action varchar(20) NOT NULL,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mawaeed_changes_series_idx ON mawaeed_changes (series_id, created_at);

INSERT INTO permissions (code, label, label_ar, module, description)
SELECT 'mawaeed.edit', 'Edit Mawaeed', 'تحرير مواعيدك', 'mawaeed', 'إنشاء وتعديل مواعيد الصفحة العامة /mawaeed'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'mawaeed.edit');
