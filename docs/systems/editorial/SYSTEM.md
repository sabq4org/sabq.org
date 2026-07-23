# نظام التحرير وغرف الأخبار (`editorial`)

> آخر مراجعة: 2026-07-22 | المالك: editorial

## الغرض
غرفة الأخبار اليومية + أدوات التحرير بالذكاء الاصطناعي التي يستخدمها المحررون: عناوين، مقالات، تصنيف، SEO، روابط ذكية، صور، وكلاء بريد/واتساب، ومساعد كاتب الرأي، والإعلانات الداخلية الموجهة لفريق العمل.

## الحدود
- **داخل النطاق:** أقفال/حضور/تنبيهات/نبض، الإعلانات الداخلية، ومفاتيح AI المدرجة في السجل لهذا النظام.
- **خارج النطاق (لها أنظمة):** iFox، المقترب، الرادار، عُمق، أخبار البطولات، النشرات الصوتية، إشراف التعليقات، المتجهات/البرومبت (ai-hub).

## مفاتيح AI (حصرية)
`content-tools`, `journalist-agent`, `data-story`, `ai-article-generator`, `article-classification`, `content-analyzer`, `smart-categories`, `smart-category-classifier`, `story-matcher`, `smart-insights`, `geo-extraction`, `smart-links`, `story-cards`, `seo-generator`, `mobile-article-enrichment`, `image-generation`, `nano-banana-images`, `smart-thumbnail`, `visual-ai`, `infographic-ai`, `whatsapp-agent`, `email-agent`, `opinion-writer-*`, `coverage-gap-matcher`

## نقاط الدخول
| الطبقة | أمثلة |
|--------|--------|
| غرفة الأخبار | `articleEditLocks`, `editorAlerts`, `dashboardPulse` |
| الإعلانات الداخلية | `server/routes/announcements.ts`، `/api/announcements/*`، وصفحات `/dashboard/announcements` |
| AI تحريري | `ai-content-tools`, `journalist-agent-ai`, `aiArticleGenerator`, `seo-generator` |
| رادار الفجوات | `server/services/coverageGapMatcher.ts` (محرك المطابقة الدلالية), `server/routes/coverageGaps.ts` (`/api/admin/dashboard/coverage-gaps` + تعيين/مسودة/استبعاد) |
| Web | `/dashboard`, SmartJournalist, Communications, DataStory |
| صفحة الكاتب بالاسم | `GET /api/authors/by-name` → `authorProfileService`؛ واجهة `/author/:name`؛ من مقال الرأي يُفضَّل `/reporter/:slug` إن وُجد `staff.slug` وإلا `/author/:name` (مثل iOS) |

## عقود مهمة
- أي أداة AI جديدة من المحرر → أضف `featureKey` هنا وفي `defaults.ts`، ولا تكرره بنظام آخر.
- جزء كبير من الاستدعاءات القديمة ما زال يُحسب تحت `legacy-ai-manager` في `ai-hub` حتى تُهاجر.
- **فجوات v2** (`RADAR_GAP_V2_ENABLED`): وحدة الفجوة = `radar_stories` لا المادة المنفردة؛ تتطلب صلة ≥ `RADAR_GAP_MIN_RELEVANCE` وزخم ≥ `RADAR_GAP_MIN_MOMENTUM` (أو تعدد مصادر). أعمدة additive: `story_id`, `relevance_score`, `momentum_score`, `gap_reason`. لا تُفعَّل قبل ثبات تجميع القصص أسبوعاً. المستبعد يدوياً لا يُمس؛ التنظيف النظامي يستخدم `dismissReason=auto-irrelevant`.
- **عرض الداشبورد (2026-07-19):** قسم «فجوات التغطية الآن» في `NewsroomPulseDashboard` مخفي عن كل الأدوار. المكوّن `CoverageGapsSection` ومسارات `/api/admin/coverage-gaps*` تبقى في الكود لإعادة التفعيل لاحقاً.
- **الموجز في صفحة المقال:** حقل المحرر `excerpt` عند الحفظ يزامن `aiSummary` ويمسح `aiBullets`. تفريغ الملخص يخفي الصندوق (لا إعادة توليد من نص المقال). الواجهة لا تكرر الفقرة تحت النقاط إن كانا نفس النص.
- **أسلوب الصور المولّدة:** مفتاح `auto_image_generation_settings` يحتوي `newsStyle` (أخبار/تحليل) و`articleStyle` (رأي/عمود). `defaultStyle` يبقى متزامناً مع `newsStyle` للتوافق. الاختيار عبر `resolveStyleForArticleType` في `autoImageGenerationService`. كتّاب الرأي لا يرون ألبوم الصور ولا المرفقات في `ArticleEditor`.
- **KPI كتّاب الرأي** (`OpinionWritersPage`): تُحسب من قائمة `/api/admin/opinion-writers` في الواجهة — منها «اختاروا يوم النشر» (`schedule.active`) و«بلا نشاط أكثر من شهرين» (لا `lastArticle` أو أقدم من ٦٠ يوماً). `listOpinionWriters` يستخدم `toIsoOrNull` حتى لا يُسقط الطلب كاملاً بـ `Invalid time value` من صف تاريخ فاسد.
- **ناشر / وكالة في محرّر الخبر:** إن وُجد حساب `publishers` للمستخدم (`resolvePublisherForUser` → `publisherAccount` في `/api/auth/user`)، قائمة المراسلين في `ReporterSelect` تقتصر على «صحيفة سبق» (`SABQ_NEWSPAPER_ACCOUNT_ID`) وتُثبَّت عند الإنشاء/التحديث مع `publisherId` و`isPublisherNews`. لا يعتمد على دور `publisher` وحده — مالك الوكالة قد يكون دوره `reporter`.
- **ناشر موثوق (`publishers.auto_publish`):** يمنح `articles.publish` ديناميكياً عبر `trustedPublisherCanPublish`. مسار `submitForReview` لا يُحوّل خبره إلى مسودة/`pending_review` — ينشر مباشرة. أعمدة `auto_publish` و`publishing_ends_at` مطلوبة في جدول `publishers` (بدونها تنهار قراءة الوكالة ويُعامل كمراسل عادي).
- **مواد بوابة الناشر:** تُحسب فقط عبر `articles.publisher_id` (لا عبر `authorId` لمالك الوكالة) حتى لا يدخل أرشيف المراسل القديم في باقة الوكالة. ختم الإنشاء من المحرر يضبط `publisherId` + `isPublisherNews`. سكربت تنظيف: `scripts/unlink-publisher-except-today.ts`.
- **سعة يوم النشر:** حد ثابت `OPINION_WRITERS_PER_DAY_CAP = 10` في `shared/opinionWriterConstants.ts`. عند الامتلاء تظهر «غير متاح للنشر» في لوحة الكتّاب ومنتقي الكاتب، ويُرفض التعيين الذاتي والإداري ليوم ممتلئ (إلا تحديث نفس اليوم). العرض: «X من 10 كتّاب» (لا `X/10` حتى لا يُقرأ كتاريخ).
- **التزام كتّاب الرأي:** `hasUpcoming` / `pendingCount` يعتبران المقال مُرسلاً إن `reviewStatus=pending_review` أو مسودة موبايل (`source` ios-app/android-app و`reviewStatus` فارغ). إرسال `/api/v1/articles/submit` يضبط `pending_review` من البداية.
- **بانر موعد الكاتب:** `submitDeadline = nextPublishAt − يومان`. التذكير (`reminder`/`due_soon`) فقط والمهلة ما زالت في المستقبل؛ بعد فواتها → `late` بنص «فات آخر موعد للإرسال» دون عرض تاريخ ماضٍ. لا تربط التذكير بـ«خلال يومين من النشر» لأنها تتزامن مع انتهاء المهلة فتظهر رسالة محرجة.
- **محرّر الإدخال ≠ كاتب الرأي:** لمقالات الرأي `authorId` = الكاتب الظاهر للقارئ، و`submitterId` = من أدخل المادة في المحرر. بانر المحرر يعتمد على `enteredBy` من `submitterId` فقط (لا يخلط الكاتب بالمحرر).
- **نقر كاتب الرأي على الويب:** إن وُجد `staff.slug` → `/reporter/:slug`. وإلا → `/author/:name` عبر `GET /api/authors/by-name` (مطابقة الاسم على `users`، ترتيب بآخر نشر مثل الموبايل `/api/v1/authors/by-name`). لا تعتمد النقر على وجود `reporterId`/ملف staff فقط.
- **استهداف الإعلانات الداخلية:** قيم `audienceRoles` هي أسماء الأدوار القانونية من `roles.name` وليست معرّفات الأدوار. `null` أو المصفوفة الفارغة للأدوار والمستخدمين تعني «الجميع». عند وجود استهداف، المطابقة باسم الدور مطابقة تامة، والمستخدم المحدد صراحةً يُقبل بالإضافة إلى الدور (OR). قائمة الاختيار تأتي من `GET /api/announcements/roles` ولا تُثبت في الواجهة.
- **قنوات الإعلانات الداخلية:** المستقبل الفعلي الحالي هو `dashboardBanner`. قيمتا `inbox` و`toast` محجوزتان في العقد لكن اختيارُهما معطل في المحرر حتى يُربط لكل منهما مستقبل عرض/تسليم مستقل؛ لا تعرضهما كبانر بديل.
- **عرض بانر الإعلان (`InternalAnnouncement`):** بطاقة قابلة للطي مع أيقونة وشريط أولوية ومعاينة سطرين عند الطي. نص الرسالة يُعرض بمحاذاة البداية (يتجاوز توسيط HTML الملصوق من البريد). استخدم حقل زر الإجراء للروابط بدل لصق URL خام داخل النص.
- **ترخيص مهني مشترك (كاتب رأي + مراسل):** أعمدة `users.media_license_*`؛ المنطق في `server/services/mediaLicenseService.ts`. مسارات: `GET/POST /api/opinion-author/media-license` و`GET/POST /api/reporter/media-license`. الرفع عبر `mediaLicenseUpload.ts` → `ObjectStorageService.uploadPrivateDocument` (**يفضّل R2 حتى مع FORCE_S3**؛ يحوّل HEIC→JPEG). `licenseExpiresAt` إلزامي؛ **رفض ترخيص منتهٍ** عبر `mediaLicenseExpiryRejection` / `saveMediaLicense`. الاستجابة: `submitted` / `valid` / `expired` / `expiringSoon` / `expiresAt`. البطاقة تُبقي شريطاً «ساري ومسجّل» بعد اختفاء رسالة الشكر. المهلة التنظيمية لأول تقديم: `2026-07-31`.
- **صلاحية الترخيص بدون تاريخ:** `resolveMediaLicenseEnd` — تاريخ ناقص/فاسد = غير ساري (`expired` إن كان مقدَّماً، لا `مرخّص`). منتصف ليل UTC يُفسَّر كنهاية يوم الرياض. القوائم تستخدم `mediaLicenseFlags`؛ الواجهة تعرض دائماً «حتى …» أو «بلا تاريخ انتهاء».
- **شارة الترخيص في الشريط:** غير مرخّص / منتهٍ / جدّد → تنقل إلى نموذج `WriterMediaLicenseCard` عبر `#writer-media-license` (كاتب: `/dashboard/opinion-author`، مراسل: `/dashboard/reporter/articles`) وتفتح النموذج إن لزم.
- **إدارة الترخيص — كتّاب الرأي:** `/dashboard/opinion-writers` عبر `DashboardPageHeader`؛ خلية مضغوطة + فلترة؛ `GET /api/admin/opinion-writers/:id/media-license-file`.
- **إدارة المراسلين:** `/dashboard/reporters` — **مسؤول النظام فقط** (`requireRoles` في السايدبار + `ProtectedRoute` + `requireRole` على `/api/admin/reporters*`). لا تُفتح عبر `articles.view`/`users.view`. أعمدة الصفحة: ترخيص، مدينة، آخر دخول — **بدون** منشورة/آخر خبر/مشاهدات. API: `GET /api/admin/reporters` من `users` + ملف الترخيص؛ `GET /api/admin/reporters/:id/articles` موجود ولا تستهلكه الصفحة. ترتيب: منتهٍ → جدّد → بدون → ساري. KPI «نشطون آخر ٧ أيام» يعتمد `lastLoginAt` فقط.
- **مفضلة لوحة التحكم:** نجمة ★ بجانب اسم الصفحة النشطة في `AppBreadcrumbs` (كل صفحات `/dashboard/*` ذات عنصر قائمة). `AppBreadcrumbs` يمرّر `permissions`/`allRoles` وإلا تُستبعد العناصر ذات صلاحيات ويُعرض «نظرة عامة» خطأً. `findActiveItem` لا يطابق `meta.exact` بالمقدّمة. `DashboardPageHeader.showFavoriteToggle` افتراضياً false لتفادي نجمتين.
- **سايدبار محرّر المقال:** بدون `sticky`/`max-h` على عمود الإعدادات — التمرير يتم مع صفحة الداشبورد حتى يُصل لآخر حقول SEO والكلمات المفتاحية (كان sticky يقصّ الأسفل داخل `overflow-auto` للداشبورد).
- **إنعاش الخبر:** `POST /api/articles/:id/resurface` يختم `articles.resurfaced_at` فقط (لا يغيّر `publishedAt`/المشاهدات/الرابط). صدارة الواجهة تعتمد `COALESCE(resurfaced_at, published_at)` في `homepage-lite` و`/api/v1/homepage` و`home-bundle` — أي مسار موجز جديد يجب أن يستخدم نفس الترتيب وإلا لن يظهر المُنعش أولاً.

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] حدّثت `aiFeatureKeys` في السجل إن لزم
