# نظام التحرير وغرف الأخبار (`editorial`)

> آخر مراجعة: 2026-07-20 (بانر موعد الكاتب بلا تواريخ ماضية) | المالك: editorial

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

## عقود مهمة
- أي أداة AI جديدة من المحرر → أضف `featureKey` هنا وفي `defaults.ts`، ولا تكرره بنظام آخر.
- جزء كبير من الاستدعاءات القديمة ما زال يُحسب تحت `legacy-ai-manager` في `ai-hub` حتى تُهاجر.
- **فجوات v2** (`RADAR_GAP_V2_ENABLED`): وحدة الفجوة = `radar_stories` لا المادة المنفردة؛ تتطلب صلة ≥ `RADAR_GAP_MIN_RELEVANCE` وزخم ≥ `RADAR_GAP_MIN_MOMENTUM` (أو تعدد مصادر). أعمدة additive: `story_id`, `relevance_score`, `momentum_score`, `gap_reason`. لا تُفعَّل قبل ثبات تجميع القصص أسبوعاً. المستبعد يدوياً لا يُمس؛ التنظيف النظامي يستخدم `dismissReason=auto-irrelevant`.
- **عرض الداشبورد (2026-07-19):** قسم «فجوات التغطية الآن» في `NewsroomPulseDashboard` مخفي عن كل الأدوار. المكوّن `CoverageGapsSection` ومسارات `/api/admin/coverage-gaps*` تبقى في الكود لإعادة التفعيل لاحقاً.
- **الموجز في صفحة المقال:** حقل المحرر `excerpt` عند الحفظ يزامن `aiSummary` ويمسح `aiBullets`. تفريغ الملخص يخفي الصندوق (لا إعادة توليد من نص المقال). الواجهة لا تكرر الفقرة تحت النقاط إن كانا نفس النص.
- **أسلوب الصور المولّدة:** مفتاح `auto_image_generation_settings` يحتوي `newsStyle` (أخبار/تحليل) و`articleStyle` (رأي/عمود). `defaultStyle` يبقى متزامناً مع `newsStyle` للتوافق. الاختيار عبر `resolveStyleForArticleType` في `autoImageGenerationService`. كتّاب الرأي لا يرون ألبوم الصور ولا المرفقات في `ArticleEditor`.
- **KPI كتّاب الرأي** (`OpinionWritersPage`): تُحسب من قائمة `/api/admin/opinion-writers` في الواجهة — منها «اختاروا يوم النشر» (`schedule.active`) و«بلا نشاط أكثر من شهرين» (لا `lastArticle` أو أقدم من ٦٠ يوماً).
- **سعة يوم النشر:** حد ثابت `OPINION_WRITERS_PER_DAY_CAP = 10` في `shared/opinionWriterConstants.ts`. عند الامتلاء تظهر «غير متاح للنشر» في لوحة الكتّاب ومنتقي الكاتب، ويُرفض التعيين الذاتي والإداري ليوم ممتلئ (إلا تحديث نفس اليوم). العرض: «X من 10 كتّاب» (لا `X/10` حتى لا يُقرأ كتاريخ).
- **التزام كتّاب الرأي:** `hasUpcoming` / `pendingCount` يعتبران المقال مُرسلاً إن `reviewStatus=pending_review` أو مسودة موبايل (`source` ios-app/android-app و`reviewStatus` فارغ). إرسال `/api/v1/articles/submit` يضبط `pending_review` من البداية.
- **بانر موعد الكاتب:** `submitDeadline = nextPublishAt − يومان`. التذكير (`reminder`/`due_soon`) فقط والمهلة ما زالت في المستقبل؛ بعد فواتها → `late` بنص «فات آخر موعد للإرسال» دون عرض تاريخ ماضٍ. لا تربط التذكير بـ«خلال يومين من النشر» لأنها تتزامن مع انتهاء المهلة فتظهر رسالة محرجة.
- **محرّر الإدخال ≠ كاتب الرأي:** لمقالات الرأي `authorId` = الكاتب الظاهر للقارئ، و`submitterId` = من أدخل المادة في المحرر. بانر المحرر يعتمد على `enteredBy` من `submitterId` فقط (لا يخلط الكاتب بالمحرر).
- **استهداف الإعلانات الداخلية:** قيم `audienceRoles` هي أسماء الأدوار القانونية من `roles.name` وليست معرّفات الأدوار. `null` أو المصفوفة الفارغة للأدوار والمستخدمين تعني «الجميع». عند وجود استهداف، المطابقة باسم الدور مطابقة تامة، والمستخدم المحدد صراحةً يُقبل بالإضافة إلى الدور (OR). قائمة الاختيار تأتي من `GET /api/announcements/roles` ولا تُثبت في الواجهة.
- **قنوات الإعلانات الداخلية:** المستقبل الفعلي الحالي هو `dashboardBanner`. قيمتا `inbox` و`toast` محجوزتان في العقد لكن اختيارُهما معطل في المحرر حتى يُربط لكل منهما مستقبل عرض/تسليم مستقل؛ لا تعرضهما كبانر بديل.
- **عرض بانر الإعلان (`InternalAnnouncement`):** بطاقة قابلة للطي مع أيقونة وشريط أولوية ومعاينة سطرين عند الطي. نص الرسالة يُعرض بمحاذاة البداية (يتجاوز توسيط HTML الملصوق من البريد). استخدم حقل زر الإجراء للروابط بدل لصق URL خام داخل النص.
- **ترخيص كاتب الرأي على الحساب:** أعمدة `users.media_license_*`؛ المسارات `GET/POST /api/opinion-author/media-license` (رفع الملف عبر R2/S3 الخاص). البطاقة في `WriterMediaLicenseCard` على مساحة الكاتب؛ المهلة `2026-07-31` مع عدّاد تنازلي (يوم/ساعة/دقيقة/ثانية) حتى نهاية يوم الرياض. بعد الإرسال تظهر رسالة شكر وتُخفى الاستمارة. بطاقة الهوية في سايدبار الداشبورد (`DashboardLayout`) تعرض ختم «مرخّص» عند `submitted`، والإيميل بمحاذاة الاسم (لا `dir=ltr` على الحاوية).
- **إدارة الترخيص من صفحة الكتّاب:** `/dashboard/opinion-writers` تعرض حالة الترخيص لكل كاتب (مرخّص / لم يُرسل) مع فلترة وبحث وزر «عرض الملف» عبر `GET /api/admin/opinion-writers/:writerId/media-license-file`.
- **سايدبار محرّر المقال:** بدون `sticky`/`max-h` على عمود الإعدادات — التمرير يتم مع صفحة الداشبورد حتى يُصل لآخر حقول SEO والكلمات المفتاحية (كان sticky يقصّ الأسفل داخل `overflow-auto` للداشبورد).
- **إنعاش الخبر:** `POST /api/articles/:id/resurface` يختم `articles.resurfaced_at` فقط (لا يغيّر `publishedAt`/المشاهدات/الرابط). صدارة الواجهة تعتمد `COALESCE(resurfaced_at, published_at)` في `homepage-lite` و`/api/v1/homepage` و`home-bundle` — أي مسار موجز جديد يجب أن يستخدم نفس الترتيب وإلا لن يظهر المُنعش أولاً.

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] حدّثت `aiFeatureKeys` في السجل إن لزم
