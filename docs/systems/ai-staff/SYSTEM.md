# فريق سبق الذكي (`ai-staff`)

> آخر مراجعة: 2026-08-24 | المالك: فريق التحرير التقني

## الغرض

طبقة هوية فوق بوابة AI Hub: تقدّم أنظمة الذكاء العاملة في سبق كـ«موظفين رقميين» بأسماء وأدوار وصور وهيكل تنظيمي قمته بشرية دائمًا (رئيس التحرير). لا محرك تنسيق جديدًا ولا ازدواج بيانات — كل رقم مشتق من جداول قائمة.

## المبدأ المعماري

- **السجل**: `shared/aiStaffRoster.ts` هو المصدر الافتراضي (16 موظفًا في 6 إدارات) على نمط `server/ai/gateway/defaults.ts`. جدول `ai_staff` في القاعدة يتقدم عليه متى زُرع عبر `scripts/seed-ai-staff.ts` (idempotent — لا يمس الصفوف القائمة).
- **الربط**: كل موظف يملك `featureKeys` (مطابقة تامة) و`featureKeyPrefixes` (لمفاتيح ديناميكية مثل `editorial-unified-<task>`). قاعدة صارمة يفرضها اختبار `tests/unit/aiStaffRoster.test.ts`: لا يتقاسم موظفان مفتاحًا تامًا — لا عدّ مزدوجًا للمؤشرات والتكاليف.
- **المؤشرات**: اليوم من `ai_usage_logs`، الشهر من `ai_usage_daily`، الحالة من `ai_feature_configs.is_enabled` (الإيقاف يمر من AI Hub بسجل تدقيقه — لا مسار إيقاف موازيًا هنا). موظف بلا مفتاح بوابة (`metricsSource: "pending"`) يعرض «قيد الربط» لا أصفارًا كاذبة.

## نقاط الدخول

| السطح | المسار |
|---|---|
| دليل الفريق (بطاقات + شجرة) | `/dashboard/ai/staff` — `client/src/pages/dashboard/AiStaff/index.tsx` |
| بطاقة هوية الموظف | `/dashboard/ai/staff/:slug` — `client/src/pages/dashboard/AiStaff/Profile.tsx` |
| API اللوحة (قراءة فقط، requireAuth) | `GET /api/admin/ai-staff`, `GET /api/admin/ai-staff/:slug` — `server/routes/aiStaff.ts` |
| الشريحة العلنية (عقل سبق) | `GET /api/public/ai-team` (كاش 5 دقائق + CDN) → قسم `sabqai-team` في `client/src/pages/SabqAI.tsx` |
| الخدمة (كل Drizzle هنا — ADR-001) | `server/services/aiStaffService.ts` |
| الصور الرمزية | `client/public/ai-team/<slug>.jpg` (512×512، أسلوب موحد معتمد) |

## حدود ومخاطر

- **AI لا ينشر**: النظام عرض وهوية فقط؛ أي مخرجات الأنظمة نفسها تبقى مسودات بانتظار محرر بشري (دستور «محرر سبق»). النسخة العلنية منقّاة: أسماء وأدوار ومجاميع شهرية — لا تكاليف ولا نماذج ولا أعطال.
- عمودا `ai_usage_logs.task_type` و`prompt_version` أُضيفا هنا (كانا مطلوبين في خطة المحرر الموحد — المرحلة 4)؛ تعبئتهما من `editorialAiService` ومقياس «نسبة تعديل البشر» مرحلة لاحقة.
- «كلّفه بمهمة» والمحوّلات لجداول الأنظمة (radar_stories، journalist_tasks…) في سجل الأعمال: مرحلة لاحقة — سجل الأعمال حاليًا من `ai_usage_logs` مباشرة.

## التشغيل

بعد `npm run db:push`: `tsx scripts/seed-ai-staff.ts` (اختياري — قبل الزراعة تعمل الواجهة من الثوابت). لا كرون ولا مهام خلفية لهذا النظام.
