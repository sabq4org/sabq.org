-- لوحة المراسل «أخباري»: فهارس صاحب المحتوى على كل الحالات (2026-10-31)
--
-- السبب: /api/reporter/analytics (وصفحات الكاتب/المراسل في الويب والتطبيق)
-- تبحث بالشرط (author_id = X OR reporter_id = X OR submitter_id = X) على كل
-- الحالات (مسودة/منشور/مؤرشف). author_id له فهرس، أما reporter_id فله فهرس
-- جزئي للمنشور فقط (20261031_author_page_indexes.sql)، وsubmitter_id بلا فهرس،
-- فيتحول الشرط إلى مسح كامل لجدول المقالات (~950 ألف صف): 11–15 ثانية في
-- سجلات Render (07:30Z و07:52Z) وتظهر الصفحة هياكل رمادية طويلًا.
-- مع الفهرسين يستخدم Postgres ‏BitmapOr فيقرأ صفوف المراسل وحدها.
--
-- التشغيل: في محرر Neon SQL، كل أمر وحده (CONCURRENTLY لا يعمل داخل
-- transaction). لا يقفل الجدول ولا يحذف شيئًا. آمن للإعادة (IF NOT EXISTS).
-- لا جداول جديدة، فلا حاجة لـ GRANT على sabq_runtime.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_articles_reporter_status
  ON articles (reporter_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_articles_submitter_status
  ON articles (submitter_id, status);

-- تحقق: يجب أن يظهر الفهرسان وحالتهما valid = true.
SELECT c.relname AS index_name, i.indisvalid AS valid
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname IN ('idx_articles_reporter_status', 'idx_articles_submitter_status');
