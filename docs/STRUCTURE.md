# خريطة توثيق المشروع (Documentation Map)

أُعيد تنظيم وثائق Markdown المتناثرة في جذر المشروع إلى بنية مصنّفة تحت `docs/`.
الملفات الاصطلاحية تبقى في الجذر: `README.md`, `CLAUDE.md`, `AGENTS.md`, `replit.md`.

> ملاحظة: لم يُنقل أو يُحذف أي ملف كود أو إعداد. كود TypeScript لا يستورد ملفات `.md`،
> وتم التحقق بعد النقل عبر `npm run check`.

## docs/security/ — الأمن
- `SECURITY_AUDIT_REPORT.md` — تقرير تدقيق أمني سابق
- `SECURITY_LINK_INJECTION_AUDIT_AR.md` — تدقيق حقن الروابط
- `threat_model.md` — نموذج التهديد

## docs/architecture/ — المعمارية
- `SYSTEM_DOCUMENTATION.md` — توثيق النظام الشامل
- `AUTHENTICATION_FLOW.md` — تدفّق المصادقة
- `CALENDAR_SYSTEM.md` — نظام التقويم
- `SPLIT_ROADMAP.md` — خارطة فصل النشر
- `design_guidelines.md` — إرشادات التصميم

## docs/setup/ — الإعداد والتشغيل
- `DATABASE_SETUP_INSTRUCTIONS_AR.md`
- `OBJECT-STORAGE-SETUP.md`
- `R2_NEWS_IMAGES_ROLLOUT.md` — تشغيل صور الأخبار على R2، التدرج، الكاش، والتراجع
- `SECRETS-UPDATE-GUIDE.md`
- `WEBHOOK-SETUP-GUIDE.md`
- `MIGRATION_RUNBOOK.md`
- `GOOGLE_ANALYTICS.md` — كيف نضع gtag/GA4 ونرصد مشاهدات الصفحات (ويب + iOS + Android)

## docs/handoff/ — تسليمات
- `HANDOFF-android-native-2026-05-19.md`
- `HANDOFF-android-native-NEXT.md`
- `android_surface_card_contrast_fix.md`

## docs/reference/ — مراجع
- `sabq-dashboard-documentation.md`
- `sabq-ios-api-reference.md`
- `sabq-services-guide.md`

## docs/reports/ — تقارير
- `AUDIT_REPORT.md`
- `DATABASE_COST_FORENSIC_REPORT.md`
- `تقرير_الأداء_المعماري_سبق.md`

## docs/notes/ — ملاحظات
- `sultan.md`

## ولاء / عضوية
- `LOYALTY_iOS_HANDOFF.md` — تسليم Phase 3 للولاء على iOS
- `LOYALTY_WALAONE_ACQUISITION_PREVIEW.md` — معاينة اكتساب النقاط × ولاء ون (2026-07-17): صفحة `/loyalty-preview` والقيم المقترحة — لم تُطبَّق على الإنتاج
- `LOYALTY_WALAONE_TERMS_RISK_MAP.md` — خريطة مخاطر شروط ولاء ون → حماية سبق + صفحة `/loyalty-terms`

## مقترحات لم تُنفَّذ (تتطلّب قرار الفريق)
- إنشاء `SECURITY.md` جذري يفهرس وثائق الأمن وسياسة الإفصاح.
- ملفات ثنائية في الجذر يُنصح بنقلها/أرشفتها يدوياً: `sabq-clean.tar.gz` (≈19MB),
  `honor_articles_report.docx`, `temp_import.txt`, `rbac-export.json`.
