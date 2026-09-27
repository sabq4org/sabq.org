-- مواعيدك — صلاحيات حساب التشغيل sabq_runtime.
-- الجداول أُنشئت بمالك الهجرة (neondb_owner). حساب Railway
-- sabq_runtime لا يرث صلاحيتها، فيفشل SELECT بـ 42501
-- permission denied for table mawaeed_series.
-- يُشغَّل بمالك الجداول على neondb. لا يغيّر البيانات ولا الملكية.
-- GRANT متكرر آمن. لا يُنفَّذ مع نشر الكود تلقائيًا.

GRANT SELECT, UPDATE ON TABLE public.mawaeed_series TO sabq_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.mawaeed_occurrences TO sabq_runtime;
GRANT SELECT, INSERT ON TABLE public.mawaeed_changes TO sabq_runtime;
