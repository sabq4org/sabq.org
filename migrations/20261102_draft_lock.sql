-- «قفل المسودات» (shared/draftLock.ts) — مطابق لأعمدة articles في shared/schema.ts.
-- إضافي فقط: أربعة أعمدة فارغة (بلا قيمة افتراضية، فلا يُعاد كتابة الجدول)،
-- وفهرس جزئي صغير، ومُشغِّل يمسح القفل حين تغادر المادة حالة المسودة.
-- يُنفَّذ بمالك الجداول في Neon SQL Editor **قبل دمج الكود** (الكود يقرأ الأعمدة
-- في قائمة المقالات؛ دمجه قبلها يكسر القائمة). آمن للتكرار.
--
-- التنفيذ على ثلاث خطوات منفصلة (شغّل كل خطوة وحدها):
--   1) الأعمدة + المُشغِّل + الصلاحيات (داخل transaction، قفل لحظي على articles)
--   2) الفهرس CONCURRENTLY (خارج أي transaction)
--   3) التحقق
--
-- التراجع (لا يُنفذ إلا بقرار صريح؛ لا يحذف بيانات أخبار):
--   DROP TRIGGER IF EXISTS trg_articles_clear_draft_lock ON articles;
--   DROP FUNCTION IF EXISTS articles_clear_draft_lock();
--   DROP INDEX CONCURRENTLY IF EXISTS idx_articles_draft_locked;
--   (الأعمدة تبقى؛ حذفها خطة منفصلة)

-- ───────────── الخطوة 1 ─────────────
BEGIN;
-- لا ننتظر خلف استعلام طويل: إن انتهت المهلة أعد تشغيل الخطوة بعد دقيقة.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE articles ADD COLUMN IF NOT EXISTS draft_locked_by varchar;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS draft_locked_by_name text;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS draft_locked_at timestamp;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS draft_lock_note text;

-- القفل للمسودة فقط: أي انتقال لحالة أخرى (نشر، جدولة، أرشفة، جاهز للنشر)
-- يمسحه، فلا يعود قفل قديم للحياة إن رجعت المادة مسودة لاحقًا.
CREATE OR REPLACE FUNCTION articles_clear_draft_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.draft_locked_by IS NOT NULL AND NEW.status IS DISTINCT FROM 'draft' THEN
    NEW.draft_locked_by := NULL;
    NEW.draft_locked_by_name := NULL;
    NEW.draft_locked_at := NULL;
    NEW.draft_lock_note := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_articles_clear_draft_lock ON articles;
CREATE TRIGGER trg_articles_clear_draft_lock
  BEFORE UPDATE OF status ON articles
  FOR EACH ROW
  WHEN (NEW.draft_locked_by IS NOT NULL AND NEW.status IS DISTINCT FROM 'draft')
  EXECUTE FUNCTION articles_clear_draft_lock();

-- sabq_runtime يقرأ ويكتب هذه الأعمدة (منحة على الأعمدة لا تضر إن كانت منحة الجدول قائمة).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT (draft_locked_by, draft_locked_by_name, draft_locked_at, draft_lock_note) ON TABLE public.articles TO sabq_runtime;
    GRANT UPDATE (draft_locked_by, draft_locked_by_name, draft_locked_at, draft_lock_note) ON TABLE public.articles TO sabq_runtime;
  ELSE
    RAISE EXCEPTION 'sabq_runtime role not found — grant manually before deploying';
  END IF;
END $$;
COMMIT;

-- ───────────── الخطوة 2 (وحدها، خارج transaction) ─────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_articles_draft_locked
  ON articles (draft_locked_at)
  WHERE draft_locked_by IS NOT NULL;

-- ───────────── الخطوة 3: تحقق — كل القيم true و 4 أعمدة و 0 مقفلة ─────────────
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'articles'
       AND column_name IN ('draft_locked_by', 'draft_locked_by_name', 'draft_locked_at', 'draft_lock_note')) AS columns_added,
  has_column_privilege('sabq_runtime', 'public.articles', 'draft_locked_by', 'SELECT') AS can_select,
  has_column_privilege('sabq_runtime', 'public.articles', 'draft_locked_by', 'UPDATE') AS can_update,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_articles_clear_draft_lock') AS trigger_ready,
  EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_articles_draft_locked') AS index_ready,
  (SELECT indisvalid FROM pg_index WHERE indexrelid = 'public.idx_articles_draft_locked'::regclass) AS index_valid,
  (SELECT count(*) FROM articles WHERE draft_locked_by IS NOT NULL) AS locked_now;
