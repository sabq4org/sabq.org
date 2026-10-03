# النشر الاجتماعي (`social-publishing`)

> آخر مراجعة: 2026-10-03 (منشور بوت بلا خبر: صور متعددة ووسوم قياس) | المالك: editorial + platform

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
  المنشور). وثائق Publer: `job_status` المكتمل `{ status, payload.failures }`
  بلا رابط وبلا معرف منشور — `publer:<jobId>` ليس مسار `GET /posts/{id}`.
  الرابط في `GET /posts` → `post_link` (أي رابط status على x.com/twitter.com؛
  `url` رابط المحتوى، و`id` معرف Publer). البحث: `state=published` ثم
  `published_posted` عند الحاجة، مع `account_ids[]` و`from`/`to` حول
  `publishedAt` (±يوم، حتى يبقى اليوم داخل الحدين). المطابقة بالحساب ثم
  بنص السطر الأول أو `linkUrl`، لا ببادئة النص المركّب مع الرابط. سجل
  واحد لكل محاولة: `publer_post_link_lookup` = found / not_found / error.
  بعد اكتمال المهمة استطلاع قصير (3 محاولات / ثانيتان). عند الغياب: `externalPostId`
  = `publer:<jobId>` و`externalPostUrl` = `https://x.com/{handle}` **فقط**
  إذا كان handle معرف X صالحاً (`[A-Za-z0-9_]{1,15}`)، وإلا `null`.
  **لا يُبنى رابط من اسم العرض** ولا من `https://app.publer.com/`. الحقل
  معلّق حتى يظهر `post_link`؛ عندها يُخزَّن `https://x.com/{handle}/status/{id}`
  ومعرف التغريدة. قراءة `GET /api/internal/bot-social/posts` (قائمة أو
  تفاصيل أو مرجع) تعيد المحاولة لمنشور `published` بمعرف `publer:` بلا
  رابط status وتكتب النتيجة على الصف. المنشور المجدول يمر بنفس
  `createPost` عبر العامل، ثم بنفس الإكمال عند القراءة. لا يُفشل منشور
  صدر لمجرد تعذر الرابط.
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

## منشور البوت بلا خبر (2026-10-03)

`kind: "original"` على `preview` / `publish` / `schedule` ينشر نصاً وصوراً (حتى 4) بلا `article_id`. حد الرفض 2000 حرفاً موزوناً؛ 280 يبقى `overStandard` ولا يرفض. مسار الخبر (بلا `kind` أو مع خبر) يبقى على حد 25000 وبلا وسم قياس. الرابط الاختياري على `sabq.org` فقط، والخادم يكتب `utm_source=x` و`utm_medium=social` و`utm_campaign` (افتراضي `sabqorg`) و`utm_content=<social_posts.id>`. المعاينة تستخدم `utm_content=preview` ولا تنشئ صفاً. رفع الملف: `POST /api/internal/bot-social/images` بنفس توكن البوت وعبر `newsImageStorageService` (`forceR2`). لا عمود جديد ولا حذف لتغريدة منشورة. العقد: [`BOT_SOCIAL_API.md`](./BOT_SOCIAL_API.md).

## واجهة البوت (2026-09-28)
المسار `/api/internal/bot-social` يعيد استخدام `createDraftPost` /
`claimPostForImmediatePublish` / `publishClaimedPost` / `schedulePost` /
`cancelPost` / `suggestSocialPostForArticle`. لا منطق نشر ثانٍ.
`suggest` / `preview` / `publish` / `schedule` تقبل `articleUrl`
(`https://sabq.org/article/...` أو `www`) بدل `articleId` أو معهما إن حُلّا
إلى نفس الصف. بعد فك ترميز المقطع يُبحث بالترتيب: `english_slug`، ثم
`slug`، ثم `legacy_slug`، ثم `id` إن كان UUID. `GET /resolve?url=` يعيد
`{ articleId, title, status, publishedAt, linkUrl, lang }` قبل الكتابة.
الإنجليزية والأردية: `422 unsupported_language`.
`clientReference` مع اسم البوت مفتاح فريد على المعرّف المحلول: إعادة نفس
المرجع لخبر آخر ترجع `409 reference_article_mismatch`. الخبر يجب أن يكون
`published` و`publishedAt` ليس في المستقبل.
التدقيق في `activity_logs` بقناة `bot-social-api`. تعديل المنشور الفاشل
صار مسموحاً (`failed` ضمن الحالات القابلة للتعديل) حتى يصحّح البوت النص
قبل إعادة المحاولة.

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] أي منصة جديدة عبر `SocialPublishProvider` — لا تفرّع الخدمة/العامل
- [ ] لا تسجل توكنات في السجلات — استخدم `sanitizeSecretText`
