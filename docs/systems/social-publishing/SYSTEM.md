# النشر الاجتماعي (`social-publishing`)

> آخر مراجعة: 2026-09-28 (واجهة بوت `/api/internal/bot-social` بتوكن منفصل ومفتاح عدم تكرار) | المالك: editorial + platform

## الغرض
نشر أخبار سبق على منصة X من لوحة التحكم: فوري أو مجدول، بنص من العنوان أو
مخصص أو مقترح بالذكاء، مع صورة اختيارية (صورة الخبر / مكتبة الوسائط / رفع)،
وسجل محاولات كامل، مع دعم استقبال مقترحات كتّاب الرأي لمقالاتهم المنشورة
خلال أول 24 ساعة ومراجعتها واعتمادها من فريق سبق. المعمارية provider-based — v1 تطبّق X فقط، وإضافة منصة
لاحقاً = تطبيق جديد لعقد `SocialPublishProvider` دون مسّ الخدمة أو العامل.

## الحدود
- **داخل النطاق:** ربط حساب X (OAuth 2.0 PKCE)، تكوين المنشور، النشر الفوري
  والمجدول، سجل المحاولات، اقتراح النص (`social-post-suggest`).
- **خارج النطاق:** بقية المنصات (إنستغرام/فيسبوك/لينكدإن)، الفيديو، الردود
  والتحليلات، قراءة X (تلك في `radar` و`sahraa-tv-block`). النشر الآلي لكل
  خبر بلا استدعاء صريح خارج النطاق؛ بوت «نشر إكس» ينشر فقط ما يطلبه عبر
  واجهة البوت أدناه.

## مفاتيح AI (حصرية)
`social-post-suggest` — عبر `aiGateway.complete` (defaults: GPT-4o-mini).

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Backend | `server/services/socialPublishing/` (service + xApiClient + publerApiClient + imageResolver + tokenCrypto + suggest) |
| Routes | `server/routes/socialPublishing.ts` — `/api/social-publishing/*` (Passport + RBAC + CSRF عام) |
| Bot API | `server/routes/botSocial.ts` — `/api/internal/bot-social/*` (Bearer `SABQ_BOT_SOCIAL_TOKEN`، ليس توكن المسودات). العقد: [`BOT_SOCIAL_API.md`](./BOT_SOCIAL_API.md) |
| Worker | `server/jobs/socialPublishWorker.ts` — cron كل دقيقة، مسجل في `server/index.ts` |
| Shared | `shared/socialPostText.ts` (العد الموزون) + جداول في `shared/schema.ts` |
| Web | زر «النشر على X» في `RowActions`/إدارة المقالات → `SocialPublishDialog`؛ صفحة `/dashboard/social-publishing` |

## الجداول
- `social_platform_accounts` — حساب واحد لكل منصة (unique على platform)،
  الاعتماد مشفر AES-256-GCM بصيغة `v1:iv:tag:ct` بمفتاح مشتق من
  `SOCIAL_PUBLISH_TOKEN_SECRET` (وإلا `SESSION_SECRET`). لا يُعاد للعميل أبداً.
- `social_posts` — المنشور وحالته: `draft | scheduled | processing |
  published | failed | canceled` + `attempts` + `lockedAt` + المعرف/الرابط الخارجي.
  `article_id` **nullable** منذ 2026-08-07 (null = تغريدة مستقلة من زر
  «تغريدة جديدة»)، مع `media_kind` (`none|image|video`) و`media_urls`
  (حتى 4 صور أو فيديو واحد — `validateComposeMedia`). الفيديو يُرفع
  للتخزين برابط موقّع (`/api/social-publishing/media/upload-url`) ثم
  عبر Publer `/media/from-url` — **الوسيلة المباشرة لا تدعم الفيديو v1**.
- `social_post_attempts` — سجل append-only لكل محاولة (طور، نتيجة، HTTP،
  رسالة منظفة من الأسرار، مدة).
- `social_post_bot_keys` — مفتاح عدم التكرار للبوت: `bot_name` +
  `client_reference` فريدان ويشيران إلى `social_posts.id`. جدول جانبي حتى
  لا تتغير قراءات اللوحة أو العامل. **يجب دفع المخطط قبل استخدام الواجهة**
  (`./push-to-production.sh`). غيابه يعطّل البوت فقط ولا يغيّر أعمدة
  `social_posts`.

## عقود مهمة / Gotchas
- **exactly-once:** المطالبة الفورية تحديث شرطي
  (`WHERE status IN (draft,failed,scheduled) RETURNING`) — النقر المزدوج يرد
  409. العامل يطالب بـ `FOR UPDATE SKIP LOCKED` (نمط طابور النشرات) مع
  `attempts + 1` عند المطالبة واسترداد أقفال processing الأقدم من 10 دقائق.
- **قرار الفشل:** `decideFailureTransition` — خطأ دائم (400/401/403) أو
  استنفاد 3 محاولات أو نشر فوري ⇒ `failed`؛ خطأ مؤقت (429/5xx/شبكة) لمجدول ⇒
  يعود `scheduled`. الفوري لا يُعاد آلياً — المستخدم يعيد يدوياً.
- **تجديد توكن X بالتناوب:** refresh tokens أحادية الاستخدام — `doRefresh`
  يخزن الجديد فوراً وsingle-flight في العملية يمنع تجديدين متوازيين. فشل
  التجديد الدائم يعلّم الحساب `expired` ويُطالَب المستخدم بإعادة الربط.
- **العد الموزون:** `shared/socialPostText.ts` — عربي/لاتيني = 1، إيموجي = 2،
  أي رابط = 23 (t.co). الرابط يُخزن في `linkUrl` منفصلاً ويُركب عند النشر
  بسطر جديد (`composeXPostText`). الحد 280.
- **الصور:** X يقبل JPEG/PNG/GIF فقط — `imageResolver` يحول WebP/AVIF إلى
  JPEG عبر sharp ويضغط حتى سقف 5MB. جلب الرابط خلف `assertSafeImageUrl`
  (SSRF allowlist) مع إطلاق المسارات النسبية على `PUBLIC_SITE_URL`.
  روابط `gs://` غير مدعومة في v1 (خطأ واضح).
- **rate limits داخلية:** توليد الاقتراح 30/15د لكل مستخدم، النشر 20/5د.
- **OAuth callback:** GET مع فحص `state` من الجلسة (صلاحية 10 دقائق) —
  لا تضفه إلى استثناءات CSRF؛ GET معفى بطبيعته والحماية عبر state.
- **الصلاحيات:** عائلة `social_publish.*` (8 أكواد) في
  `shared/rbac-constants.ts` + بذر `seedRBAC.ts`. المحرر ومدير المحتوى
  يملكون الكل عدا `manage_accounts` (ربط الحساب لمسؤول النظام). wildcard
  `"*"` مدعوم كالعادة.
- **متطلبات X:** النشر البرمجي يتطلب خطة مدفوعة أو pay-per-use — راجع
  `docs/setup/X_PUBLISHING_SETUP_AR.md`. غياب `X_CLIENT_ID/SECRET` يعطّل
  الربط برسالة واضحة في الواجهة (`oauthConfigured`).
- **وسيلة نقل Publer (بديلة):** `SOCIAL_PUBLISH_TRANSPORT=publer` +
  `PUBLER_API_KEY/PUBLER_WORKSPACE_ID` تجعل `getProvider("x")` يعيد
  `publerProvider` — جدولتنا وexactly-once والسجل تبقى حاكمة، وPubller
  ينفذ الرفع (`POST /media` حقل `file`) والنشر
  (`POST /posts/schedule/publish` بـ`bulk.state="scheduled"` **بلا**
  `scheduled_at` = فوري) مع استطلاع `job_status`. **مهلة الاستطلاع بعد
  إرسال النشر خطأ دائم عمداً** (الحالة مجهولة — إعادة آلية قد تكرر
  المنشور). `job_status` لا يعيد رابط المنشور — يُحل best-effort من
  `GET /posts` (`post_link`) بمطابقة النص ولا يُفشل منشوراً صدر فعلاً.
  الربط بلا OAuth: الحساب يُربط في لوحة Publer ثم يُزامَن عبر
  `POST /api/social-publishing/publer/sync` (صف الحساب بـ
  `credentialsEncrypted=null` — 401/403 من Publer خلل مفتاح/خطة ولا
  يعلّم الحساب `expired`).

- **مقترحات كتّاب الرأي (منذ 2026-08-18):** يستطيع كاتب الرأي، بعد نشر مقالته
  فعلياً (`status=published` و`publishedAt <= now`) وخلال أول **24 ساعة** فقط
  من وقت النشر الفعلي الموثوق في الخادم (`SOCIAL_POST_OPINION_WINDOW_MS`)،
  إعداد مقترح لمنشور على X عبر `POST /api/opinion-author/articles/:id/social-proposal`.
  المقترح يُحفظ كمسودة (`status=draft` مع `createdByUserId = authorId`) برابط المقال
  وصورته المعتمدين حصراً وبلا صلاحية نشر مباشر أو جدولة للكاتب. يظهر المقترح
  في `/dashboard/social-publishing` بشارة «مقترح كاتب رأي»، ويملك فريق سبق
  المخوّل تعديل النص واعتماد النشر الفوري أو الجدولة أو الرفض (`status=canceled`).
  انتهاء الـ24 ساعة بعد الإرسال لا يحذف المقترح من نظام مراجعة فريق سبق.

## متغيرات البيئة
`X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_OAUTH_REDIRECT_URI` (اختياري)،
`SOCIAL_PUBLISH_TOKEN_SECRET` (اختياري — يسقط على `SESSION_SECRET`)،
`SOCIAL_PUBLISH_TRANSPORT` (`publer` لتفعيل وسيلة Publer)،
`PUBLER_API_KEY`, `PUBLER_WORKSPACE_ID` (خطة Publer Business).

بوت النشر (منفصل عن `BOT_DRAFTS_API_TOKENS`): `SABQ_BOT_SOCIAL_TOKEN`
(توكن واحد، الاسم الافتراضي `nashr-x` ويُبدَّل بـ `SABQ_BOT_SOCIAL_NAME`)
أو `BOT_SOCIAL_API_TOKENS` بصيغة `name:token`. الإسناد:
`SABQ_BOT_SOCIAL_USER_ID` ثم `BOT_DRAFTS_AUTHOR_USER_ID` ثم حساب «صحيفة سبق».
الحدود: `BOT_SOCIAL_WRITE_RATE_LIMIT` (30/دقيقة)، `BOT_SOCIAL_PUBLISH_RATE_LIMIT`
(20/5 دقائق)، `BOT_SOCIAL_SUGGEST_RATE_LIMIT` (30/15 دقيقة).

## واجهة البوت (2026-09-28)
المسار `/api/internal/bot-social` يعيد استخدام `createDraftPost` /
`claimPostForImmediatePublish` / `publishClaimedPost` / `schedulePost` /
`cancelPost` / `suggestSocialPostForArticle`. لا منطق نشر ثانٍ.
`clientReference` مع اسم البوت مفتاح فريد: إعادة نفس المرجع لا تنشئ منشوراً
ثانياً. الخبر يجب أن يكون `published` و`publishedAt` ليس في المستقبل.
التدقيق في `activity_logs` بقناة `bot-social-api`. تعديل المنشور الفاشل
صار مسموحاً (`failed` ضمن الحالات القابلة للتعديل) حتى يصحّح البوت النص
قبل إعادة المحاولة.

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] أي منصة جديدة عبر `SocialPublishProvider` — لا تفرّع الخدمة/العامل
- [ ] لا تسجل توكنات في السجلات — استخدم `sanitizeSecretText`
