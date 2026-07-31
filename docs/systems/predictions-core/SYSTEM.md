# نظام التوقعات المركزي (`predictions-core`)

> آخر مراجعة: 2026-07-31 | المالك: sports

## الغرض
محرك توقعات موحّد + ملفات نقاط versioned + دفتر append-only يخدم البطولات — **عدا** كأس العالم 2026 الذي يبقى على محرك `wc*` القديم حتى نهاية البطولة.

## الحدود
- **داخل النطاق:** `server/services/predictions/**`, مسارات `predictionsCore` / `predictionsMobile` / `rslPredictions`، مكوّنات ويب `client/src/components/predictions/**`، وشريط البرومو على `Home.tsx`.
- **خارج النطاق:** `wcPredictions*` وخدمات كأس العالم القديمة — لا تُدمج هنا قبل انتهاء البطولة. نظام الإعلانات المدفوعة (`ads`) منفصل — شريط البرومو إثبات اجتماعي داخلي لا مخزون إعلاني.
- **ممنوع:** إعادة إحياء محركات البطولات المحذوفة في PR #938.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/services/predictions/`, `server/routes/predictionsCore.ts` |
| Web مركز | `client/src/pages/PredictionCenter.tsx` + `client/src/components/predictions/` |
| Web رئيسية | `PredictionPromoStrip` تحت هيرو `Home.tsx` ← `GET /api/predictions/promo-feed` |
| iOS VARA | `sports app ios/SabqSports/Screens/PredictionCenterView.swift` + `PredictionCoreModels.swift` |
| Android VARA | `android-native/vara/.../AccountScreens.kt` |
| Android سبق | `android-native/app/.../feature/predictions/` |
| مرجع | `docs/PREDICTION_CORE.md` (**المصدر الرسمي**) |

## التوثيق المرتبط
- `docs/PREDICTION_CORE.md` — اقرأه قبل أي تغيير سلوك
- `docs/SPORTS_PREDICTIONS_SYSTEM.md` — سياق تاريخي/أوسع

## عقود مهمة / Gotchas
- بطولة جديدة = إعداد (Competition + Profiles + fixture source) وليس محرك كود جديد.
- التسوية عبر strategies في `predictions/strategies/` — لا تكتب نقاطاً مباشرة في الجداول التشغيلية.
- **`entriesCount`:** كل مسابقة في ردود `listContests` / `getContest` / تفصيل البطولة تحمل عدد التوقعات النشطة (`prediction_entries.status = active`). يُعرض أسفل يمين بطاقة المباراة على الويب وVARA iOS وAndroid — **رقم فقط** بلا أسماء أشخاص (الأسماء في المتصدرين فقط). حقل إضافي — العملاء القدامى يتجاهلونه.
- **التسمية:** واجهة المستخدم تقول «جائزة» لا «بركة» (نصوص القواعد والتسوية في Prediction Core).
- **`GET /api/predictions/promo-feed`:** عامة، Cache-Control قصير، بلا جلسة. تُرجع سطور إثبات اجتماعي (عدد متوقّعين + أسماء الفرق) دون أسماء مستخدمين. تختفي الواجهة إن تعطّل المحرك أو كانت القائمة فارغة.
- Android VARA يستهلك النظائر تحت `/api/v1/predictions/*` بنماذج typed مطابقة لعقود `PredictionCoreModels` في iOS: يقرأ `contestType` (بطاقات النتيجة لـ`match_score` فقط)، و`myRank` من رد leaderboards (لا حقل `isMe` — غير موجود في العقد)، ويعرض التسوية ببطاقة مزدوجة (نقاط البطولة / محفظة ×N من `award.wallet`) وتفكيك «كيف حُسبت نقاطي؟» بأربع خطوات من `breakdown`. صفحة «لك» تقرأ `/api/v1/sports/predictions/mine` الموحدة (لا مسار `/world-cup/predictions/mine` القديم).

## صحة وتشغيل
- راجع `docs/PREDICTION_CORE.md` لمسارات الصحة والـ outbox
- استهلاك AI: لا عبر Gateway حالياً

## عند التعديل
- [ ] قرأت هذا الملف + `docs/PREDICTION_CORE.md`
- [ ] لم تلمس `wc*` إلا بطلب صريح
- [ ] أي تغيير schema additive فقط
