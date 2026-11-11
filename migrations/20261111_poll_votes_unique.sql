-- قيد فريد على أصوات استطلاعات المقالات (poll_votes) — مطابق لتعريف الجدول في
-- shared/schema.ts. تدقيق 2026-11-10 (م-10): فحص «صوّت سابقًا» كان في الكود فقط
-- (اقرأ ثم أدرج)، فطلبان متوازيان يسجّلان صوتين.
--
-- القيد على (الاستطلاع، الخيار، المصوّت) لا على (الاستطلاع، المصوّت): استطلاع
-- allow_multiple_votes يسمح للمصوّت بأكثر من خيار، فلا يُمنع ذلك هنا. منع
-- الصوت الثاني في الاستطلاع العادي يتولاه الكود بقفل استشاري داخل المعاملة
-- (server/routes/pollsRoutes.ts)، وهذا القيد خط الدفاع الأخير ضد تكرار الخيار نفسه.
--
-- إضافي فقط: فهرسان جزئيان، لا تعديل على صفوف ولا أعمدة. آمن للتكرار.
-- يُنفَّذ بمالك الجداول في Neon SQL Editor. ترتيب النشر لا يهم: الكود يعمل
-- قبل الفهرسين وبعدهما.
--
-- التنفيذ على ثلاث خطوات منفصلة (شغّل كل خطوة وحدها):
--   1) فحص التكرار الموجود (قراءة فقط) — يجب أن يعيد صفرين
--   2) الفهرسان CONCURRENTLY (خارج أي transaction، كل عبارة وحدها)
--   3) التحقق
--
-- التراجع (لا يحذف بيانات):
--   DROP INDEX CONCURRENTLY IF EXISTS uq_poll_votes_option_user;
--   DROP INDEX CONCURRENTLY IF EXISTS uq_poll_votes_option_session;

-- ───────────── الخطوة 1: فحص (قراءة فقط) ─────────────
-- إن أعاد أي عمود رقمًا غير صفر فتوقف ولا تشغّل الخطوة 2: الفهرس سيفشل ويبقى
-- بحالة INVALID. الأصوات المكررة تُعالج أولًا بخطة منفصلة.
SELECT
  (SELECT count(*) FROM (
     SELECT 1 FROM poll_votes
     WHERE user_id IS NOT NULL
     GROUP BY poll_id, option_id, user_id HAVING count(*) > 1) d) AS duplicate_user_votes,
  (SELECT count(*) FROM (
     SELECT 1 FROM poll_votes
     WHERE user_id IS NULL AND session_id IS NOT NULL
     GROUP BY poll_id, option_id, session_id HAVING count(*) > 1) d) AS duplicate_session_votes;

-- ───────────── الخطوة 2: الفهرسان (كل عبارة وحدها، خارج transaction) ─────────────
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_poll_votes_option_user
  ON poll_votes (poll_id, option_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_poll_votes_option_session
  ON poll_votes (poll_id, option_id, session_id)
  WHERE user_id IS NULL AND session_id IS NOT NULL;

-- ───────────── الخطوة 3: التحقق ─────────────
-- المتوقع: صفّان، وكلاهما is_valid = true و is_unique = true.
SELECT c.relname AS index_name, i.indisvalid AS is_valid, i.indisunique AS is_unique
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname IN ('uq_poll_votes_option_user', 'uq_poll_votes_option_session')
ORDER BY 1;
