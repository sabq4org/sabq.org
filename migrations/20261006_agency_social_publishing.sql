-- النشر الاجتماعي لأخبار الوكالات.
-- إضافي فقط: أعمدة جديدة، لا يتغير أي صف موجود (الوكالات الحالية تأخذ approval).
-- يُطبَّق على الإنتاج قبل نشر الكود الذي يقرأ الأعمدة.
-- التراجع (بقرار صريح فقط):
--   ALTER TABLE social_posts DROP COLUMN IF EXISTS requested_at;
--   ALTER TABLE social_posts DROP COLUMN IF EXISTS publisher_id;
--   ALTER TABLE publishers DROP COLUMN IF EXISTS social_publish_mode;
ALTER TABLE publishers ADD COLUMN IF NOT EXISTS social_publish_mode text NOT NULL DEFAULT 'approval';
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS publisher_id varchar REFERENCES publishers(id) ON DELETE SET NULL;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS requested_at timestamp;
CREATE INDEX IF NOT EXISTS social_posts_publisher_idx ON social_posts (publisher_id) WHERE publisher_id IS NOT NULL;
