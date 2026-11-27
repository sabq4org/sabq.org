-- =============================================================================
-- تنظيف إنتاج Neon — 2026-11-02 (مراجعة Neon/Cloudflare/Render)
-- ينفّذه المالك على فرع production (neondb) بصفة neondb_owner.
--
-- طريقة التشغيل: كل عبارة على حدة. DROP INDEX CONCURRENTLY و VACUUM لا يعملان
-- داخل transaction، فإما محرر Neon SQL عبارةً عبارة، أو psql على النقطة
-- المباشرة (ep-shy-block بلا -pooler) مع الملف كاملاً:
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f migrations/20261102_prod_cleanup_bloat_indexes.sql
-- لا شيء هنا يقفل جدولاً إلا VACUUM FULL على role_permissions (460 صفاً، ثوانٍ).
-- هذا الملف إضافي فقط (فهارس وتفريغ): لا DROP TABLE ولا تغيير إعدادات. قرارا المالك
-- (حذف جدول النسخة الاحتياطية، وضبط autovacuum) في scripts/sql/neon-owner-decisions-2026-11-02.sql.
-- =============================================================================

-- 1) حذف جدول النسخة الاحتياطية role_permissions_backup_2026_07_25 نُقل إلى
--    scripts/sql/neon-owner-decisions-2026-11-02.sql (قرار مالك؛ migrations/ إضافية فقط).

-- 2) role_permissions: 460 صفاً تشغل 88 MB (تضخم ×897 بعد عمليات يوليو).
--    VACUUM FULL يعيد كتابة الجدول وفهارسه؛ القفل أقل من ثانية على هذا الحجم.
VACUUM (FULL, ANALYZE) public.role_permissions;

-- 3) فهارس مكررة بنيوياً: صفر قراءات منذ إعادة الإحصاءات في 2026-10-21،
--    ولكلٍّ منها فهرس آخر يغطيه. أُزيل الأول والثاني من shared/schema.ts في نفس التغيير
--    حتى لا يعيدهما db:push.
DROP INDEX CONCURRENTLY IF EXISTS public.idx_notifications_inbox_user_id;   -- 81 MB؛ يغطيه idx_notifications_inbox_user_created (user_id, created_at)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_article_daily_stats_article;   -- 242 MB؛ يغطيه idx_article_daily_stats_unique (article_id, date)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_legacy_redirects_old_path;     -- 26 MB؛ يغطيه legacy_redirects_old_path_unique
DROP INDEX CONCURRENTLY IF EXISTS public.idx_articles_seo_keywords;         -- 111 MB؛ حلّ محله idx_articles_seo_keywords_gin (jsonb_path_ops، جزئي) الذي ينشئه server/db.ts عند الإقلاع

-- 4) ضبط autovacuum للجداول الكبيرة نُقل إلى scripts/sql/neon-owner-decisions-2026-11-02.sql
--    (تغيير إعدادات على مستوى الجدول؛ قرار مالك خارج migrations/).

-- 5) تفريغ يدوي أولي (عادي، غير قافل). articles قد يأخذ دقائق؛ الباقي أقل.
VACUUM (ANALYZE) public.articles;
VACUUM (ANALYZE) public.reading_history;
VACUUM (ANALYZE) public.article_daily_stats;
VACUUM (ANALYZE) public.notifications_inbox;
VACUUM (ANALYZE) public.article_ip_views;
VACUUM (ANALYZE) public.ai_usage_logs;
VACUUM (ANALYZE) public.behavior_logs;
VACUUM (ANALYZE) public.sports_name_translations;

-- 6) تحقق: الفهارس الأربعة اختفت، وفهرس last_seen موجود، وrole_permissions صغير، والصفوف الميتة انخفضت.
SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN
  ('idx_notifications_inbox_user_id','idx_article_daily_stats_article','idx_legacy_redirects_old_path','idx_articles_seo_keywords');
SELECT pg_size_pretty(pg_total_relation_size('public.role_permissions')) AS role_permissions_total;
SELECT relname, n_live_tup, n_dead_tup, last_vacuum, last_autovacuum
  FROM pg_stat_user_tables
 WHERE relname IN ('articles','reading_history','article_daily_stats','notifications_inbox','article_ip_views')
 ORDER BY relname;

-- -----------------------------------------------------------------------------
-- الدفعة الثانية (غير منفّذة هنا، تحتاج شهراً من الإحصاءات قبل القرار لأن بعضها قد
-- يخدم تقارير شهرية): idx_push_events_campaign/type/user/created (128 MB مجتمعة)،
-- idx_snapshots_story_time (32 MB)، idx_radar_stories_fingerprint (21 MB)،
-- accessibility_events_created_at/event_type/language/user_id (47 MB)،
-- idx_short_link_clicks_link (10 MB). كلها معرّفة في shared/schema.ts.
-- ملاحظة بنيوية: legacy_redirects يحمل قيدين فريدين متطابقين على old_path
-- (legacy_redirects_old_path_key من .unique() في Drizzle، وlegacy_redirects_old_path_unique اليدوي).
-- إزالة أحدهما تحتاج تعديل schema.ts أولاً حتى لا يعيده db:push.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 7) فهرس التنظيف الليلي لـ article_ip_views (يحذف بـ last_seen < now() - 30d).
--    بلا فهرس كان كل batch يمسح 8.7 مليون صف ويسقط بمهلة 15ث، فظل الجدول ينمو
--    (سجل Render 2026-11-02 03:00: "Batch delete error on article_ip_views").
--    بعد إنشائه يحذف الكرون القديم تدريجياً (10 آلاف صف × 200 دفعة كل ليلة).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_article_ip_views_last_seen
  ON public.article_ip_views (last_seen);

-- 8) تم بالفعل في 2026-11-02 07:11 UTC عبر MCP (ANALYZE فقط، بلا تغيير بنية):
--    ANALYZE article_daily_stats / reading_history. قبل ذلك لم يُحلَّل جدول الإحصاءات
--    اليومية قط، فكان المخطِّط يختار فهرس date ويرشّح 1.5 مليون صف لكل طلب تحليلات
--    كاتب (>15ث، يسقط بالمهلة)؛ بعده يستخدم (article_id, date): 266ms.
--    ضبط autovacuum في ملف قرارات المالك يمنع تكرار ذلك.
