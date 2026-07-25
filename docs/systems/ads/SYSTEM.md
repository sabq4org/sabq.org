# نظام الإعلانات (`ads`)

> آخر مراجعة: 2026-07-25 | المالك: monetization

## الغرض
إعلانات عادية ومدمجة، بوابة معلنين، مدفوعات، وتحليلات حملات.

## الحدود
- **داخل النطاق:** `ads-routes`, `nativeAds`, `advertiser*`, لوحات الإعلانات.
- **خارج النطاق:** ولاء القرّاء واشتراكات أخرى.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/ads-routes.ts`, `server/routes/nativeAds.ts`, `advertiser*` |
| Web | `client/src/pages/dashboard/ads/`, `NativeAdsManagement`, `AdvertiserDashboard` |

## عقود مهمة / Gotchas
- صلاحيات المعلن منفصلة عن طاقم التحرير.
- إعادة ضبط يومية للـ native ads عبر job مخصّص.
- **`GET /api/ads/slots/active`:** يعتمد على placements النشطة + (اختياري) مشاهدات `impressions` لآخر 24 ساعة. جدول `impressions` يجب أن يطابق `schema.ts` (`slot_id varchar` → `inventory_slots.id`). إن أُعيد إنشاؤه بـ `INTEGER` يفشل الـ join (`integer = character varying`) ويملأ لوق Railway. المسار يتخطى `recentlyFilled` عند فشل المخطط ويخدم من placements فقط. إصلاح DB: [`scripts/sql/fix-impressions-schema-2026-07-25.sql`](../../../scripts/sql/fix-impressions-schema-2026-07-25.sql).

## صحة وتشغيل
- لوحات تحت `/dashboard/ads*`

## عند التعديل
- [ ] قرأت هذا الملف
