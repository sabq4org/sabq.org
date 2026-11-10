-- حالة الدور: active | closed | disabled | archived (shared/userAdmin.ts).
-- إضافي فقط: عمود بقيمة افتراضية ثابتة (تعديل وصفي سريع في Postgres 11+)
-- وقيد CHECK. لا يغيّر أي دور أو إسناد؛ كل الأدوار الحالية تصبح active.
-- قابل لإعادة التنفيذ. **يُنفَّذ بمالك الجداول في محرر Neon قبل دمج الفرع:**
-- بعد الدمج يذكر Drizzle العمود في كل select/insert على roles (seedRBAC عند
-- الإقلاع، تغيير الدور، اعتماد الكتّاب)، فيفشل كل ذلك بـ 42703 إن لم يوجد العمود.
-- الكود القديم لا يتأثر بالعمود الجديد، فالتنفيذ المبكر آمن.
BEGIN;

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'roles_status_check' AND conrelid = 'public.roles'::regclass
  ) THEN
    ALTER TABLE public.roles
      ADD CONSTRAINT roles_status_check
      CHECK (status IN ('active', 'closed', 'disabled', 'archived'));
  END IF;
END $$;

COMMIT;

-- التحقق: كل الأدوار active، وsabq_runtime يقرأ العمود ويحدّثه.
SELECT status, count(*) FROM public.roles GROUP BY status;

SELECT
  has_column_privilege('sabq_runtime', 'public.roles', 'status', 'SELECT') AS runtime_can_read,
  has_column_privilege('sabq_runtime', 'public.roles', 'status', 'UPDATE') AS runtime_can_update
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime');
