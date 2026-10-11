-- مكتبة الشعارات (logos + logo_assets) — مطابقة لتعريفها في shared/schema.ts.
-- إضافي فقط: جدولان جديدان لا يلمسان أي جدول موجود. آمن للتكرار (IF NOT EXISTS).
-- يُنفَّذ بمالك الجداول (neondb_owner) — حساب API هو sabq_runtime ولا يملك CREATE على public.
-- التراجع: DROP TABLE IF EXISTS logo_assets, logos;  (لا يُنفذ إلا بقرار صريح)
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS logos (
  id varchar PRIMARY KEY,
  display_id integer NOT NULL,
  title text NOT NULL,
  category_id varchar,
  status varchar(32),
  source_created_at timestamptz,
  source_updated_at timestamptz,
  website_url text,
  download_count integer NOT NULL DEFAULT 0,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  slug text,
  owner_id varchar,
  source_image_url text,
  source_svg_url text,
  source_png_url text,
  svg_url text,
  png_url text,
  primary_url text,
  search_text text NOT NULL DEFAULT '',
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS logos_display_id_uidx ON logos (display_id);
CREATE INDEX IF NOT EXISTS logos_search_text_trgm_idx ON logos USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS logos_tags_gin_idx ON logos USING gin (tags);

CREATE TABLE IF NOT EXISTS logo_assets (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  logo_id varchar NOT NULL REFERENCES logos(id) ON DELETE CASCADE,
  variant varchar(16) NOT NULL,
  source_url text NOT NULL,
  r2_key text,
  public_url text,
  content_type varchar(64),
  bytes integer,
  sha256 varchar(64),
  status varchar(16) NOT NULL,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  uploaded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS logo_assets_source_url_uidx ON logo_assets (source_url);
CREATE INDEX IF NOT EXISTS logo_assets_logo_idx ON logo_assets (logo_id);
CREATE INDEX IF NOT EXISTS logo_assets_status_idx ON logo_assets (status);

-- المستورد والتطبيق يعملان بـ sabq_runtime: قراءة وكتابة وتحديث، بلا حذف.
GRANT SELECT, INSERT, UPDATE ON TABLE public.logos, public.logo_assets TO sabq_runtime;

COMMIT;

-- يجب أن تكون الأعمدة الثلاثة صحيحة في الصفين.
SELECT
  table_name,
  has_table_privilege('sabq_runtime', 'public.' || table_name, 'SELECT') AS can_read,
  has_table_privilege('sabq_runtime', 'public.' || table_name, 'INSERT') AS can_insert,
  has_table_privilege('sabq_runtime', 'public.' || table_name, 'UPDATE') AS can_update
FROM (VALUES ('logos'), ('logo_assets')) AS t(table_name);
