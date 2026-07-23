# نظام الولاء (`loyalty`)

> آخر مراجعة: 2026-07-21 | المالك: platform

## الغرض
إدارة نقاط الولاء، حسابات الأعضاء، معاينة اكتساب النقاط (ولاء ون)، وشروط الاستخدام — ويب + موبايل + لوحة إدارة.

## الحدود
- **داخل النطاق:** حساب الولاء، لوحة `/dashboard/loyalty-admin`، صفحات `/loyalty-*`، معاينة سبق بلس `/plus-preview`، خدمة `server/services/loyalty.ts`، بطاقات Apple Wallet للقسائم (`CouponPassBuilder`).
- **خارج النطاق:** محرك التوقعات (قد يمنح نقاطاً لاحقاً عبر عقد واضح) — انظر `predictions-core`.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/services/loyalty.ts`, `server/routes/loyaltyAdmin.ts`, `server/routes/sabqPlusPreview.ts`, `server/lib/passkit/CouponPassBuilder.ts` |
| Web | `client/src/pages/Loyalty*.tsx`, `client/src/pages/SabqPlusPreview.tsx`, `client/src/pages/dashboard/LoyaltyAdminDashboard.tsx` |
| iOS / Android | ملفات `*Loyalty*` تحت `ios/` و `android-native/` |
| Docs | `docs/LOYALTY_*.md` |

## التوثيق المرتبط
- `docs/LOYALTY_iOS_HANDOFF.md`
- `docs/LOYALTY_WALAONE_ACQUISITION_PREVIEW.md` — معاينة؛ ليست قيماً إنتاجية بعد
- `docs/LOYALTY_WALAONE_TERMS_RISK_MAP.md`
- `docs/LOYALTY_WALAPLUS_B2B_SPEC_REVIEW.md` — مراجعة مواصفة ولاء بلس B2B (2026-07-23): بوابات الإطلاق، الأسئلة المفتوحة، خريطة المواءمة. **قرار المالك:** مرحلتان — **الأولى: أكواد شحن/قسائم** (نقاط → كود 12 رقمًا → شحن في تطبيق ولاء بلس؛ مواصفتها لم تُستلم بعد — الأولوية طلبها)، و«فتح العروض» (المواصفة المستلمة) لاحقًا. **تنبيه:** اسم الشريك الرسمي «ولاء بلس / WalaPlus» وليس «ولاء ون»

## عقود مهمة / Gotchas
- معاينة `/loyalty-preview` **لا تُطبَّق على الإنتاج** حتى قرار صريح.
- لا تخلط بين مصادقة الويب (Passport) وموبايل (Bearer `/api/v1`).
- **بطاقة قسيمة Wallet:** البطل البصري في `strip.png` (`CouponPassStripRenderer`: قيمة كبيرة + اسم الشريك على خلفية كحولية سبق بلس)؛ الرأس يعرض القيمة في وضع الطيّ؛ تحت الشريط `auxiliary` فقط (انتهاء ثم رقم قسيمة بترتيب يعكس RTL بصرياً)؛ لا `primaryFields` فوق الـ strip. نص العرض والشروط وتعليمات الإزالة من Wallet في `backFields`. اللوقو من `CouponPassAssets` بحشوة علوية وعلامة يمين الخانة. `suppressStripShine: true`. PassKit لا يدعم RTL حقيقي ولا زر حذف على وجه البطاقة ولا تحريك الباركود — الحذف من Wallet عبر ⋯/(i). أي قالب `.pass` جديد يحتاج سطر `COPY` في `Dockerfile` وإلا يفشل الإنتاج.
- **إزالة قسيمة المعاينة:** `DELETE /api/plus-preview/redemptions/:id` (admin فقط) يُرجع النقاط ويعيد المخزون ويحذف صف الاستبدال. لا يزيل بطاقة Apple Wallet المُضافة على الجهاز.

## صحة وتشغيل
- لوحة: `/dashboard/loyalty-admin`
- استهلاك AI: لا يوجد (`aiFeatureKeys` فارغ)

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] حدّثت related docs إن تغيّر العقد مع ولاء ون
- [ ] راجعت أثر الموبايل إن لمس الـ API
