-- صفحة الكاتب: فهارس عمود المراسل (2026-10-31)
--
-- السبب: /api/v1/authors/by-name (iOS/Android) و/api/authors/by-name (الويب)
-- تبحث بالشرط (reporter_id = X OR author_id = X) AND status = 'published'.
-- author_id عليه idx_articles_author_status، أما reporter_id فبلا فهرس عام،
-- فيتحول الشرط إلى مسح كامل لجدول المقالات (أول فتح لكاتب ~3 ث).
-- مع الفهرسين يستخدم Postgres BitmapOr لكل الاستعلامات، والقائمة تُقرأ
-- مرتبة بتاريخ النشر مباشرة.
--
-- التشغيل: في محرر Neon SQL، كل أمر وحده (CONCURRENTLY لا يعمل داخل
-- transaction). لا يقفل الجدول ولا يحذف شيئًا. آمن للإعادة (IF NOT EXISTS).
-- لا جداول جديدة، فلا حاجة لـ GRANT على sabq_runtime.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_articles_reporter_published
  ON articles (reporter_id, published_at DESC)
  WHERE status = 'published';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_articles_author_published
  ON articles (author_id, published_at DESC)
  WHERE status = 'published';

-- تحقق: يجب أن يظهر الفهرسان وحالتهما valid = true.
SELECT c.relname AS index_name, i.indisvalid AS valid
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname IN ('idx_articles_reporter_published', 'idx_articles_author_published');
