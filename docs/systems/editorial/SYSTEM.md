# نظام التحرير وغرف الأخبار (`editorial`)

> آخر مراجعة: 2026-08-02 (زر واتساب داخل نص المقال فقط) | المالك: editorial

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
| Web | `/dashboard`, Communications, Prompt Studio, Voice Management |
| صفحة الكاتب بالاسم | `GET /api/authors/by-name` → `authorProfileService`؛ واجهة `/author/:name`؛ من مقال الرأي يُفضَّل `/reporter/:slug` إن وُجد `staff.slug` وإلا `/author/:name` (مثل iOS) |

## عقود مهمة
- أي أداة AI جديدة من المحرر → أضف `featureKey` هنا وفي `defaults.ts`، ولا تكرره بنظام آخر.
- جزء كبير من الاستدعاءات القديمة ما زال يُحسب تحت `legacy-ai-manager` في `ai-hub` حتى تُهاجر.
- **فجوات v2** (`RADAR_GAP_V2_ENABLED`): وحدة الفجوة = `radar_stories` لا المادة المنفردة؛ تتطلب صلة ≥ `RADAR_GAP_MIN_RELEVANCE` وزخم ≥ `RADAR_GAP_MIN_MOMENTUM` (أو تعدد مصادر). أعمدة additive: `story_id`, `relevance_score`, `momentum_score`, `gap_reason`. لا تُفعَّل قبل ثبات تجميع القصص أسبوعاً. المستبعد يدوياً لا يُمس؛ التنظيف النظامي يستخدم `dismissReason=auto-irrelevant`.
- **عرض الداشبورد (2026-07-19):** قسم «فجوات التغطية الآن» في `NewsroomPulseDashboard` مخفي عن كل الأدوار. المكوّن `CoverageGapsSection` ومسارات `/api/admin/coverage-gaps*` تبقى في الكود لإعادة التفعيل لاحقاً.
- **الموجز في صفحة المقال:** حقل المحرر `excerpt` عند الحفظ يزامن `aiSummary` ويمسح `aiBullets`. تفريغ الملخص يخفي الصندوق (لا إعادة توليد من نص المقال). الواجهة لا تكرر الفقرة تحت النقاط إن كانا نفس النص. عند فتح تفاصيل الخبر يكون الموجز مطوياً على **3 أسطر** مع زر «عرض المزيد»/«طيّ» (مثل iOS/Android؛ عتبة الظهور ≈ 120 حرفاً). لا يُحفظ حالة التوسيع في localStorage — كل مقال يبدأ مطوياً.
- **زر واتساب في المقال:** عمود `articles.whatsapp_cta` (jsonb) للإعدادات فقط. الظهور دائماً **داخل** `content` عبر عقدة TipTap `div[data-whatsapp-cta]` (رابط `https://wa.me/{digits}`) — نهاية النص أو عند المؤشر. لا بطاقة منفصلة خارج جسم المقال. عند الحفظ مع `placement=end` تُزامن الكتلة لنهاية HTML. المنطق: `shared/whatsappCta.ts`. iOS/Android يعرضان الكتلة من HTML فقط.
- **أسلوب الصور المولّدة:** مفتاح `auto_image_generation_settings` يحتوي `newsStyle` (أخبار/تحليل) و`articleStyle` (رأي/عمود). `defaultStyle` يبقى متزامناً مع `newsStyle` للتوافق. الاختيار عبر `resolveStyleForArticleType` في `autoImageGenerationService`. كتّاب الرأي لا يرون ألبوم الصور ولا المرفقات في `ArticleEditor`.
- **KPI كتّاب الرأي** (`OpinionWritersPage`): تُحسب من قائمة `/api/admin/opinion-writers` في الواجهة — منها «اختاروا يوم النشر» (`schedule.active`) و«بلا نشاط أكثر من شهرين» (لا `lastArticle` أو أقدم من ٦٠ يوماً). `listOpinionWriters` يستخدم `toIsoOrNull` حتى لا يُسقط الطلب كاملاً بـ `Invalid time value` من صف تاريخ فاسد.
- **ناشر / وكالة في محرّر الخبر:** إن وُجد حساب `publishers` للمستخدم (`resolvePublisherForUser` → `publisherAccount` في `/api/auth/user`)، قائمة المراسلين في `ReporterSelect` تقتصر على «صحيفة سبق» (`SABQ_NEWSPAPER_ACCOUNT_ID`) وتُثبَّت عند الإنشاء/التحديث مع `publisherId` و`isPublisherNews`. لا يعتمد على دور `publisher` وحده — مالك الوكالة قد يكون دوره `reporter`.
- **ناشر موثوق (`publishers.auto_publish`):** يمنح `articles.publish` ديناميكياً عبر `trustedPublisherCanPublish`. مسار `submitForReview` لا يُحوّل خبره إلى مسودة/`pending_review` — ينشر مباشرة. أعمدة `auto_publish` و`publishing_ends_at` مطلوبة في جدول `publishers` (بدونها تنهار قراءة الوكالة ويُعامل كمراسل عادي).
- **حالة الوكالة في لوحة الإدارة (`/dashboard/admin/publishers`):** حالة واحدة مشتقة في الخادم (`derivePublisherHealth`) لا خمس إشارات مستقلة في البطاقة: `suspended` → `window_ended` → `package_expired` / `no_package` → `credits_out` → `expiring_soon` (٧ أيام) → `healthy`. الواجهة تلوّن كل شيء منها (`publisherHealth.ts`) — لا تُلوَّن شارة تاريخ بعدد أيامها وحده، وإلا ظهرت «الباقة: بعد ٣٠٠ يوم» خضراء لوكالة موقوفة. `rich-list` يجلب كل الباقات لا النشطة فقط ليميّز «لم تُضف باقة» عن «انتهت/أُلغيت باقة كذا».
- **أرقام ترويسة الناشرين:** من `GET /api/admin/publishers/summary` على كل الوكالات لا على الصفحة الحالية. `needsAttention` يُحسب في SQL بـ `OR` واحد — جمع `noValidPackage + windowEnded` في الواجهة كان يعدّ الوكالة الواحدة مرتين. انتبه لأولوية `NOT` فوق `AND` في Postgres: أي شرط مركّب يُنفى لاحقاً يجب أن يُقوَّس.
- **بوابة الناشر (`/dashboard/publisher`):** `POST /api/publisher/portal/requests` كان بلا أي مستدعٍ في الواجهة — الوكالة لا تملك زراً لإرسال طلب أصلاً بينما لوحة الإدارة تعرض طلبات لا مصدر لها. الإرسال الآن من `PublisherRequestDialog` (اللوحة + صفحة الرصيد)، و`GET /api/publisher/portal/requests` يعرض للوكالة مصير طلبها. الخادم يمنع أكثر من طلب مفتوح من نفس النوع (409) فالواجهة تُعطّل الزر عند وجود طلب مفتوح.
- **`publishBlock` في `overview`:** سبب واحد يُحسب في الخادم (موقوف → نافذة منتهية → بلا باقة → رصيد صفر) يقود تعطيل زر «خبر جديد» ويُعرض نصاً. قبله كان الزر يُعطَّل بصمت للنافذة فقط ويبقى فعّالاً مع رصيد صفر ثم يرفض الخادم عند النشر.
- **`attention[].action`:** كل تنبيه يحمل إجراءه (`request` بنوع الطلب أو `link`) ليبقى حساب الشارات في الخادم كما هو والواجهة عرضاً فقط.
- **عدّاد مواد الوكالة:** `draftArticles` يشمل المسودة و`pending` و`needs_changes` معاً. اللوحة تفصلها (المسودة الحقيقية = `draft − pending − needsChanges`) لأن «تحتاج تعديلاتك» وحدها هي المطلوبة من الوكالة.
- **طلبات الوكالات:** `publisher_requests.status` صار `open | closed | rejected`. الرفض (`POST /requests/:id/reject`) يحفظ السبب في `publisher_requests.admin_note` ويُبلغ الوكالة به في الإشعار، ويظهر في سجل الإدارة وصفحة الرصيد لدى الوكالة (العمود أُضيف يدوياً على الإنتاج بـ `ALTER TABLE ... ADD COLUMN IF NOT EXISTS admin_note text` قبل نشر الكود، لا عبر `db:push`). الحذف (`DELETE /requests/:id`) نهائي وبلا إشعار، لطلبات التجربة. `GET /requests?status=` يفتح السجل المغلق والمرفوض بعد أن كان الطلب يختفي بلا أثر.
- **مواد بوابة الناشر:** تُحسب فقط عبر `articles.publisher_id` (لا عبر `authorId` لمالك الوكالة) حتى لا يدخل أرشيف المراسل القديم في باقة الوكالة. ختم الإنشاء من المحرر يضبط `publisherId` + `isPublisherNews`. سكربت تنظيف: `scripts/unlink-publisher-except-today.ts`.
- **سعة يوم النشر:** حد ثابت `OPINION_WRITERS_PER_DAY_CAP = 10` في `shared/opinionWriterConstants.ts`. عند الامتلاء تظهر «غير متاح للنشر» في لوحة الكتّاب ومنتقي الكاتب، ويُرفض التعيين الذاتي والإداري ليوم ممتلئ (إلا تحديث نفس اليوم). العرض: «X من 10 كتّاب» (لا `X/10` حتى لا يُقرأ كتاريخ).
- **التزام كتّاب الرأي:** `hasUpcoming` / `pendingCount` يعتبران المقال مُرسلاً إن `reviewStatus=pending_review` أو مسودة موبايل (`source` ios-app/android-app و`reviewStatus` فارغ). إرسال `/api/v1/articles/submit` يضبط `pending_review` من البداية.
- **مقالات تنتظر التعديل (موبايل):** `GET /api/v1/articles/my-revisions` يرشّح `review_status=needs_changes` مع `(author_id OR reporter_id)` ويرتّب بـ `reviewed_at`. يعتمد على الفهرسين الجزئيين `idx_articles_needs_changes_author_reviewed` و`idx_articles_needs_changes_reporter_reviewed`؛ لا تُزلهما أو توسّع الاستعلام بطريقة تعيده إلى مسح جدول `articles` كاملاً.
- **بانر موعد الكاتب:** `submitDeadline = nextPublishAt − يومان`. التذكير (`reminder`/`due_soon`) فقط والمهلة ما زالت في المستقبل؛ بعد فواتها → `late` بنص «فات آخر موعد للإرسال» دون عرض تاريخ ماضٍ. لا تربط التذكير بـ«خلال يومين من النشر» لأنها تتزامن مع انتهاء المهلة فتظهر رسالة محرجة.
- **محرّر الإدخال ≠ كاتب الرأي:** لمقالات الرأي `authorId` = الكاتب الظاهر للقارئ، و`submitterId` = من أدخل المادة في المحرر. بانر المحرر يعتمد على `enteredBy` من `submitterId` فقط (لا يخلط الكاتب بالمحرر).
- **إشعارات التحرير (push/in-app):** `resolveArticleStakeholderIds` يستهدف أصحاب المحتوى فقط (`authorId` / `reporterId` البشري). لا يُبلَّغ `submitterId` إلا كاحتياط عند غياب صاحب محتوى بشري. مرّر دائماً `excludeUserId` = من نفّذ الإجراء (جدولة/أرشفة/حذف/رفض/طلب تعديل) حتى لا يصل للمسؤول نص «يؤسفنا…» أو «تمت الجدولة» عن عمله هو.
- **نقر كاتب الرأي على الويب:** إن وُجد `staff.slug` → `/reporter/:slug`. وإلا → `/author/:name` عبر `GET /api/authors/by-name` (مطابقة الاسم على `users` ثم اختيار المكرّر بآخر `author_id` نشر؛ قائمة عبر `author_id` + كاش ذاكرة ٥ دقائق). الواجهة شبكة عناوين مثل `/opinion` لا صفوف صور. العدّ والقائمة يستبعدان صفوف الترحيل المكررة (`DISTINCT ON (title, published_at)` مع الإبقاء على أعلى مشاهدات). الاستجابة تتضمن `pagination.hasMore`؛ الصفحة تستخدم `useInfiniteQuery` + زر «عرض المزيد».
- **استهداف الإعلانات الداخلية:** قيم `audienceRoles` هي أسماء الأدوار القانونية من `roles.name` وليست معرّفات الأدوار. `null` أو المصفوفة الفارغة للأدوار والمستخدمين تعني «الجميع». عند وجود استهداف، المطابقة باسم الدور مطابقة تامة، والمستخدم المحدد صراحةً يُقبل بالإضافة إلى الدور (OR). قائمة الاختيار تأتي من `GET /api/announcements/roles` ولا تُثبت في الواجهة.
- **قنوات الإعلانات الداخلية:** المستقبل الفعلي الحالي هو `dashboardBanner`. قيمتا `inbox` و`toast` محجوزتان في العقد لكن اختيارُهما معطل في المحرر حتى يُربط لكل منهما مستقبل عرض/تسليم مستقل؛ لا تعرضهما كبانر بديل.
- **عرض بانر الإعلان (`InternalAnnouncement`):** بطاقة قابلة للطي مع أيقونة وشريط أولوية ومعاينة سطرين عند الطي. نص الرسالة يُعرض بمحاذاة البداية (يتجاوز توسيط HTML الملصوق من البريد). استخدم حقل زر الإجراء للروابط بدل لصق URL خام داخل النص.
- **ترخيص مهني مشترك (كاتب رأي + مراسل):** أعمدة `users.media_license_*`؛ المنطق في `server/services/mediaLicenseService.ts` + ثوابت `shared/mediaLicense.ts`. مسارات: `GET/POST /api/opinion-author/media-license` و`GET/POST /api/reporter/media-license`. الرفع عبر `mediaLicenseUpload.ts` → `ObjectStorageService.uploadPrivateDocument` (**يفضّل R2 حتى مع FORCE_S3**؛ يحوّل HEIC→JPEG). `licenseExpiresAt` إلزامي؛ **رفض ترخيص منتهٍ** عبر `mediaLicenseExpiryRejection` / `saveMediaLicense`. الاستجابة: `submitted` / `valid` / `expired` / `expiringSoon` / `needsCorrection` / `pendingReview` / `reviewStatus` / `adminNote` / `expiresAt` / `enforcementActive` / `submissionBlocked`. البطاقة تُبقي شريطاً «ساري ومسجّل» بعد اختفاء رسالة الشكر. المهلة التنظيمية: آخر يوم `2026-07-31`؛ بوابة الإرسال من `2026-08-01`.
- **دورة مراجعة ملف الترخيص:** عمود `media_license_review_status` = `approved` | `needs_correction` | `pending_review` (null = تراث يُعامل كـ approved إن وُجد ملف). **كل رفع** (أول مرة / تجديد / تصحيح) من `saveMediaLicense` يدخل `pending_review` — لا اعتماد تلقائي. الموافقة/الرفض من مسؤول النظام (كتّاب: `OPINION_REVIEW`؛ مراسلون: system_admin). مسار الحالات: رفع → `تحت المراجعة` → موافقة (`مرخّص`) أو رفض (`يحتاج تصحيحاً`) → إعادة رفع → مراجعة. أثناء `pending_review` تُعطَّل أزرار «ابدأ الكتابة / إضافة خبر» عبر `useMediaLicenseGate` (حتى قبل تاريخ التعطيل التنظيمي). APIs: `POST .../media-license-correction` و`.../media-license-approve` و`.../media-license-reject`. سكربت: `scripts/sql/add-media-license-correction-note-2026-07-25.sql`.
- **بوابة الإرسال من ١ أغسطس ٢٠٢٦ (رياض):** `isMediaLicenseEnforcementActive` — آخر يوم مهلة `2026-07-31`؛ التعطيل من `2026-08-01T00:00:00+03:00`. عند تفعيله يُرفض النشر/`submitForReview` ومسارات الإرسال (`/api/admin/articles`، submit-review، موبايل `/articles/submit`) إن كان صاحب الاسم بلا ترخيص ساري (`assertMediaLicenseAllowsSubmission`). حساب «صحيفة سبق» مستثنى. في منتقي المراسل/الكاتب: `licenseSelectable: false` → اسم مطفي وغير قابل للاختيار. حفظ المسودة (تعديل قائم) يبقى متاحاً.
- **صلاحية الترخيص بدون تاريخ:** `resolveMediaLicenseEnd` — تاريخ ناقص/فاسد = غير ساري (`expired` إن كان مقدَّماً، لا `مرخّص`). منتصف ليل UTC يُفسَّر كنهاية يوم الرياض. القوائم تستخدم `mediaLicenseFlags`؛ الواجهة تعرض دائماً «حتى …» أو «بلا تاريخ انتهاء».
- **شارة الترخيص في الشريط:** غير مرخّص / منتهٍ / جدّد → تنقل إلى نموذج `WriterMediaLicenseCard` عبر `#writer-media-license` داخل `/dashboard/my-services` وتفتح النموذج إن لزم.
- **شريط تحذير الترخيص في اللوحة:** لمراسل/كاتب رأي بلا ترخيص ساري معتمد أو بترخيص منتهٍ أو تحت المراجعة أو يحتاج تصحيحاً يظهر أعلى المحتوى في `DashboardLayout` (`MEDIA_LICENSE_DASHBOARD_WARNING` أو `MEDIA_LICENSE_PENDING_REVIEW_WARNING`)؛ الضغط يفتح نموذج الترخيص. المنطق مشترك عبر `useMediaLicenseGate`.
- **تعطيل إنشاء مقال/خبر:** نفس الجمهور (بلا ترخيص / منتهٍ / تحت المراجعة / يحتاج تصحيحاً) — تُعطَّل أزرار «إنشاء مقال/خبر» و«ابدأ الكتابة» حتى تصبح الحالة `valid` (ملف + تاريخ ساري + `approved`). فتح `/dashboard/articles/new` يعيد إلى نموذج الترخيص.
- **إدارة الترخيص — كتّاب الرأي:** `/dashboard/opinion-writers` عبر `DashboardPageHeader`؛ خلية مضغوطة + فلترة (تحت المراجعة / يحتاج تصحيحاً / …) + اعتماد/رفض/طلب تصحيح؛ `GET /api/admin/opinion-writers/:id/media-license-file`.
- **إدارة المراسلين:** `/dashboard/reporters` — **مسؤول النظام فقط** (`requireRoles` في السايدبار + `ProtectedRoute` + `requireRole` على `/api/admin/reporters*`). لا تُفتح عبر `articles.view`/`users.view`. أعمدة الصفحة: ترخيص، مدينة، آخر دخول — **بدون** منشورة/آخر خبر/مشاهدات. API: `GET /api/admin/reporters` من `users` + ملف الترخيص؛ `GET /api/admin/reporters/:id/articles` موجود ولا تستهلكه الصفحة. ترتيب: تحت المراجعة → منتهٍ → يحتاج تصحيحاً → جدّد → بدون → ساري. KPI «نشطون آخر ٧ أيام» يعتمد `lastLoginAt` فقط.
- **مفضلة لوحة التحكم:** نجمة ★ بجانب اسم الصفحة النشطة في `AppBreadcrumbs` (كل صفحات `/dashboard/*` ذات عنصر قائمة). `AppBreadcrumbs` يمرّر `permissions`/`allRoles` وإلا تُستبعد العناصر ذات صلاحيات ويُعرض «نظرة عامة» خطأً. `findActiveItem` لا يطابق `meta.exact` بالمقدّمة. `DashboardPageHeader.showFavoriteToggle` افتراضياً false لتفادي نجمتين.
- **سايدبار محرّر المقال:** بدون `sticky`/`max-h` على عمود الإعدادات — التمرير يتم مع صفحة الداشبورد حتى يُصل لآخر حقول SEO والكلمات المفتاحية (كان sticky يقصّ الأسفل داخل `overflow-auto` للداشبورد).
- **قنوات الاتصال (`/dashboard/communications`):** مفردات الحالة في السجلات هي ما يكتبه الخادم فقط — البريد: `received` / `published` / `processed` (= مسودة) / `rejected` / `failed`، وواتساب: `received` / `processed` / `rejected` مع `publishStatus` للتمييز بين منشور ومسودة. لا تُضِف خيارات فلترة بأسماء غير هذه (`success` / `drafted` / `processing` كانت ترجع صفر نتائج دائماً؛ `success`→`processed` و`failed`→`rejected` مقبولان الآن كمرادفين في `/api/whatsapp/logs` للتوافق فقط). `badge-stats` للقناتين يعيد `newMessages` / `publishedToday` / `draftedToday` / `rejectedToday`، و«اليوم» يُحسب بتوقيت الرياض عبر `server/utils/riyadhDay.ts` لا بتوقيت الخادم. رمز واتساب يُولَّد على الخادم بـ `crypto` قبل `insertWhatsappTokenSchema.parse` ولا يُقبل من العميل. بوابة الصفحة صلاحيات لا أدوار نصية، والتبويب الذي لا يملكه المستخدم يعرض رسالة صريحة بدل جدول فارغ.
- **منع تكرار البريد الذكي (`emailAgentDedup`):** طبقتان في `POST /api/email-agent/webhook` عبر `claimEmailDedup`: (1) `Message-ID` يمنع إعادة إرسال SendGrid لنفس الرسالة، (2) بصمة محتوى `content:<hash(sender|subject)>` تمنع إعادة إرسال نفس الخبر من نفس المرسل خلال `EMAIL_AGENT_CONTENT_DEDUP_HOURS` (افتراضي 6). إعادة الإرسال تظهر في السجل كـ `rejected` + `rejectionReason=duplicate_content`. لا تعتمد على تطابق عنوان المقال بعد تحرير AI — الموضوع الأصلي للبريد هو المصدر.
- **ACK مبكر لـ SendGrid Inbound Parse:** بعد نجاح `claimEmailDedup` يُرجع الـ webhook `200` فوراً (`accepted: true`) **قبل** GPT/رفع الصور/النشر. المعالجة تكمل في نفس الطلب بلا رد ثاني (`respondWebhook` يتجاهل إن `headersSent`). بدون ذلك: المعالجة غالباً >30ث → SendGrid يعيد POST أثناء النشر الأول → موجة تكرار. **طابور بعد تحديث URL:** إن كان الـ parse يشير لرابط بلا `token` صحيح، كل التسليمات ترد `401` وتتراكم؛ بعد PATCH الرابط الصحيح يُفرَّغ الطابور دفعة واحدة (موجة متأخرة متوقعة مرة). التكرار المستمر بعدها = timeout retries وليس «بريد جديد».
- **إنعاش الخبر:** `POST /api/articles/:id/resurface` يختم `articles.resurfaced_at` فقط (لا يغيّر `publishedAt`/المشاهدات/الرابط). صدارة الواجهة تعتمد `COALESCE(resurfaced_at, published_at)` في `homepage-lite` و`/api/v1/homepage` و`home-bundle` — أي مسار موجز جديد يجب أن يستخدم نفس الترتيب وإلا لن يظهر المُنعش أولاً.
- **ملفي وخدماتي:** صفحة موحّدة `/dashboard/my-services` (`MyServicesPage`) تجمع
  `MyStaffProfileCard` + شهادة التعريف + `WriterMediaLicenseCard`. السايدبار
  (كاتب رأي / مراسل) والنظرة العامة تعرضان رابطاً مضغوطاً فقط
  (`MyServicesHomeLink`) بدل تكديس البطاقات. مسار ذاتي للملف:
  `GET/PUT /api/staff-profiles/me` (+ lookups ووثائق وnational-id).
  **تبويب الاعتماد الصحفي مخفي ذاتياً** (للإدارة فقط عبر
  `/dashboard/staff-profiles`). الترخيص المهني ليس شرطاً لاكتمال ملف المنسوب
  (الشهادة تسبق الترخيص). **مراجعة قبل شهادة التعريف:** اكتمال 100% →
  `pending_review` تلقائياً. HR يعتمد عبر `POST .../approve` أو يطلب تصحيحاً.
  الإصدار الذاتي للشهادة يتطلب `approved` فقط (تفاصيل في
  `official-letters/SYSTEM.md`).
- **رقم البطاقة الصحفية — نظام مركزي (منذ 2026-07-30):** الصيغة `SBQ-PR-0042`
  مشتقة من تسلسل الرقم الوظيفي `SBQ-0042` (رقم واحد للمنسوب في كل الأنظمة)،
  ويولّده `server/services/pressCardNumberService.ts` عبر
  `POST /api/staff-profiles/:userId/press-id-number` (صلاحية
  `staff_profiles.manage` **أو** `users.update` — لأن التوليد يجري من سطحين:
  ملف المنسوب وحوار تعديل المستخدم). زر «توليد» في `StaffProfileForm` وفي قسم
  البطاقة الصحفية بـ`EditUserDialog`؛ من لا ملف منسوب له يُنشأ له ملف مسودة
  ليأخذ رقماً وظيفياً أولاً. **الرقم دائم كرقم الهوية:** التوليد idempotent
  (رقم قائم يُعاد كما هو)، والحقل يُقفل بعد الإصدار، وبوابة
  `evaluatePressIdNumberChange` ترفض أي استبدال في `PATCH /api/admin/users/:id`
  و`PUT /api/staff-profiles/:userId`. إطفاء «تفعيل البطاقة الصحفية» يمسح
  المسمى/القسم/الصلاحية فقط ولا يمسح الرقم — إعادة التفعيل تعيد الرقم نفسه.
  الكتابة تُزامن `users.press_id_number` (جسر بطاقة Wallet) و
  `staff_profiles.press_id_number` معاً تحت قفل استشاري.
- **تجاوب نموذج ملف المنسوب (جوال):** تحت `md` لا شريط تبويبات ولا تمرير أفقي —
  قائمة `Select` للقسم + أزرار سابق/تالي + حفظ لاصق أسفل الشاشة (safe-area).
  من `md`: صفحة = تبويبات أفقية، حوار = سايدبار عمودي. حوار التعديل السريع
  ملء الشاشة على الجوال (`inset-0` / `100dvh`) ويصبح متمركزاً من `sm`.
  تلميحات الحقول مخفية على الجوال لتقليل الضوضاء.
- **Visual AI (`visualAiService.analyzeImage`):** الرد ثلاثي اللغة كان يُقطع عند `maxOutputTokens: 2048` فيفشل `JSON.parse` (`Failed to parse JSON response`). السقف 4096، والتحليل عبر `parseVisualAiJson` (أسوار markdown + إصلاح JSON مقطوع)، وفشل التحليل يعيد التوليد داخل `pRetry`.
- **إحصائيات المراسل (`GET /api/reporter/analytics`):** استعلام المقالات يُسقط الأعمدة الثقيلة — عشرة حقول فقط (لا `content`). السحب الكامل السابق كان يجرّ أرشيف المراسل بنصوصه في كل استدعاء بارد ويفشل بـ`DrizzleQueryError` (سجل 2026-07-27). عند إضافة حقل للاستجابة أضِفه للـselect صراحة.
- **حدود عملاء AI (منذ 2026-07-27):** عملاء OpenAI/Anthropic في `openai.ts` و`ai/contentAnalyzer.ts` بمهلة صريحة (120–150ث) و`maxRetries: 1` بدل افتراضي SDK (10 دقائق × 2) — التراكب مع withRetry المسار كان يجعل أسوأ حالة بالدقائق. مسار `edit-and-generate` يطبع مدة كل فرع (`finished in …ms`) لإسناد البطء.
- **اقترح عناوين ذكية (`POST /api/ai/compare-headlines`):** صلاحية `articles.ai_generate` عبر `requirePermission` — مثل `generate-titles`. لا تستخدم فحص أدوار نصية أو `articles:write` (كود صلاحية غير موجود وكان يسبب 403).
- **عدادات إدارة المقالات:** `GET /api/admin/articles/metrics` → `getArticlesMetrics` يستعلاماً واحداً بـ `count(*) FILTER` + كاش ذاكرة `admin:articles:metrics` لمدة `CACHE_TTL.SHORT` (بدل 4 COUNT متتالية كانت ~2.5s في APM).
- **نبض غرفة الأخبار (`GET /api/admin/dashboard/stats`):** عبر `adminDashboardStatsService.getCachedAdminDashboardStats` — SWR (طازج 5 دقائق / stale حتى 15 مع تحديث خلفي + single-flight). الـ warmup وتحديث كل 4 دقائق يعملان على **كل replica** (كاش الذاكرة per-process). `reading_history` يُجمَّع على آخر 7 أيام فقط؛ تفاعلات اليوم باستعلام منفصل بفلتر تاريخ. الموبايل `full-stats` يشارك نفس الكاش. KPI الجانبية (`deepAnalyses`, `audioNewsletters`, `publishers`, …) تُغلَّف بـ soft-fail داخل `getAdminDashboardStats` حتى لا يُسقط عمود ناقص في الإنتاج (مثل `deep_analyses.status`) المسار كاملاً.
- **ملف المراسل العام:** `getReporterProfile` v3 — آخر 5 مقالات فقط + تجميع يومي SQL للسلسلة (لا سحب كل مقالات 90 يوماً) + كاش `CACHE_TTL.MEDIUM` + single-flight + CDN `s-maxage=300`. أُسقط AVG(reading_history) من المسار الحار.
- **نظرة عامة لبوابة الناشر:** `getPortalOverview` خلف كاش دقيقة `publisher:portal:overview:{id}` مع إبطال عند الإرسال/النشر/الحذف.
- **محرّر الأخبار الإنجليزية:** الحفظ عبر `/api/en/dashboard/articles` (+ PATCH) بصلاحيات RBAC (`articles.create` / `edit_*`) — مثل الأوردو. المسار القديم `/api/en/articles` كان يرفض بـ `allowedLanguages.includes('en')` (الافتراضي `['ar']` فقط) فيظهر «لا توجد لديك صلاحيات للمحتوى الإنجليزي» حتى للأدمن.
- **لوحة مقالات EN (`/en/dashboard/articles`):** المنشورات تُرتَّب زمنياً `publishedAt DESC` (مثل `/api/en/articles` العامة) — **لا** تقدّم `displayOrder` وإلا تُدفن الترجمات الحديثة تحت مقالات قديمة أُعيد سحبها. المسودة/المجدول/الأرشيف بـ`updatedAt`/`scheduledAt`. المقاييس تشمل `scheduled`. فلاتر: `newsType=breaking|regular` و`translated=true|false`. الواجهة تعرض تاريخ النشر وشارة Translated. الترجمة تفضّل `englishSlug` العربي لنفس الرمز القصير، تطابق التصنيف عبر slug/`nameEn` (`enArticleTranslationService`)، وتنسخ `newsType`/`isFeatured`/`reporterId`/`imageFocalPoint`، وتُبطل كاش `sitemap-en-articles`. تبديل العاجل ثنائي الاتجاه (AR↔EN عبر `sourceArticleId`). Backfill: `tsx scripts/backfill-en-translation-meta.ts --apply`.

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] حدّثت `aiFeatureKeys` في السجل إن لزم
