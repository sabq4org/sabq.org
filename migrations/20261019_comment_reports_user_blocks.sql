-- بلاغات التعليقات وحظر المستخدمين (بند أبل 1.2) — مطابقة لتعريفها في shared/schema.ts
-- (commentReports, userBlocks). إضافي فقط: جدولان جديدان لا يلمسان أي جدول موجود.
-- آمن للتكرار (IF NOT EXISTS). يُنفَّذ بمالك الجداول (neondb_owner) في Neon SQL Editor
-- قبل دمج PR الإبلاغ والحظر؛ حساب API هو sabq_runtime ولا يملك CREATE على public.
-- التراجع: DROP TABLE IF EXISTS comment_reports, user_blocks;  (لا يُنفذ إلا بقرار صريح)
BEGIN;

CREATE TABLE IF NOT EXISTS comment_reports (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id varchar NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  reporter_id varchar NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comment_reports_comment ON comment_reports (comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reports_reporter_created ON comment_reports (reporter_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_reports_unique ON comment_reports (comment_id, reporter_id);

CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id varchar NOT NULL REFERENCES users(id),
  blocked_id varchar NOT NULL REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

-- التطبيق يعمل بـ sabq_runtime. البلاغات: قراءة وإضافة وتحديث (إغلاق البلاغ) بلا حذف.
-- الحظر: يحتاج DELETE لأن «إلغاء الحظر» يحذف الصف.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.comment_reports TO sabq_runtime;
    GRANT SELECT, INSERT, DELETE ON TABLE public.user_blocks TO sabq_runtime;
  ELSE
    RAISE EXCEPTION 'sabq_runtime role not found — grants not applied';
  END IF;
END $$;

COMMIT;

-- يجب أن تكون كل القيم true.
SELECT
  has_table_privilege('sabq_runtime', 'public.comment_reports', 'SELECT') AS reports_read,
  has_table_privilege('sabq_runtime', 'public.comment_reports', 'INSERT') AS reports_insert,
  has_table_privilege('sabq_runtime', 'public.comment_reports', 'UPDATE') AS reports_update,
  has_table_privilege('sabq_runtime', 'public.user_blocks', 'SELECT') AS blocks_read,
  has_table_privilege('sabq_runtime', 'public.user_blocks', 'INSERT') AS blocks_insert,
  has_table_privilege('sabq_runtime', 'public.user_blocks', 'DELETE') AS blocks_delete;
