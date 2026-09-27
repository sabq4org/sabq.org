-- مواعيدك — صلاحيات حساب التشغيل sabq_runtime.
-- الجداول يملكها neondb_owner. حساب Railway sabq_runtime لا يرثها،
-- فيفشل SELECT بـ 42501 permission denied for table mawaeed_series.
-- يُشغَّل بمالك الجداول بعد migrations/20260927_mawaeed.sql.
-- GRANT متكرر آمن. إن لم يوجد الدور (التطوير المحلي) يُتخطى المنح.
-- لا يغيّر البيانات ولا الملكية، ولا يُنفَّذ تلقائيًا مع نشر الكود.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      public.mawaeed_series,
      public.mawaeed_occurrences,
      public.mawaeed_changes
    TO sabq_runtime;
  END IF;
END
$$;
