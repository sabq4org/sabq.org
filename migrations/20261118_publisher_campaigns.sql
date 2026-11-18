-- ملف الحملة للوكالات (publisher_campaigns + publisher_campaign_articles) — مطابق لتعريفهما في shared/schema.ts.
-- إضافي فقط: جدولان جديدان لا يلمسان أي جدول موجود. آمن للتكرار (IF NOT EXISTS).
-- يُنفَّذ بمالك الجداول (neondb_owner) قبل دمج الكود، لأن حساب API (sabq_runtime) لا يملك CREATE.
-- التراجع: DROP TABLE IF EXISTS publisher_campaign_articles, publisher_campaigns;  (بقرار صريح فقط)
BEGIN;

CREATE TABLE IF NOT EXISTS publisher_campaigns (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id varchar NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  name text NOT NULL,
  client_name text,
  starts_on date,
  ends_on date,
  note text,
  status text NOT NULL DEFAULT 'active', -- active | archived
  created_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS publisher_campaigns_publisher_idx ON publisher_campaigns (publisher_id);
CREATE INDEX IF NOT EXISTS publisher_campaigns_status_idx ON publisher_campaigns (status);

CREATE TABLE IF NOT EXISTS publisher_campaign_articles (
  campaign_id varchar NOT NULL REFERENCES publisher_campaigns(id) ON DELETE CASCADE,
  article_id varchar NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  added_by varchar REFERENCES users(id) ON DELETE SET NULL,
  added_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, article_id)
);
CREATE INDEX IF NOT EXISTS publisher_campaign_articles_article_idx ON publisher_campaign_articles (article_id);

-- التطبيق يقرأ ويكتب الحملات بلا حذف (الإخفاء بالأرشفة)،
-- ويحذف صف الربط فقط عند إزالة خبر من الحملة (الخبر نفسه لا يُمس).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.publisher_campaigns TO sabq_runtime;
    GRANT SELECT, INSERT, DELETE ON TABLE public.publisher_campaign_articles TO sabq_runtime;
  ELSE
    RAISE EXCEPTION 'sabq_runtime role not found';
  END IF;
END $$;

COMMIT;

-- يجب أن تكون كل القيم true.
SELECT
  has_table_privilege('sabq_runtime', 'public.publisher_campaigns', 'SELECT') AS campaigns_read,
  has_table_privilege('sabq_runtime', 'public.publisher_campaigns', 'INSERT') AS campaigns_insert,
  has_table_privilege('sabq_runtime', 'public.publisher_campaigns', 'UPDATE') AS campaigns_update,
  has_table_privilege('sabq_runtime', 'public.publisher_campaign_articles', 'SELECT') AS links_read,
  has_table_privilege('sabq_runtime', 'public.publisher_campaign_articles', 'INSERT') AS links_insert,
  has_table_privilege('sabq_runtime', 'public.publisher_campaign_articles', 'DELETE') AS links_delete;
