# الخطابات الرسمية (`official-letters`)

> آخر مراجعة: 2026-07-26 | المالك: platform

## الغرض
إصدار شهادات رسمية من صحيفة سبق للمنسوبين (كتّاب رأي، مراسلون، موظفون): شهادة
تعريف لاستكمال الترخيص الإعلامي، شهادة تسهيل مهمة، وشهادة تعريف عام — بصيغة PDF
عربية مرقّمة ومختومة وقابلة للتحقق العام. عنوان المستند المعتمد: **شهادة تعريف**.

**الدافع:** مهلة هيئة الإعلام (`2026-07-31`) تُلزم كل كاتب ومراسل بترخيص، والهيئة
تطلب شهادة تعريف من الصحيفة ضمن مستندات التقديم.

## الحدود
- **داخل النطاق:** قوالب الخطابات، توليد PDF، الترقيم المرجعي، سجل الإصدار،
  طلبات المنسوبين، صفحة التحقق العامة، وبوابة الإصدار بعد **اعتماد ملف المنسوب**.
- **خارج النطاق:** دورة مراجعة الترخيص المهني (`editorial`)، تذاكر الاستفسارات
  (تُستهلك كنقطة دخول فقط). استكمال/اعتماد ملف المنسوب يُدار عبر `staff-profiles`
  (ذاتي + HR) — انظر `editorial/SYSTEM.md`.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Shared | `shared/officialLetters.ts` (الأنواع والقوالب والصياغة) |
| Schema | `official_letters`, `official_letter_requests` في `shared/schema.ts` |
| Backend | `server/services/officialLetterService.ts`, `server/services/officialLetterPdfService.ts`, `server/routes/officialLetters.ts` |
| Web (إدارة خطابات) | `OfficialLetters.tsx` → `/dashboard/official-letters` |
| Web (إدارة ملف) | `StaffProfilesDirectory` → `/dashboard/staff-profiles` (يفتح طابور «قيد المراجعة» افتراضياً) + اعتماد من `StaffProfilePage` |
| Web (منسوب) | `client/src/components/officialLetters/MyOfficialLettersCard.tsx` في مساحة الكاتب وصفحة المراسل |
| Web (تذكرة) | `client/src/components/officialLetters/IssueLetterFromTicketDialog.tsx` داخل `TicketThread` |
| Web (عام) | `client/src/pages/VerifyLetter.tsx` → `/verify/:code` |

## العقود
| Endpoint | الصلاحية |
|----------|----------|
| `GET /api/official-letters/verify/:code` | **عام** بلا مصادقة (30 طلب/دقيقة) |
| `GET /api/official-letters` | `staff_profiles.view` |
| `GET /api/official-letters/subjects/:userId` | `staff_profiles.manage` |
| `POST /api/official-letters` | `staff_profiles.manage` |
| `GET /api/official-letters/:id/file.pdf` | `staff_profiles.view` أو صاحب الخطاب |
| `POST /api/official-letters/:id/revoke` | `staff_profiles.manage` |
| `GET/POST /api/official-letters/requests*` | جلسة: الإصدار الذاتي يتطلب `profileReviewStatus=approved` + اكتمال الحقول المهمة · `staff_profiles.manage` لمسار الإدارة |
| `GET /api/official-letters/my-readiness?letterType=` | جلسة — نواقص البيانات + حالة مراجعة الملف |

## عقود مهمة / Gotchas
- **PDF عبر Puppeteer + HTML RTL فقط.** لا تستخدم pdfmake/pdfkit للنص العربي —
  يقلب الحروف. راجع `.cursor/rules/pr-client-report-design.mdc`.
- **الحقول الناقصة تُحذف صفوفها** (قرار المالك): لا يُطبع «غير متوفر» ولا فراغ.
  الواجهة تنبّه المُصدِر بالنواقص قبل الإصدار عبر `gaps`.
- **الخطاب وثيقة ثابتة.** يُرفع PDF إلى التخزين الخاص (`.private/official-letters/`)
  ويُحفظ `fileKey`. أي تعديل لاحق على ملف المنسوب لا يغيّر خطاباً صادراً.
  عند غياب التخزين يُعاد التوليد من البيانات الحالية (تطوير محلي فقط).
- **رقم الهوية لا يُحفظ في `snapshot`** ولا يعود للواجهة — يبقى داخل ملف PDF في
  التخزين الخاص. كشفه للطباعة يتطلب `staff_documents.view`.
- **صفحة التحقق** تعرض الاسم والصفة والحالة فقط — بلا هوية أو تواصل، و`/verify`
  ضمن `NOINDEX_PREFIXES`.
- **الترقيم** تسلسلي سنوي `SBQ-YYYY-NNNN` يُحسب بعدّ خطابات السنة. عند تزامن
  إصدارين نادراً قد يتصادم القيد الفريد — أعد المحاولة.
- **صياغة الشهادة:** العنوان «شهادة تعريف» ثم مباشرة «تشهد صحيفة سبق
  الإلكترونية بأن:» — بلا مخاطبة جهة.
- **نواقص البيانات:** المنسوب يستكمل ملفه ذاتياً (`/api/staff-profiles/me` +
  `MyStaffProfileCard`). نص الإرشاد: `LETTER_GAPS_STAFF_HINT_AR`.
  **الترخيص المهني ليس شرطاً** لاكتمال الملف ولا لإصدار شهادة التعريف (كثيرون
  يطلبون الشهادة للتقديم على الترخيص — دورة الترخيص منفصلة في `editorial`).
- **مراجعة الإدارة قبل الإصدار:** اكتمال 100% (عند الحفظ أو عند قراءة الملف
  أو عند فتح دليل الإدارة) يضع الحالة تلقائياً في `pending_review` — **لا يوجد
  زر إرسال**. مكان المراجعة للإدارة:
  `/dashboard/staff-profiles` (السايدبار: «مراجعة ملفات المنسوبين» تحت
  المستخدمون والأدوار) — يفتح طابور قيد المراجعة افتراضياً؛ افتح الملف ثم
  «اعتماد الملف» أو «طلب تصحيح». رابط سريع أيضاً من صفحة الخطابات الرسمية.
  بعدها فقط `requestSelfLetter`. أثناء `pending_review` التعديل الذاتي مقفل
  (واجهة + API). طلب تصحيح يعيد فتح الحقول. أي حفظ ذاتي بعد الاعتماد يعيد
  `pending_review`. **لا شهادة ثانية** لنفس النوع الساري.
- **الشعار:** `public/branding/sabq-logo-official.png` (من ملف هوية Illustrator
  `SABQ logo.pdf` — خلفية شفافة). الاحتياطي: `sabq-logo.png` ثم
  `sabq-logo-report.png`. لا تستبدل `sabq-logo.png` (خلفية سوداء للوحة التحكم).
- **الختم:** `public/branding/sabq-stamp.png` (ختم المؤسسة الدائري).
- **ما زال ناقصاً:** `public/branding/sabq-signature.png` (التوقيع). القالب يعمل
  بدونه ويطبع سطر توقيع فارغ — أضفه قبل الإصدار للجهات إن لزم.

## صحة وتشغيل
- Chromium في الإنتاج عبر `PUPPETEER_EXECUTABLE_PATH` / `/usr/bin/sabq-chromium`.
- الخطوط: `server/fonts/IBMPlexSansArabic-*.ttf` مضمّنة base64 في HTML.
- التخزين الخاص: R2/S3 عبر `ObjectStorageService.uploadPrivateDocument`.
- لا استهلاك AI.
- أعمدة المراجعة على `staff_profiles`: انظر
  `scripts/sql/add-staff-profile-review-2026-07-26.sql`.

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] لم أغيّر صياغة الخطاب دون موافقة المالك (نص رسمي)
- [ ] حافظت على قاعدة حذف الحقول الناقصة
- [ ] لم أضف رقم الهوية إلى `snapshot` أو استجابات الواجهة
- [ ] أي مسار عام جديد مضاف إلى `noindexPaths.ts`
- [ ] حافظت على بوابة `profileReviewStatus=approved` قبل الإصدار الذاتي
