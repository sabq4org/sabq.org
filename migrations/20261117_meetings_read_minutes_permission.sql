-- صلاحية meetings.read_minutes — قراءة التفريغ الخام ومسودة المحضر عبر واجهة البوت فقط.
--
-- لماذا: توكن البوت المساعد مملوك لحساب ليس هو منشئ الاجتماعات، والتفريغ ومسودة
-- المحضر للمضيف أو meetings.manage فقط. منح meetings.manage أو دور admin يفتح أكثر
-- مما يلزم بكثير. هذه الصلاحية تعمل في مسارين فقط:
--   GET /api/internal/bot-desk/meetings/:id/transcript
--   GET /api/internal/bot-desk/meetings/:id/minutes
-- ولا توسّع الظهور (الاجتماع يجب أن يكون متاحاً للحساب أصلاً)، ولا تعمل في مسارات
-- اللوحة، ولا تمنح إدارة أو تعديلاً أو اعتماداً.
--
-- إضافي فقط وآمن للتكرار: صف في permissions (لتظهر في شاشة الصلاحيات) + استثناء
-- allow لحساب واحد في user_permission_overrides. لا جداول جديدة ولا GRANT مطلوب
-- (sabq_runtime يقرأ الجدولين أصلاً). ليست في أي دور ولا في role_permissions.
-- يُنفَّذ بمالك الجداول في محرر Neon. الكود يعمل قبل التنفيذ وبعده (بلا الصف لا
-- يملك أحد الصلاحية سوى المدير العام).
--
-- ملاحظة: كاش الصلاحيات في الخادم لكل مستخدم — قد يتأخر أثر المنح دقائق.
--
-- التراجع (لا يُنفذ إلا بقرار صريح):
--   DELETE FROM user_permission_overrides WHERE permission_code = 'meetings.read_minutes';
--   DELETE FROM permissions WHERE code = 'meetings.read_minutes';
BEGIN;

INSERT INTO permissions (code, label, label_ar, module, description)
VALUES (
  'meetings.read_minutes',
  'Read meeting transcript and draft minutes (bot API)',
  'قراءة تفريغ الاجتماع ومسودة المحضر (واجهة البوت)',
  'meetings',
  'يقرأ التفريغ الخام ومسودة المحضر عبر /api/internal/bot-desk/meetings/:id/{transcript,minutes} لاجتماع متاح للحساب أصلاً. قراءة فقط؛ لا إدارة ولا اعتماد، ولا تعمل في مسارات اللوحة.'
)
ON CONFLICT (code) DO NOTHING;

-- المنح لحساب واحد بعينه. يفشل صراحةً إن لم يوجد الحساب بدل أن يمر صامتاً.
DO $$
DECLARE
  target_id varchar;
BEGIN
  SELECT id INTO target_id FROM users WHERE lower(email) = 'aalhazmi@sabq.org';
  IF target_id IS NULL THEN
    RAISE EXCEPTION 'الحساب aalhazmi@sabq.org غير موجود — لم تُمنح الصلاحية';
  END IF;
  INSERT INTO user_permission_overrides (user_id, permission_code, effect, reason)
  VALUES (
    target_id,
    'meetings.read_minutes',
    'allow',
    'البوت المساعد يكتب محاضر الاجتماعات من التفريغ عبر bot-desk (2026-11-17)'
  )
  ON CONFLICT (user_id, permission_code) DO UPDATE SET effect = 'allow';
END $$;

COMMIT;

-- تحقق: صف الصلاحية، وصف الاستثناء، وأنها ليست في أي دور (المتوقع: 1، 1، 0).
SELECT
  (SELECT count(*) FROM permissions WHERE code = 'meetings.read_minutes') AS permission_rows,
  (SELECT count(*)
     FROM user_permission_overrides o
     JOIN users u ON u.id = o.user_id
    WHERE o.permission_code = 'meetings.read_minutes'
      AND o.effect = 'allow'
      AND lower(u.email) = 'aalhazmi@sabq.org') AS granted_to_owner,
  (SELECT count(*)
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
    WHERE p.code = 'meetings.read_minutes') AS roles_with_permission;
