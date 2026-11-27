-- فهرس لصفحة «أخباري» في بوابة الوكالات (/dashboard/publisher/articles).
-- السبب: لا فهرس على articles.publisher_id، فطلب /api/publisher/portal/articles
-- وعدّاده يمسحان جدول المقالات كله (4.8 و6.4 ثانية في سجلات Render 2026-11-18).
-- إضافي فقط: فهرس جزئي على صفوف الوكالات، لا يغيّر أي بيانات.
-- يُنفَّذ بمالك الجداول في محرر Neon. لا تضعه داخل BEGIN/COMMIT:
-- CREATE INDEX CONCURRENTLY لا يعمل داخل معاملة، ولا يقفل الجدول أثناء البناء.
-- التراجع: DROP INDEX CONCURRENTLY IF EXISTS idx_articles_publisher_created;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_articles_publisher_created
  ON articles (publisher_id, created_at DESC)
  WHERE publisher_id IS NOT NULL;

-- تحقق: يجب أن يظهر صف واحد و indisvalid = true.
-- إن ظهر false (انقطع البناء): نفّذ سطر التراجع أعلاه ثم أعد تنفيذ CREATE.
SELECT c.relname AS index_name, i.indisvalid
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname = 'idx_articles_publisher_created';
