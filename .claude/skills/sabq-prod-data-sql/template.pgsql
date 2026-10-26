-- =====================================================================
-- <العنوان: ماذا يصحح هذا الملف>
--
-- المشكلة: <سطر أو سطران بلغة بسيطة>
-- ماذا يفعل: <الأعمدة التي تتغير فقط>
-- لا يمس: <ما لا يتغير: بلا حذف، بلا إشعارات، ...>
-- العدد المتوقع وقت التجهيز (<YYYY-MM-DD HH:MM> بتوقيت الرياض): <N> صف
--
-- شغّله في Neon Console على قاعدة sabq.org – PRODUCTION
-- الخطوات بالترتيب: 1 ثم 2 ثم 3 ثم 4. الخطوة 5 للتراجع فقط.
-- =====================================================================

-- ═══ الخطوة 1: نسخة احتياطية (جدول جديد، لا يمس الأصل) ═══
CREATE SCHEMA IF NOT EXISTS ops_backup;

CREATE TABLE ops_backup.<table>_<topic>_<YYYYMMDD> AS
SELECT id, <column> AS old_<column>, updated_at AS old_updated_at, now() AS prepared_at
FROM <table>
WHERE id IN (
  '<id-1>',  -- <وصف>
  '<id-2>'   -- <وصف>
);

-- ═══ الخطوة 2: معاينة (المتوقع <N> صف) ═══
SELECT * FROM ops_backup.<table>_<topic>_<YYYYMMDD>;

-- ═══ الخطوة 3: التحديث (يرفض إن تغيّر أي صف منذ النسخة الاحتياطية) ═══
-- العدد المتوقع يُقرأ من النسخة نفسها، فلا يفشل الملف إن وصلت صفوف جديدة بعد التجهيز.
DO $$
DECLARE
  expected int;
  matched int;
  changed int;
BEGIN
  SELECT count(*) INTO expected FROM ops_backup.<table>_<topic>_<YYYYMMDD>;

  SELECT count(*) INTO matched
  FROM <table> t
  JOIN ops_backup.<table>_<topic>_<YYYYMMDD> b ON b.id = t.id
  WHERE t.<column> IS NOT DISTINCT FROM b.old_<column>;

  IF expected = 0 OR matched <> expected THEN
    RAISE EXCEPTION 'في النسخة % صف، والمطابق الآن %، أُلغي التنفيذ', expected, matched;
  END IF;

  UPDATE <table> t
  SET <column> = <new value>,
      updated_at = now()
  FROM ops_backup.<table>_<topic>_<YYYYMMDD> b
  WHERE t.id = b.id;
  GET DIAGNOSTICS changed = ROW_COUNT;

  IF changed <> expected THEN
    RAISE EXCEPTION 'تغير % صف بدل %، أُلغي كل شيء', changed, expected;
  END IF;
END $$;

-- ═══ الخطوة 4: التحقق ═══
SELECT t.id, b.old_<column>, t.<column> AS new_<column>
FROM <table> t
JOIN ops_backup.<table>_<topic>_<YYYYMMDD> b ON b.id = t.id;

-- ═══ الخطوة 5: الاستعادة (لا تنفّذها إلا للتراجع) ═══
-- UPDATE <table> t
-- SET <column> = b.old_<column>, updated_at = b.old_updated_at
-- FROM ops_backup.<table>_<topic>_<YYYYMMDD> b
-- WHERE t.id = b.id;
