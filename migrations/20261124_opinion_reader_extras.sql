-- إضافات مقال الرأي: «جملة المقال» + «أوافق / لا أوافق» + فرصة تغيير الموعد الأسبوعي مرة واحدة.
-- إضافي فقط: ثلاثة جداول جديدة وفهارسها، لا يلمس أي جدول أو صف موجود. آمن للتكرار.
-- يُنفَّذ بمالك الجداول في محرر Neon قبل دمج الـPR.
-- يعتمد على articles و users و article_polls (موجودة).
-- أصوات «أوافق» تُحفظ في article_polls/poll_options/poll_votes القائمة (لحساب التطبيق صلاحيات عليها أصلًا).
-- تغيير الكاتب لموعده يحدّث opinion_writer_schedules القائم (لحساب التطبيق UPDATE عليه أصلًا).
-- التراجع (لا يُنفذ إلا بقرار صريح):
--   DROP TABLE IF EXISTS opinion_slot_changes;
--   DROP TABLE IF EXISTS opinion_slot_change_rounds;
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

-- «فرصة» تغيير الموعد تفتحها إدارة التحرير (closes_at فارغ = حتى تُغلق).
CREATE TABLE IF NOT EXISTS opinion_slot_change_rounds (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_by varchar REFERENCES users(id) ON DELETE SET NULL,
  opened_at timestamp NOT NULL DEFAULT now(),
  closes_at timestamp,
  closed_at timestamp,
  closed_by varchar REFERENCES users(id) ON DELETE SET NULL,
  note text
);

-- تغيير واحد لكل كاتب في كل فرصة، مضمون بالفهرس الفريد.
CREATE TABLE IF NOT EXISTS opinion_slot_changes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id varchar NOT NULL REFERENCES opinion_slot_change_rounds(id) ON DELETE CASCADE,
  writer_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_weekday integer NOT NULL,
  from_time varchar(5) NOT NULL,
  to_weekday integer NOT NULL,
  to_time varchar(5) NOT NULL,
  terms_accepted_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_opinion_slot_changes_round_writer
  ON opinion_slot_changes (round_id, writer_id);
CREATE INDEX IF NOT EXISTS idx_opinion_slot_changes_writer
  ON opinion_slot_changes (writer_id);

-- حساب التطبيق: قراءة وإضافة وتحديث فقط (لا حذف).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE opinion_article_extras TO sabq_runtime;
    GRANT SELECT, INSERT, UPDATE ON TABLE opinion_slot_change_rounds TO sabq_runtime;
    GRANT SELECT, INSERT, UPDATE ON TABLE opinion_slot_changes TO sabq_runtime;
  END IF;
END $$;

COMMIT;

-- التحقق بعد التنفيذ (المتوقع: الجداول الثلاثة موجودة وكل الصلاحيات true):
SELECT to_regclass('public.opinion_article_extras') AS extras_table,
       to_regclass('public.opinion_slot_change_rounds') AS rounds_table,
       to_regclass('public.opinion_slot_changes') AS changes_table;
SELECT t AS table_name,
       has_table_privilege('sabq_runtime', t, 'SELECT') AS can_select,
       has_table_privilege('sabq_runtime', t, 'INSERT') AS can_insert,
       has_table_privilege('sabq_runtime', t, 'UPDATE') AS can_update
FROM unnest(ARRAY['public.opinion_article_extras', 'public.opinion_slot_change_rounds', 'public.opinion_slot_changes']) AS t
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime');
-- جداول قائمة يكتب فيها حساب التطبيق (استطلاع «أوافق» وتحديث الموعد الأسبوعي):
SELECT t AS existing_table,
       has_table_privilege('sabq_runtime', t, 'INSERT') AS can_insert,
       has_table_privilege('sabq_runtime', t, 'UPDATE') AS can_update
FROM unnest(ARRAY['public.article_polls', 'public.poll_options', 'public.poll_votes', 'public.opinion_writer_schedules']) AS t
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime');
