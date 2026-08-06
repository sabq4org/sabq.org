# إعداد النشر على منصة X — دليل التهيئة

> النظام: [`docs/systems/social-publishing/SYSTEM.md`](../systems/social-publishing/SYSTEM.md)
> الحالة: الكود جاهز؛ التكامل **غير مفعّل** حتى تُضبط المتغيرات أدناه ويُربط
> الحساب من `/dashboard/social-publishing`.

## 1) متطلبات حساب مطور X (تحقق 2026-08)

- النشر عبر `POST /2/tweets` ورفع الصور عبر `POST /2/media/upload` يتطلبان
  **وصولاً مدفوعاً**: منذ فبراير 2026 المطورون الجدد على تسعير
  **pay-per-use** (لكل منشور)، والخطة المجانية القديمة (500 منشور/شهر) لم
  تعد متاحة للحسابات الجديدة. تحقق من مستوى وصول حساب سبق الفعلي في
  بوابة developer.x.com قبل التفعيل.
- النطاقات المطلوبة: `tweet.read tweet.write users.read media.write offline.access`.
- حد النص: 280 وحدة موزونة (العربية = 1/حرف، الروابط = 23). الحدود الأعلى
  (25k) لمشتركي Premium فقط ولا نعتمد عليها.
- الصور: JPEG/PNG/GIF حتى 5MB (يحوّل الخادم WebP/AVIF تلقائياً إلى JPEG).
- rate limits تختلف حسب الخطة — الكود يعامل 429 كخطأ مؤقت ويعيد المحاولة
  للمنشورات المجدولة حتى 3 محاولات.

## 2) إنشاء تطبيق OAuth

في developer.x.com → Projects & Apps → App → **User authentication settings**:

1. App permissions: **Read and write**.
2. Type of App: **Web App** (Confidential client).
3. Callback URI: نفس قيمة `X_OAUTH_REDIRECT_URI` أدناه —
   الافتراضي `https://sabq.org/api/social-publishing/x/oauth/callback`.
4. انسخ **Client ID** و**Client Secret** (لا تضعهما في أي ملف داخل المستودع).

## 3) متغيرات البيئة (أسماء فقط — القيم في Railway)

| المتغير | إلزامي | الوصف |
|---------|--------|-------|
| `X_CLIENT_ID` | نعم | معرف تطبيق OAuth |
| `X_CLIENT_SECRET` | نعم | سر التطبيق (Confidential client) |
| `X_OAUTH_REDIRECT_URI` | لا | رابط العودة؛ الافتراضي `{PUBLIC_SITE_URL}/api/social-publishing/x/oauth/callback` |
| `SOCIAL_PUBLISH_TOKEN_SECRET` | لا | مفتاح تشفير توكنات الحساب؛ يسقط على `SESSION_SECRET`. **تغييره بعد الربط يبطل الاعتماد المخزن** ويستلزم إعادة الربط |

- بلا `X_CLIENT_ID/SECRET`: الواجهة تعرض «التهيئة ناقصة» وزر الربط معطل —
  لا ينهار شيء.
- الجداول الجديدة (`social_platform_accounts`, `social_posts`,
  `social_post_attempts`) تُدفع محلياً بـ `npm run db:push:local` وللإنتاج
  عبر `./push-to-production.sh` (قرار المالك).

## 4) الربط والتشغيل

1. ادخل بحساب يملك `social_publish.manage_accounts` (مسؤول النظام).
2. `/dashboard/social-publishing` → «ربط حساب X» → فوّض التطبيق على حساب
   @sabq → تعود إلى الصفحة بشارة «متصل».
3. أعد تشغيل الخدمة إن لم تكن `ENABLE_BACKGROUND_WORKERS=true` أصلاً —
   عامل الجدولة (`socialPublishWorker`) يعمل كل دقيقة على القائد فقط.
4. جرّب من «إدارة الأخبار» → زر «النشر على X» على خبر منشور.

## 5) استكشاف الأخطاء

- **«انتهى الاعتماد»**: X يناوب refresh tokens؛ فشل تجديد دائم يعلّم الحساب
  `expired` — أعد الربط من الصفحة.
- **403 عند النشر**: غالباً قيود الخطة (لا كتابة) أو منشور مكرر بنفس النص.
- **فشل الصورة**: راجع `social_post_attempts` (طور `media_upload`) — الأسباب
  الشائعة: صيغة غير مدعومة، >5MB بعد الضغط، أو رابط خارج allowlist الأمنية
  (`server/utils/safeImageUrl.ts`).
- كل الأخطاء المخزنة منظفة من التوكنات (`sanitizeSecretText`).
