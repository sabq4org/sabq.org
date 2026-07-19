# عُمق — التحليل المعمّق (`deep-analysis`)

> آخر مراجعة: 2026-07-17 | المالك: editorial

## الغرض
تقارير وتحقيقات معمّقة (Omq) مع واجهة عامة ولوحة إدارة.

## الحدود
- **داخل النطاق:** `deepAnalysisEngine`, صفحات Deep Analysis في اللوحة.
- **خارج النطاق:** المقالات العادية ومحرر الأخبار اليومي.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/deepAnalysisEngine.ts` |
| Web | `client/src/pages/dashboard/DeepAnalysis*.tsx` |
| SEO | مسارات `/omq/:id` عبر edge meta |

## عقود مهمة / Gotchas
- تأكد من meta/noindex للحالات غير المنشورة عبر مسار SEO.

## صحة وتشغيل
- لوحة: `/dashboard/deep-analysis`
- AI: `deep_analysis`

## عند التعديل
- [ ] قرأت هذا الملف
