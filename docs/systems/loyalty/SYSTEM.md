# نظام الولاء (`loyalty`)

> آخر مراجعة: 2026-07-17 | المالك: platform

## الغرض
إدارة نقاط الولاء، حسابات الأعضاء، معاينة اكتساب النقاط (ولاء ون)، وشروط الاستخدام — ويب + موبايل + لوحة إدارة.

## الحدود
- **داخل النطاق:** حساب الولاء، لوحة `/dashboard/loyalty-admin`، صفحات `/loyalty-*`، خدمة `server/services/loyalty.ts`.
- **خارج النطاق:** محرك التوقعات (قد يمنح نقاطاً لاحقاً عبر عقد واضح) — انظر `predictions-core`.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/services/loyalty.ts`, `server/routes/loyaltyAdmin.ts` |
| Web | `client/src/pages/Loyalty*.tsx`, `client/src/pages/dashboard/LoyaltyAdminDashboard.tsx` |
| iOS / Android | ملفات `*Loyalty*` تحت `ios/` و `android-native/` |
| Docs | `docs/LOYALTY_*.md` |

## التوثيق المرتبط
- `docs/LOYALTY_iOS_HANDOFF.md`
- `docs/LOYALTY_WALAONE_ACQUISITION_PREVIEW.md` — معاينة؛ ليست قيماً إنتاجية بعد
- `docs/LOYALTY_WALAONE_TERMS_RISK_MAP.md`

## عقود مهمة / Gotchas
- معاينة `/loyalty-preview` **لا تُطبَّق على الإنتاج** حتى قرار صريح.
- لا تخلط بين مصادقة الويب (Passport) وموبايل (Bearer `/api/v1`).

## صحة وتشغيل
- لوحة: `/dashboard/loyalty-admin`
- استهلاك AI: لا يوجد (`aiFeatureKeys` فارغ)

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] حدّثت related docs إن تغيّر العقد مع ولاء ون
- [ ] راجعت أثر الموبايل إن لمس الـ API
