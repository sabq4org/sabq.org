# تقرير تدقيق أداء sabq.org - 2026-05-28

## النطاق

- الهدف: `https://sabq.org` الإنتاج.
- الصفحات المقاسة:
  - الصفحة الرئيسية: `https://sabq.org/`
  - صفحة مقال من الصفحة الرئيسية: `https://sabq.org/article/dtIp139`
- العمل المنفذ كان قراءة عامة على الإنتاج وتعديل واجهة الويب محلياً فقط.
- لم يتم تشغيل أي أمر قاعدة بيانات، ولم يتم تعديل إعدادات الإنتاج أو الأسرار.

## أدوات القياس

- Google PageSpeed Insights API: تعذر استخدامه بسبب انتهاء quota.
- Lighthouse محلياً على production URLs.
- قياسات HTTP مباشرة للـ TTFB والترويسات.
- تحليل HTML، أصول Vite، الصور، ترويسات الكاش، وطلبات API من الـ waterfall.

## خط الأساس

| الصفحة | الجهاز | Performance | FCP | LCP | CLS | TBT | الحجم الكلي |
|---|---:|---:|---:|---:|---:|---:|---:|
| الرئيسية | Mobile | 42 | 8.6s | 15.0s | 0.28 | 50ms | 4.94MiB |
| الرئيسية | Desktop | 58 | 1.8s | 3.5s | 0.23 | 0ms | 5.42MiB |
| مقال | Mobile | 43 | 9.2s | 22.6s | 0.24 | 90ms | 3.82MiB |

## أهم النتائج

1. **السيرفر ليس عنق الزجاجة الأساسي**
   - TTFB للصفحة الرئيسية كان تقريباً 280ms.
   - TTFB لصفحة المقال كان تقريباً 306ms.

2. **الصور هي أكبر سبب للهدر**
   - الصفحة الرئيسية حملت 32 صورة بحوالي 3.33MB.
   - Lighthouse قدر توفيراً يقارب 2.99MiB من الصور على الصفحة الرئيسية.
   - `/api/homepage-lite` يعيد صور Cloudflare Images بصيغة `/public`، وهي كبيرة مقارنة بمقاسات البطاقات الصغيرة.

3. **HTML غير قابل للكاش عمداً**
   - `sabq.org` يعيد:
     `Cache-Control: private, no-store, no-cache...`
   - هذا مضبوط في `vercel.json` و`cloudflare-worker/frontend-edge-worker.js` لتجنب مشكلة stale HTML بعد تغيّر أسماء ملفات Vite.
   - لا ينصح بتغييره دون تصميم بديل آمن لمشكلة white pages بعد النشر.

4. **API عام لكنه لا يظهر كـ Cloudflare HIT**
   - `/api/homepage-lite` يرسل `s-maxage=60`، لكن `cf-cache-status` كان `DYNAMIC`.
   - توجد ترويسة `Vercel-CDN-Cache-Control: no-store` على استجابات API، ويحتاج مسار الكاش عبر Cloudflare/Railway/Vercel إلى مراجعة منفصلة.

5. **هناك JavaScript زائد في التحميل الأول**
   - `vendor-charts` يظهر في التحميل الأول رغم أن استخدام Recharts غالباً في صفحات تحليلية/إدارية.
   - Lighthouse قدر هدر JavaScript بحوالي 467KiB على الرئيسية.

6. **CLS واضح**
   - أكبر مساهمة في الصفحة الرئيسية جاءت من إعلان MPU على الموبايل.
   - صفحة المقال فيها CLS من صورة داخل المحتوى بدون حجم صريح كاف.

## التغيير المنفذ

استبدلت صور `<img>` الخام في أقسام الأخبار التي كانت تطلب نسخة `.../public` الكبيرة بمكوّن `OptimizedImage` الموجود في المشروع.

الملفات:

- `client/src/components/PersonalizedFeed.tsx`
  - صور قائمة الموبايل.
  - صور شبكة الديسكتوب.

- `client/src/components/QuadCategoriesBlock.tsx`
  - صورة المقال المميز داخل العمود.
  - صورة المقال المميز في قائمة الموبايل.

الأثر المتوقع:

- طلب Cloudflare Images variants مناسبة للمقاس بدلاً من نسخة `public`.
- تقليل وزن صور الأخبار المعروضة بعد الـ hero، خصوصاً في الموبايل.
- إبقاء lazy loading وسلوك البطاقات كما هو.

## التحقق

- نجح بناء الواجهة:
  - `npm run build:client`

- فشل فحص TypeScript العام:
  - `npm run check`
  - أعيد تشغيله بذاكرة أعلى عبر `NODE_OPTIONS=--max-old-space-size=8192 npm run check`.
  - الفشل من أخطاء قائمة خارج نطاق التعديل، خصوصاً في `server/routes.ts` و`server/storage.ts` وبعض مكونات التعليقات.

## توصيات لاحقة

1. إعادة قياس Lighthouse بعد نشر تعديل الصور.
2. معالجة CLS في `DmsAdSlot` بإبقاء مساحة ثابتة أو سياسة collapse مؤجلة لا تزيح المحتوى.
3. فصل `vendor-charts` عن المسار العام، أو منع تحميله قبل زيارة صفحات التحليلات.
4. مراجعة سبب عدم ظهور Cloudflare HIT على `/api/homepage-lite` رغم وجود `s-maxage`.
5. تحسين صور المقال legacy داخل المحتوى بإضافة أبعاد أو aspect ratio قبل التحميل.
