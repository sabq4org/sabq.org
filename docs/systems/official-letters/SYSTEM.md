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
  طلبات المنسوبين، صفحة التحقق العامة.
- **خارج النطاق:** دورة مراجعة الترخيص المهني (`editorial`)، تذاكر الاستفسارات
  (تُستهلك كنقطة دخول فقط). ملف المنسوب يُستكمل ذاتياً عبر `/api/staff-profiles/me`
  ويُدار أيضاً من HR.

## نقاط الدخول
| الطبقة | المسار |
|--------|--------|
| Shared | `shared/officialLetters.ts` (الأنواع والقوالب والصياغة) |
| Schema | `official_letters`, `official_letter_requests` في `shared/schema.ts` |
| Backend | `server/services/officialLetterService.ts`, `server/services/officialLetterPdfService.ts`, `server/routes/officialLetters.ts` |
| Web (إدارة) | `client/src/pages/dashboard/OfficialLetters.tsx` → `/dashboard/official-letters` |
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
| `GET/POST /api/official-letters/requests*` | جلسة: الطلب الذاتي **يُصدر فوراً** عند اكتمال البيانات · `staff_profiles.manage` لمسار الاعتماد الإداري القديم إن وُجد |
| `GET /api/official-letters/my-readiness?letterType=` | جلسة — فحص ذاتي لنواقص بيانات الطالب |

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
- **الإصدار الذاتي:** عند اكتمال الحقول المهمة يُصدر `POST /requests` الشهادة
  فوراً (`requestSelfLetter`) ويظهر زر التنزيل. **لا شهادة ثانية** من نفس
  النوع ما دامت سارية (`status=issued`).
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

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] لم أغيّر صياغة الخطاب دون موافقة المالك (نص رسمي)
- [ ] حافظت على قاعدة حذف الحقول الناقصة
- [ ] لم أضف رقم الهوية إلى `snapshot` أو استجابات الواجهة
- [ ] أي مسار عام جديد مضاف إلى `noindexPaths.ts`
