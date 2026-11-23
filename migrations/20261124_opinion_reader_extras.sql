-- إضافات مقال الرأي: «جملة المقال» + «أوافق / لا أوافق» + تغيير الكاتب لموعد مقاله مرة واحدة.
-- إضافي فقط: جدولان جديدان وفهرس، لا يلمس أي جدول أو صف موجود. آمن للتكرار.
-- يُنفَّذ بمالك الجداول في محرر Neon قبل دمج الـPR.
-- يعتمد على articles و users و article_polls (موجودة).
-- أصوات «أوافق» تُحفظ في article_polls/poll_options/poll_votes القائمة (لحساب التطبيق صلاحيات عليها أصلًا).
-- التراجع (لا يُنفذ إلا بقرار صريح):
--   DROP TABLE IF EXISTS opinion_writer_reschedules;
--   DROP TABLE IF EXISTS opinion_article_extras;
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS opinion_article_extras (
  article_id varchar PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  pull_quote text,
  agree_vote_enabled boolean NOT NULL DEFAULT false,
  agree_poll_id varchar REFERENCES article_polls(id) ON DELETE SET NULL,
  updated_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- المفتاح الأساسي هو المقال: يضمن «مرة واحدة لكل مقال» على مستوى القاعدة.
CREATE TABLE IF NOT EXISTS opinion_writer_reschedules (
  article_id varchar PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  writer_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_at timestamp NOT NULL,
  to_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opinion_writer_reschedules_writer
  ON opinion_writer_reschedules (writer_id);

-- حساب التطبيق: قراءة وإضافة وتحديث فقط (لا حذف).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE opinion_article_extras TO sabq_runtime;
    GRANT SELECT, INSERT, UPDATE ON TABLE opinion_writer_reschedules TO sabq_runtime;
  END IF;
END $$;

COMMIT;

-- التحقق بعد التنفيذ (المتوقع: الجدولان موجودان وكل الصلاحيات true):
SELECT to_regclass('public.opinion_article_extras') AS extras_table,
       to_regclass('public.opinion_writer_reschedules') AS reschedules_table;
SELECT t AS table_name,
       has_table_privilege('sabq_runtime', t, 'SELECT') AS can_select,
       has_table_privilege('sabq_runtime', t, 'INSERT') AS can_insert,
       has_table_privilege('sabq_runtime', t, 'UPDATE') AS can_update
FROM unnest(ARRAY['public.opinion_article_extras', 'public.opinion_writer_reschedules']) AS t
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime');
-- حساب التطبيق يكتب في جداول الاستطلاع القائمة (إنشاء استطلاع «أوافق» عند أول عرض):
SELECT t AS poll_table,
       has_table_privilege('sabq_runtime', t, 'INSERT') AS can_insert,
       has_table_privilege('sabq_runtime', t, 'UPDATE') AS can_update
FROM unnest(ARRAY['public.article_polls', 'public.poll_options', 'public.poll_votes']) AS t
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime');
