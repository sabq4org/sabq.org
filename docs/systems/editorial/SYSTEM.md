# نظام التحرير وغرف الأخبار (`editorial`)

> آخر مراجعة: 2026-07-19 | المالك: editorial

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
- **التزام كتّاب الرأي:** `hasUpcoming` / `pendingCount` يعتبران المقال مُرسلاً إن `reviewStatus=pending_review` أو مسودة موبايل (`source` ios-app/android-app و`reviewStatus` فارغ). إرسال `/api/v1/articles/submit` يضبط `pending_review` من البداية.
- **محرّر الإدخال ≠ كاتب الرأي:** لمقالات الرأي `authorId` = الكاتب الظاهر للقارئ، و`submitterId` = من أدخل المادة في المحرر. بانر المحرر يعتمد على `enteredBy` من `submitterId` فقط (لا يخلط الكاتب بالمحرر).
- **استهداف الإعلانات الداخلية:** قيم `audienceRoles` هي أسماء الأدوار القانونية من `roles.name` وليست معرّفات الأدوار. `null` أو المصفوفة الفارغة للأدوار والمستخدمين تعني «الجميع». عند وجود استهداف، المطابقة باسم الدور مطابقة تامة، والمستخدم المحدد صراحةً يُقبل بالإضافة إلى الدور (OR). قائمة الاختيار تأتي من `GET /api/announcements/roles` ولا تُثبت في الواجهة.
- **قنوات الإعلانات الداخلية:** المستقبل الفعلي الحالي هو `dashboardBanner`. قيمتا `inbox` و`toast` محجوزتان في العقد لكن اختيارُهما معطل في المحرر حتى يُربط لكل منهما مستقبل عرض/تسليم مستقل؛ لا تعرضهما كبانر بديل.

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] حدّثت `aiFeatureKeys` في السجل إن لزم
