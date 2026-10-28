-- مزادات إنفاذ العقارية (/infath) — جداول جديدة وصلاحيتان ودور جديد. إضافي فقط.
-- لا يعدّل ولا يحذف أي جدول أو صف قائم. آمن للتكرار (IF NOT EXISTS / WHERE NOT EXISTS).
-- المصدر البنيوي: shared/schema.ts (infathWeeks, infathChanges).
-- الإنتاج: يشغّله المالك في محرر Neon SQL قبل دمج الكود. المحلي: npm run db:push:local.

BEGIN;

CREATE TABLE IF NOT EXISTS infath_weeks (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  week_end date NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'draft',
  auctions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_note text,
  submitted_by varchar REFERENCES users(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  approved_by varchar REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  published_json jsonb,
  published_summary jsonb,
  published_at timestamptz,
  created_by varchar REFERENCES users(id) ON DELETE SET NULL,
  updated_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT infath_weeks_status_chk CHECK (status IN ('draft', 'pending', 'returned', 'approved')),
  CONSTRAINT infath_weeks_sunday_chk CHECK (EXTRACT(DOW FROM week_start) = 0),
  CONSTRAINT infath_weeks_end_chk CHECK (week_end = week_start + 6)
);
CREATE UNIQUE INDEX IF NOT EXISTS infath_weeks_week_start_uidx ON infath_weeks (week_start);
CREATE INDEX IF NOT EXISTS infath_weeks_published_idx ON infath_weeks (published_at);

CREATE TABLE IF NOT EXISTS infath_changes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id varchar NOT NULL REFERENCES infath_weeks(id) ON DELETE CASCADE,
  actor_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  action varchar(20) NOT NULL,
  note text,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS infath_changes_week_idx ON infath_changes (week_id, created_at);

-- الصلاحيتان: infath.submit (حساب إنفاذ: إدخال وإرسال) و infath.approve (محرر سبق: اعتماد أو إعادة).
INSERT INTO permissions (code, label, label_ar, module, description)
SELECT 'infath.submit', 'Submit Infath auctions', 'إدخال مزادات إنفاذ وإرسالها', 'infath', 'إدخال مزادات الأسبوع ونتائجها وإرسالها لاعتماد سبق'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'infath.submit');

INSERT INTO permissions (code, label, label_ar, module, description)
SELECT 'infath.approve', 'Approve Infath auctions', 'اعتماد مزادات إنفاذ', 'infath', 'اعتماد أسبوع المزادات للنشر في /infath أو إعادته بملاحظة'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'infath.approve');

-- دور حساب إنفاذ: صلاحية الإدخال فقط، لا يرى بقية اللوحة.
INSERT INTO roles (name, name_ar, description, is_system)
SELECT 'infath_partner', 'شريك إنفاذ', 'حساب مركز الإسناد والتصفية: إدخال مزادات الأسبوع فقط', false
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'infath_partner');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'infath_partner' AND p.code = 'infath.submit'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- حساب التشغيل sabq_runtime لا يرث صلاحيات الجداول الجديدة. لا DELETE: التطبيق لا يحذف.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.infath_weeks, public.infath_changes TO sabq_runtime;
  ELSE
    RAISE NOTICE 'sabq_runtime غير موجود — تخطّي المنح (بيئة محلية)';
  END IF;
END
$$;

COMMIT;

-- تحقق: يجب أن تكون الأعمدة الثلاثة true في الصفين (على الإنتاج).
SELECT
  table_name,
  has_table_privilege('sabq_runtime', 'public.' || table_name, 'SELECT') AS can_read,
  has_table_privilege('sabq_runtime', 'public.' || table_name, 'INSERT') AS can_insert,
  has_table_privilege('sabq_runtime', 'public.' || table_name, 'UPDATE') AS can_update
FROM (VALUES ('infath_weeks'), ('infath_changes')) AS t(table_name);

-- تحقق: الصلاحيتان والدور.
SELECT code FROM permissions WHERE code IN ('infath.submit', 'infath.approve') ORDER BY code;
SELECT r.name, p.code FROM roles r JOIN role_permissions rp ON rp.role_id = r.id JOIN permissions p ON p.id = rp.permission_id WHERE r.name = 'infath_partner';
