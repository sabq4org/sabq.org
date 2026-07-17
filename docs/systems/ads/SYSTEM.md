# نظام الإعلانات (`ads`)

> آخر مراجعة: 2026-07-17 | المالك: monetization

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

## صحة وتشغيل
- لوحات تحت `/dashboard/ads*`

## عند التعديل
- [ ] قرأت هذا الملف
