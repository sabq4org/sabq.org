# تشغيل المنصة والبنية المشتركة (`platform-runtime`)

> آخر مراجعة: 2026-10-26 (مسار حيوية `/healthz` قبل Express ومهل keep-alive — حادثة فحص Render 2026-10-25) | المالك: platform

## الغرض والحدود
الإقلاع، القيادة، انتهاء العملية، أدوات البناء والملفات المشتركة. `routes.ts` و`storage.ts` و`mobileApiRoutes.ts` و`schema.ts` مداخل مشتركة وليست ملكية لكل منطق أعمالها؛ يجب قراءة SYSTEM النظام المستهلك عند تعديل مساره أو جدوله. لا تغيير للبيانات أو Schema الإنتاج ضمن مراجعة سبتمبر.

## العقود
- التخزين المشترك في `server/objectStorage.ts`: المستندات الخاصة على R2 تحتاج `R2_BUCKET_NAME` صريحاً ومختلفاً عن حاوية صور الأخبار؛ لا رجوع إلى حاوية عامة عند غيابه. `NEWS_IMAGES_R2_*` يبقى لمسار الوسائط العام، والرفع الخاص والتنزيل الموقع يختاران المزوّد نفسه. أسماء الحاويات وحدها لا تثبت الخصوصية: تعطيل النطاقات العامة و`r2.dev` والتحقق من صلاحيات المفاتيح متطلبات تشغيلية. خطة التطبيق ونقل الملفات السابقة في [دليل المستندات الخاصة](PRIVATE_DOCUMENT_STORAGE.md).
- Redis lease يجدد ويحذف بشرط المالك داخل Lua واحدة، وتبطل القيادة محليًا عند انتهاء TTL حتى قبل النبضة التالية.
- الساعات تُسجل على كل replica مفعلة، وتتحقق من القيادة عند التنفيذ. المهام الموسمية المعطلة تبقى معطلة.
- SIGTERM/SIGINT: مهلة كلية 25 ثانية، موزعة لتصريف HTTP والمهام، ثم تفريغ السلوك/عدادات المشاهدة، ثم تحرير القيادة. فشل التفريغ أو انتهاؤه بمهلة يخرج برمز 1. bootstrap/index يشتركان في سجل إيقاف واحد.
- الصورة وCI يستخدمان Node 24.22.1 (ترقية أمنية 2026-10-21)، وweb-next على 22.23.4؛ الحد الأدنى الحالي لـ Puppeteer هو 22.12. بناء الصورة وChromium في Linux تحقق مستقل عن تجميع TypeScript.
- CI يغطي :app و:vara لأندرويد، ومشروعي سبق وVARA في iOS دون توقيع.
- Sentry يُحمّل بعد أول رسم لتحسين LCP؛ مخزن الأخطاء المبكرة يحفظ `source` و`filename` الأصليين، ولا يعيد عبر `captureException` إلا الخطأ الذي يثبت أن له ملفًا أو stack من نطاق/حزمة سبق أو مشروع Pages `sabq-org`. لا تُعامل أخطاء السكربتات المحقونة عديمة المكدس كالتقاط صريح من التطبيق.
- فلتر Sentry يسقط `TypeError` ذي القيمة الدقيقة `Type error` من `unhandledrejection` فقط عند وجود رسالة breadcrumb المطابقة لـ`[deployRecovery] Stale build detected (vite:preloadError)` وbreadcrumb `fetch` آخر يبدأ رابطه حرفيًا بـ`https://cdn.sabq.org/assets/` ويثبت الفشل بمستوى `error` أو status لا يقل عن 400؛ أي TypeError آخر يبقى قابلًا للرصد، والتحليل لا يستخدم serialization لبيانات breadcrumb.
- يضبط الخادم `requestDataIntegration` لمنع body/cookies/headers/ip/query مع `sendDefaultPii=false`، ثم يمرر `beforeSend` عبر `sanitizeServerEvent` لحذف `user` والحقول الحساسة، مع إبقاء method/path وURL بلا query ورؤوس آمنة محددة فقط.
- بركتا PostgreSQL عبر `node-postgres` في الإنتاج (الرئيسة والاحتياطية للجلسات) تثبتان مستمع خطأ دائمًا على كل عميل عند اتصاله، إضافة إلى مستمع البركة. هذا يمنع انقطاع socket عابرًا أثناء استعارة العميل من التحول إلى `uncaughtException`، مع إزالة التكرار عندما تعيد البركة إرسال كائن الخطأ نفسه؛ البركة الرئيسة تعلّم الاتصال غير متاح وتبدأ فحص الاستعادة. مسار `NeonPool` القديم يبقي مستمع `error` فقط حتى لا يعطّل `poolQueryViaFetch` الاختياري.

## فحص الحيوية ومهل HTTP — 2026-10-26
سببه حادثة 2026-10-25 (15:40–16:10 بتوقيت الرياض): فشل فحص Render على `/health` مرتين تحت ~4× ترافيك، فأوقف Render التوجيه للنسخة الوحيدة ثم أعاد تشغيلها (~110 ألف 502). التفاصيل في PR #2007.

**نقاط الدخول:**
- `GET|HEAD /healthz` و`/livez` (مع أي query) تُخدَم في معالج طلبات `http.Server` **قبل Express كليًّا** (`server/utils/livenessFastPath.ts`، يُركَّب في `server/index.ts` عند `createServer`). لا I/O ولا dynamic import ولا middleware (لا originGate ولا rate limit ولا جلسات)، والجسم نص قصير مع `Cache-Control: no-store`. أي طريقة أخرى (POST…) أو مسار آخر يمر لـExpress كالمعتاد.
- الدلالات:
  - `503 starting`: قبل مزلاج جاهزية الإقلاع `isDatabaseReadyOnce()` من `./db` (يُحمَّل كسولًا عند أول فحص، ADR-001). نفس بوابة `/health` فلا يُوجَّه ترافيك لحاوية باردة.
  - `503 stopping`: بعد SIGTERM/SIGINT (`isShuttingDown()` من `server/shutdown.ts`).
  - `200 ok`: غير ذلك.
- `/health` **لم يتغير**: يبقى JSON تشخيصيًّا (db/leader/leaderMode/podId/theSports) داخل Express، ويرد 503 «starting» قبل الجاهزية. `/ready` يبقى فحصًا عميقًا (SELECT 1) ولا يصلح healthCheckPath.

**مهل الخادم** (`applyServerTimeouts`، تُطبَّق على الخادم الذي ينشئه index فقط):
- `server.keepAliveTimeout` = 65000ms افتراضيًّا (افتراضي Node 5000ms)، والهدف تقليل فتح اتصالات جديدة من بروكسي Render تحت الطفرات. يُضبط بـ`HTTP_KEEP_ALIVE_TIMEOUT_MS`.
- `server.headersTimeout` = keepAlive + 1000ms افتراضيًّا (66000ms). يُضبط بـ`HTTP_HEADERS_TIMEOUT_MS`، ولا يقل أبدًا عن keepAlive + 1000ms. القيم غير الصالحة أو غير الموجبة تعود للافتراضي.

**خطوة يدوية بعد النشر (Render، لا تتم من الكود):** في لوحة Render ← خدمة `sabq.org` (srv-dbcgjcom7kps739tsa7g) ← Settings ← Health Checks: حوّل Health Check Path من `/health` إلى `/healthz` بعد أن يؤكد `curl -i https://sabq-api-virginia.onrender.com/healthz` ردًّا `200 ok` على النسخة المنشورة. **قبل هذه الخطوة يبقى فحص الإنتاج على `/health` ولا يستفيد من المسار السريع.** يُنصح أيضًا بحد أدنى نسختين في autoscaling، لأن فشل فحص واحد على نسخة وحيدة يُسقط كل السعة.

**التحقق:** `tests/unit/livenessFastPath.test.ts` يتحقق من الرد خلال أقل من 500ms مع 20 طلبًا عالقًا خلف middleware بطيء، وأن الفحص لا يدخل Express، ومن حالات HEAD وstarting وstopping، ومرور غير GET، والقيم الافتراضية ومتغيرات البيئة للمهل.

## موجة قرّاء العاجل على `/api/v1` — 2026-09-26
- طلب «طازج» من التطبيق (`Cache-Control: no-cache` أو `_nc`/`refresh`) **لا يتجاوز** كاش الخادم: `readWithFreshWindow` (`server/utils/freshWindowCache.ts`) يسلّمه نسخة عمرها ≤10ث بجلب واحد للمتزامنين. يغطي `/homepage` و`/news/paginated` و`/articles/:id`. سببه: iOS يستدعي `checkForNewArticles` بـno-cache عند العودة للواجهة، فبعد بث 37 ألف إشعار بُنيت الرئيسية لكل جهاز (pool=50/0idle/23wait).
- مفتاح الظل `<key>:fresh` يبدأ بالمفتاح الأساسي، فأنماط الإبطال عند النشر تمسحه معه. لا تسمِّ مفتاحًا جديدًا بحيث يفلت من نمط الإبطال.
- قراءات النقر المحايدة للمستخدم مكيّشة: التعليقات المعتمدة 15ث (`comments:mobile:<slug>`)، عدد الإعجابات 10ث (يُمسح عند الإعجاب)، وفحص وجود المقال في `POST /articles/:id/view` عبر `getLiveArticleViews`.

## بوابة النشر: عنوان الزائر الموثوق
**لا تُنشر دفعة trustedProxyIp منفردة قبل إعداد الطرفين.** يلزم سر `EDGE_PROXY_SHARED_SECRET` متطابق في Cloudflare Pages وRailway، عبر مدير الأسرار فقط. لم يُنشأ السر ولم تتغير إعدادات الإنتاج ضمن هذه المهمة.

Pages يستبدل رؤوس IP/التوقيع الواردة، ويوقّع timestamp + HTTP method + path/query + CF client IP. الخادم يقبل توقيعًا صحيحًا خلال 60 ثانية فقط؛ غير ذلك يعود إلى req.ip وفق trust proxy الحالي (hop واحد). لا يُستخدم Bearer غير المتحقق منه لتكوين bucket مستقل.

قبل النشر: تحقق من hop الخاص بـ Railway ومنع الوصول المباشر غير المقصود؛ اختبر Pages والموبايل المباشر تحت rate limits. عند غياب التوقيع قد تتجمع طلبات Pages تحت IP وسيط واحد، لذلك نشر الكود قبل الإعداد غير جاهز تشغيليًا. لا تُعد الثقة بالبنية التحتية مثبتة باختبار HMAC محلي.

## جدول مفاتيح بوت النشر على X — 2026-09-28
`shared/schema.ts` يضيف الجدول `social_post_bot_keys` فقط (أعمدة `social_posts` لم تتغير). الملكية لـ `social-publishing`. قراءات اللوحة والعامل لا تمسّه. واجهة `/api/internal/bot-social` تفشل حتى يُدفع المخطط؛ النشر من اللوحة لا يعتمد عليه. الدفع عبر `./push-to-production.sh` (إضافة جدول، بلا حذف).

## خريطة مواعيدك — 2026-09-27
- فهرس الخرائط في `server/routes.ts` يضم `/sitemap-mawaeed.xml`. الملف نفسه يولّده مسار مواعيدك، و`lastmod` من `content_updated_at`. مفتاح كاش الفهرس `index_archive_v3` لم يتغير؛ الظهور بعد انتهاء الكاش أو إعادة التشغيل.

## التحقق
أداة `scripts/private-document-migration.mjs` تشغيلية مستقلة: الوضع الافتراضي جرد بقراءة فقط، والنسخ/التحقق يتطلبان بصمة الجرد المعتمدة. تستخدم قائمة بادئات محددة، ونسخاً مشروطاً بعدم وجود الوجهة، ومقارنة SHA-256، ولا تحذف الأصل أو تعدل مراجع القاعدة. لا تُشغّل تلقائياً مع النشر. تفاصيل التشغيل في [دليل المستندات الخاصة](PRIVATE_DOCUMENT_STORAGE.md).

الاختبارات المحلية تشمل قفل عشرة محررين، إصدارات المقال، إغلاق توقع أثناء انتظار SQL، توقيع IP، lease وإيقاف HTTP قبل التفريغ. سجل النتائج وحدود التحقق في [تقرير المعالجة](../../audits/2026-09-04-remediation.md).

## zod 4 — 2026-10-24
الجذر على zod 4.6 وdrizzle-zod 0.8 و@hookform/resolvers 5 وPuppeteer 25.16 (سلسلة chromium-bidi كانت تثبّت zod 3). فروق تمس الكود الجديد:
- `.partial()` في zod 4 يطبّق `.default()` الداخلي على المفاتيح الغائبة، فمخطط تحديث مبني عليه يعيد ضبط القيم المخزنة (الحالة إلى draft مثلًا). مخططات PATCH المبنية من مخطط إدخال فيه قيم افتراضية تستخدم `partialWithoutDefaults` من `shared/zodPartial.ts`، ويتحقق `tests/unit/zodPartialDefaults.test.ts` من أن مخططات `update*` في `shared/schema.ts` لا تضيف مفاتيح.
- `z.string().uuid()` صار يفرض بتات الإصدار وفق RFC، والمعرفات المستوردة لا تلتزم بها؛ استخدم `.guid()` للمعرفات النصية.
- `.omit/.pick/.partial/.merge` ترمي عند التحميل إذا كان المخطط فيه `refine`. `ZodError.errors` صار `.issues`، و`z.record` يتطلب مخطط المفتاح.
- `zodResolver` في الواجهة يفصل نوع المدخل عن المخرج؛ النماذج تمرّره بـ`as Resolver<T>`.
- `z.number()` يرفض Infinity، ومصفوفات النص من drizzle-zod لم تعد تحوّل الأرقام إلى نصوص.

## علامة الحفظ على الحافة — 2026-10-22
- `server/index.ts` يركّب `server/routes/publicEdgeCacheHooks.ts` قبل مسارات `/api/v1` وregisterRoutes. الخطاف يضع علامة الحفظ العام لقراءات مجهولة محددة فقط (التفاصيل في auth-rbac § قراءات التطبيقات)، ولا يمس الطلبات ذات الهوية.
