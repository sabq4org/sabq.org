-- =============================================================================
-- قرارات مالك — Neon production، 2026-11-02
-- لا ينفّذه وكيل. اعتمده المالك في جلسة المراجعة (Neon/Cloudflare/Render 2026-11-02)
-- بعد عرض البندين عليه؛ وُضع خارج migrations/ لأن تلك الملفات إضافية فقط (AGENTS.md
-- § القواعد الثابتة 2 و3): هنا DROP TABLE وتغيير إعدادات على مستوى الجدول.
-- التشغيل: محرر Neon SQL على فرع production بصفة neondb_owner، عبارةً عبارة.
-- =============================================================================

-- أ) جدول نسخة احتياطية من 2026-07-25 (نحو 428 ألف صف، 59 MB). لا يشير إليه أي كود
--    في server/ أو shared/ أو scripts/. اللقطات اليومية (14 يوماً) تحتفظ به بعد الحذف.
--    احتياط إضافي قبل الحذف إن أردت: CREATE TABLE ... AS SELECT في فرع Neon منفصل.
-- 1) جدول نسخة احتياطية من 2026-07-25 (نحو 428 ألف صف، 59 MB). لا يشير إليه أي كود
--    في server/ أو shared/ أو scripts/. اللقطات اليومية تحتفظ به 14 يوماً بعد الحذف.
DROP TABLE IF EXISTS public.role_permissions_backup_2026_07_25;

-- ب) autovacuum أكثر حساسية للجداول الكبيرة. الافتراضي 20% يعني أن articles تنتظر
--    نحو 190 ألف صف ميت قبل أي تفريغ (وهذا ما رأيناه: 19% ميت و682 MB مهدرة)،
--    وarticle_daily_stats لم يُحلَّل قط فاختار المخطِّط خطة تسقط بالمهلة.
--    هذه معاملات تخزين على الجداول نفسها (ALTER TABLE ... SET)، لا إعدادات Neon.
-- 4) autovacuum أكثر حساسية للجداول الكبيرة. الافتراضي 20% يعني أن articles
--    تنتظر نحو 190 ألف صف ميت قبل أي تفريغ (وهذا ما رأيناه: 19% ميت و682 MB مهدرة).
ALTER TABLE public.articles            SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
ALTER TABLE public.article_ip_views    SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
ALTER TABLE public.notifications_inbox SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
ALTER TABLE public.article_daily_stats SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
ALTER TABLE public.reading_history     SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.ai_usage_logs       SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.behavior_logs       SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.sports_name_translations SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);

-- ج) تحقق
SELECT to_regclass('public.role_permissions_backup_2026_07_25') AS backup_table_should_be_null;
SELECT relname, reloptions FROM pg_class
 WHERE relname IN ('articles','article_ip_views','notifications_inbox','article_daily_stats',
                   'reading_history','ai_usage_logs','behavior_logs','sports_name_translations')
 ORDER BY relname;
