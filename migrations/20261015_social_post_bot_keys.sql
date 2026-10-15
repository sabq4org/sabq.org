-- social_post_bot_keys — مفتاح عدم التكرار لبوت النشر على X.
-- يطابق تعريف shared/schema.ts (socialPostBotKeys) والشكل القائم:
--   أعمدة id / bot_name / client_reference / post_id / created_at
--   الأنواع varchar و text و timestamp (بدون منطقة زمنية)
--   الافتراضيات gen_random_uuid() و now()
--   المفتاح الأساسي social_post_bot_keys_pkey
--   الفهرسان الفريدان social_post_bot_keys_bot_ref_unique و social_post_bot_keys_post_unique
--   القيد social_post_bot_keys_post_id_social_posts_id_fk → social_posts(id) ON DELETE CASCADE
--
-- إضافي وغير مدمّر: لا DROP ولا ALTER لأعمدة قائمة ولا تغيير بيانات.
-- CREATE TABLE IF NOT EXISTS يتخطى الجدول إن وُجد (الإنتاج ونسخته).
-- الفهارس الفريدة تُنشأ بـ CREATE INDEX CONCURRENTLY، وهذا الأمر مرفوض داخل
-- معاملة. لا تغلّف الملف بـ BEGIN/COMMIT ولا تشغّله بـ psql --single-transaction.
-- شغّله بـ autocommit (كل أمر في معاملته). جدول social_posts يجب أن يكون موجودًا.
--
-- ملفات migrations/ المؤرخة يدوية وليست مدخلات في migrations/meta/_journal.json
-- (السجل يضم لقطة Drizzle الأولى فقط). لا تُضاف هنا.
--
-- يُنفَّذ بمالك الجداول (neondb_owner). حساب API هو sabq_runtime ولا يرث
-- صلاحيات الجداول الجديدة. التطبيق يقرأ ويُدرج فقط؛ الحذف المتسلسل عند حذف
-- social_posts يجري بصلاحية مالك الجدول. المنح الأدنى: SELECT, INSERT.
-- GRANT متكرر آمن، ويُتخطى إن غاب الدور (التطوير المحلي).

CREATE TABLE IF NOT EXISTS public.social_post_bot_keys (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  bot_name text NOT NULL,
  client_reference text NOT NULL,
  post_id varchar NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT social_post_bot_keys_post_id_social_posts_id_fk
    FOREIGN KEY (post_id)
    REFERENCES public.social_posts (id)
    ON DELETE cascade
    ON UPDATE no action
);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS social_post_bot_keys_bot_ref_unique
  ON public.social_post_bot_keys USING btree (bot_name, client_reference);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS social_post_bot_keys_post_unique
  ON public.social_post_bot_keys USING btree (post_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT ON TABLE public.social_post_bot_keys TO sabq_runtime;
  END IF;
END
$$;

-- يجب أن يكون الجدول موجودًا. إن وُجد sabq_runtime فالقراءة والإدراج صحيحتان.
SELECT
  to_regclass('public.social_post_bot_keys') AS table_name,
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') AS runtime_role_exists,
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime')
    THEN has_table_privilege('sabq_runtime', 'public.social_post_bot_keys', 'SELECT')
  END AS can_read,
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime')
    THEN has_table_privilege('sabq_runtime', 'public.social_post_bot_keys', 'INSERT')
  END AS can_insert;
