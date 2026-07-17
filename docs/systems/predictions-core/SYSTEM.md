# نظام التوقعات المركزي (`predictions-core`)

> آخر مراجعة: 2026-07-17 | المالك: sports

## الغرض
محرك توقعات موحّد + ملفات نقاط versioned + دفتر append-only يخدم البطولات — **عدا** كأس العالم 2026 الذي يبقى على محرك `wc*` القديم حتى نهاية البطولة.

## الحدود
- **داخل النطاق:** `server/services/predictions/**`, مسارات `predictionsCore` / `predictionsMobile` / `rslPredictions`.
- **خارج النطاق:** `wcPredictions*` وخدمات كأس العالم القديمة — لا تُدمج هنا قبل انتهاء البطولة.
- **ممنوع:** إعادة إحياء محركات البطولات المحذوفة في PR #938.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/services/predictions/`, `server/routes/predictionsCore.ts` |
| Web | `client/src/pages/PredictionCenter.tsx` |
| مرجع | `docs/PREDICTION_CORE.md` (**المصدر الرسمي**) |

## التوثيق المرتبط
- `docs/PREDICTION_CORE.md` — اقرأه قبل أي تغيير سلوك
- `docs/SPORTS_PREDICTIONS_SYSTEM.md` — سياق تاريخي/أوسع

## عقود مهمة / Gotchas
- بطولة جديدة = إعداد (Competition + Profiles + fixture source) وليس محرك كود جديد.
- التسوية عبر strategies في `predictions/strategies/` — لا تكتب نقاطاً مباشرة في الجداول التشغيلية.

## صحة وتشغيل
- راجع `docs/PREDICTION_CORE.md` لمسارات الصحة والـ outbox
- استهلاك AI: لا عبر Gateway حالياً

## عند التعديل
- [ ] قرأت هذا الملف + `docs/PREDICTION_CORE.md`
- [ ] لم تلمس `wc*` إلا بطلب صريح
- [ ] أي تغيير schema additive فقط
