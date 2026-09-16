# تعطل قراءة مركز الذكاء — 2026-09-08

## الدليل

- سجلات Railway عند 05:36:48 و05:36:59 و05:37:07 UTC: فشل `GET /api/admin/ai-hub/overview`؛ PostgreSQL `42501: permission denied for table ai_provider_health`.
- اتصال خدمة `sabq.org` الإنتاجية يستخدم `sabq_runtime` على `neondb` عبر `ep-shy-block-adst1pw6-pooler.c-2.us-east-1.aws.neon.tech`.
- فحص ACL مباشر: القراءة مفقودة على `ai_provider_health` و`ai_budgets` و`ai_config_audit`، وموجودة على بقية جداول AI Hub المستخدمة للقراءة.
- `getOverviewStats` يحتاج أول جدولين؛ تبويب السجل يحتاج الثالث. الواجهة كانت تعرض Skeleton كلما غابت البيانات حتى بعد فشل الطلب.

## الإصلاح التشغيلي — نُفذ بموافقة المستخدم 2026-09-08

نُفذ بمالك الجداول عبر محرر SQL في Neon، مشروع `jolly-sky-77868412`، فرع الإنتاج `br-bold-sound-admvvr1a`، قاعدة `neondb`:

```sql
BEGIN;
GRANT SELECT ON TABLE
  public.ai_provider_health,
  public.ai_budgets,
  public.ai_config_audit
TO sabq_runtime;
COMMIT;
```

لا يغيّر البيانات أو المخطط أو الملكية، ولا يمنح الكتابة. مراجعة مستقلة أكدت نطاق القراءة. حفظ حالة قاطع الدائرة وتحديث الصحة يحتاجان `INSERT/UPDATE`؛ هذا الإصلاح لا يعالج تلك الكتابات ولا يمنحها.

## التحقق

بـحساب تشغيل Railway الفعلي `sabq_runtime`: أعادت `has_table_privilege` القراءة `true` للجداول الثلاثة، بينما بقيت `INSERT/UPDATE=false`. نجح `SELECT 1 FROM <table> LIMIT 1` على كل جدول. جرى التحقق من صفحة الإنتاج المفتوحة في Safari: اختفت حالة التحميل وظهرت مؤشرات النظرة العامة، ومنها 449 طلبًا اليوم وتكلفة اليوم $1.45، مع الرسم وسجل الحوادث. لم يتطلب الإصلاح نشرًا.

إصلاح الواجهة المصاحب يميز فشل الطلب/استجابة null عن التحميل الأولي، ويتيح إعادة المحاولة، ويبقي آخر بيانات ناجحة مع تنبيه عند فشل التحديث. نجحت ثلاثة اختبارات متصفح محلية ببيانات محاكاة، وفحص TypeScript وESLint. يُنشر تعديل الواجهة عبر مسار PR وCloudflare Pages المعتاد.
