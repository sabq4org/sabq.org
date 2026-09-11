# نظام الإعلانات (`ads`)

> آخر مراجعة: 2026-09-11 | المالك: monetization

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
- **DMS العلوي وCLS:** `useDmsTopAdsEnabled` يعكس حالة الإطفاء على `html[data-sabq-top-ads-disabled]` قبل الرسم. `dms-top-ads.css` يخفي `#Leaderboard` وحاويته المعروفة حتى لو أعاد GTM إنشاءها خارج React وحقن `display:block!important`. الحذف الدوري وحده كان يترك 100px+ ظاهرة مؤقتاً ثم يسحبها (نزول/صعود المحتوى). القاعدة لا تشمل MPU، ولا تمنع الإعلان العلوي عند تفعيله؛ يبقى سلوك تفعيل الاحتياط عند فشل جلب الإعداد كما هو. حالة الجذر تبقى بين انتقالات الصفحات حتى يحسم المستهلك التالي الإعداد.
- **ليدربورد الجوال وصفحة الأخبار (2026-09-11):** الفتحة سطح مكتب فقط. سكربت السكين قد يغرس `#Leaderboard` تحت هيدر الموقع خارج الغلاف `hidden md:block`. القاعدة عند `max-width: 767px` تخفيه بـ `!important`. على `/news` (`.news-listing-page`) تُطوى النسخة المغروسة الفارغة في الديسكتوب أيضاً حتى لا يبقى فراغ فوق رأس الصفحة؛ إن وُجد iframe يبقى الإعلان. MPU للجوال لا يتأثر.
- صلاحيات المعلن منفصلة عن طاقم التحرير.
- إعادة ضبط يومية للـ native ads عبر job مخصّص.
- **`GET /api/ads/slots/active`:** يعتمد على placements النشطة + (اختياري) مشاهدات `impressions` لآخر 24 ساعة. جدول `impressions` يجب أن يطابق `schema.ts` (`slot_id varchar` → `inventory_slots.id`). إن أُعيد إنشاؤه بـ `INTEGER` يفشل الـ join (`integer = character varying`) ويملأ لوق Railway. المسار يتخطى `recentlyFilled` عند فشل المخطط ويخدم من placements فقط. إصلاح DB: [`scripts/sql/fix-impressions-schema-2026-07-25.sql`](../../../scripts/sql/fix-impressions-schema-2026-07-25.sql).

## صحة وتشغيل
- لوحات تحت `/dashboard/ads*`

## عند التعديل
- [ ] قرأت هذا الملف
