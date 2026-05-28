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

---

## الموجة الثانية — Wave 2 (2026-05-28، بعد القياس الأولي)

بعد نشر الموجة الأولى (`Optimize homepage image delivery` — commit `3ee891d`) ورصد تحسن فعلي في الإقلاع وفتح الصفحات، نُفّذت موجة ثانية تعالج التوصيات 1-3 و5 جزئياً.

### 1. فصل recharts عن التحميل الأولي

**المشكلة المكتشفة:**
- `manualChunks` في `vite.config.ts` كان يعرّف `vendor-charts: ['recharts']` كـ chunk منفصل.
- Vite يضيف `<link rel="modulepreload">` تلقائياً لكل manual chunk في `index.html`.
- النتيجة: 430KB من recharts كانت تُحمَّل في **كل** صفحة عبر preload، حتى الصفحة الرئيسية ومقالات الأخبار التي لا تستخدمها أبداً.

**التعديل:**
- إزالة `'vendor-charts': ['recharts']` من `manualChunks` في `vite.config.ts`.
- Vite الآن يدمج recharts داخل الـ chunks اللي تستوردها فعلياً (صفحات Dashboard/Analytics المعرّفة بالفعل كـ `lazy()` في `App.tsx`).
- التحقق: `npm run build:client` بعد التعديل، فحص `dist/public/index.html` — لم يعد يحوي `vendor-charts` في modulepreload ولا حتى chunk مستقل بنفس الاسم.

**الأثر:** -430KB من حجم JS الأولي في كل صفحة عامة (الرئيسية، المقالات، الفئات...).

### 2. استكمال استبدال `<img>` بـ `OptimizedImage`

الموجة الأولى غطّت `PersonalizedFeed` و`QuadCategoriesBlock`. تبيّن وجود مكوّنين مرئيين على الصفحة الرئيسية لا يزالان يستخدمان `<img>` خاماً ويطلبان صور `/public` الكبيرة:

| المكوّن | الاستخدام | المقاس الذي طُلب |
|---|---|---:|
| `client/src/components/ShortsHomeBlock.tsx` | غلاف قسم الشورتس | width=320 |
| `client/src/components/MuqtarabTopicsShowcase.tsx` | صورة موضوع مُقترب | width=480 |

**الأثر:** Cloudflare Images تُطلَب بأبعاد البطاقة بدل النسخة الأصلية في صفحة الصفحة الرئيسية وأي صفحة تعرض هذه المكونات.

**تنظيف إضافي:** حُذف `client/src/components/MoreFromSabq.tsx` لأنه مكوّن قديم وغير موصول بالصفحة الرئيسية حالياً، وكان يحمل قسم "محتوى مخصص لك" المخفي منذ فترة. حذفه يمنع بقاء كود ميت أو صور غير مقصودة ضمن مسار التطوير، ولا يغيّر الواجهة الحالية.

### 3. إصلاح CLS في `DmsAdSlot`

**المشكلة:** في المنطق الحالي:
- حالة `loading` تحجز 250px (MPU) أو 90px (Leaderboard).
- حالة `empty` (الإعلان فشل بالامتلاء) تنهار إلى `height: 0`.
- هذا الانهيار من 250px إلى 0 هو السبب المباشر لـ CLS=0.28 على الموبايل (تصنيف Poor في Core Web Vitals).

**التعديل في `client/src/components/DmsAdSlot.tsx`:**
- إزالة فرع `adState === 'empty'` من حساب `innerStyle` في `DmsAdSlot`، و`LiteModeAdSlot`، و`LiteModeArticleAd`.
- المساحة تبقى محجوزة دائماً (250px / 90px) بصرف النظر عن حالة الإعلان.
- المُغلِّف (wrapper) لا يحمل أي خلفية (ملاحظة `DMS` 2026-05-20)، لذا المساحة المحجوزة الفارغة غير مرئية للقارئ — المقايضة: مساحة غير مستخدمة عند فشل التعبئة، مقابل ثبات تخطيط الصفحة.

**الأثر المتوقع:** CLS من 0.28 إلى ما دون 0.1 (تصنيف Good) على الموبايل في الصفحة الرئيسية.

### الملفات المعدّلة في هذه الموجة

```
vite.config.ts
client/src/components/MoreFromSabq.tsx (حذف مكوّن قديم غير مستخدم)
client/src/components/ShortsHomeBlock.tsx
client/src/components/MuqtarabTopicsShowcase.tsx
client/src/components/DmsAdSlot.tsx
```

### التحقق

- `NODE_OPTIONS=--max-old-space-size=8192 npm run check` — لا يزال يفشل بسبب أخطاء TypeScript قائمة خارج نطاق هذه الموجة. بعد حذف `MoreFromSabq` لم يعد هناك خطأ متعلق بمكوّن "محتوى مخصص لك".
- `npm run build:client` — البناء ناجح، تأكيد عدم وجود `vendor-charts` في modulepreload.
- لم تُشغَّل أوامر قاعدة بيانات ولم تُعدَّل إعدادات الإنتاج.

### Commit

```
3c45dae  perf(web): wave 2 — lazy charts, more OptimizedImage, fix CLS
```

على فرع `codex/sabq-org-performance-audit`.

### ما تبقّى من التوصيات الأصلية

| التوصية | الحالة |
|---|---|
| 1. إعادة قياس Lighthouse بعد الصور | تمّت بعد الموجة الأولى ✓ — تنتظر قياس بعد الموجة الثانية |
| 2. CLS في `DmsAdSlot` | نُفِّذ ✓ |
| 3. فصل `vendor-charts` | نُفِّذ ✓ |
| 4. Cloudflare HIT على `/api/homepage-lite` | لم يُعالَج — يحتاج فحصاً منفصلاً (CF Worker / vercel.json / Vercel-CDN-Cache-Control) |
| 5. أبعاد صور المقال legacy داخل المحتوى | لم يُعالَج — يحتاج تمريرة مستقلة على HTML الجسم |

### خطوات بعد النشر

1. الانتظار 5-10 دقائق بعد دمج/نشر `codex/sabq-org-performance-audit` (Vercel + CF cache).
2. تشغيل Lighthouse على `https://sabq.org/` و`https://sabq.org/article/dtIp139` لكل من Mobile و Desktop.
3. مقارنة بخط الأساس في أعلى الملف، خصوصاً:
   - **CLS** (متوقع تحسن ملحوظ على الموبايل).
   - **Transfer Size** للـ JS الأولي (متوقع نقص ~430KB).
   - **LCP** (قد يتأثر إيجاباً بإكمال OptimizedImage).
4. تسجيل الأرقام الجديدة في هذا الملف لاحقاً للمقارنة.
