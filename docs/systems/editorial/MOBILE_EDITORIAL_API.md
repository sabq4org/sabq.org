# لوحة المراسل والمشرف في تطبيق «سبق» — `/api/v1/editorial/*`

منذ 2026-10-31. قرار المالك: «مكتب سبق» (`sabq desk ios/`) للإشعارات واستعراض الخبر وتعديله وجدولته فقط، ولوحة المراسل والمشرف تعيش في تطبيق القارئ «سبق» (`sabq app ios/`) متزامنة مع الويب.

## المصادقة

- جلسة العضو في التطبيق: `Authorization: Bearer <token>` (`verifyMemberBearer`). رموز `botpub_*` تُرفض بـ 401.
- **المصادقة الثنائية اختيارية** (منذ 2026-10-31، لكل الأدوار مثل الويب). `/me` يعيد `twoFactorEnabled` الفعلي. التطبيقات القديمة ما زالت تفهم `403 two_factor_required` لكن السيرفر لم يعد يرسلها. وكذلك «مكتب سبق» (`/api/v1/staff`).
- RBAC حي لكل طلب (`resolveStaffCapabilitiesAndRoles`): `canReport` للمراسل، `canNews` (= `articles.publish`) للمشرف.
- كل الاستجابات `Cache-Control: private, no-store`. CSRF لا ينطبق على `/api/v1/`.
- الكتابة: 30 طلبًا/10 دقائق لكل عضو (`MOBILE_EDITORIAL_WRITE_LIMIT`).
- التدقيق في `activity_logs` بـ `metadata.channel = "mobile-editorial"` والأفعال `mobile_editorial.*`.

## المسارات

| المسار | من | الوصف |
|---|---|---|
| `GET /me` | أي منسوب | `{ userId, name, canReport, canNews, twoFactorEnabled }` |
| `GET /my-news?filter=all\|pending\|needs_changes\|scheduled\|published\|draft` | المراسل | `{ counts, editRequestsReady, items[] }`. أخبار المستخدم (مؤلف أو مراسل أو مُرسِل، بلا الرأي) المحدَّثة خلال 120 يومًا، حتى 100. المُعاد له أولًا. الحالات كما في `/dashboard/reporter/articles` (`myNewsStatus` في `shared/mobileEditorial.ts`). كل عنصر يحمل `stateLabel` (من القاموس الموحّد) و`pendingEditRequest` و`lastEditRequest` (`outcome` pending/approved/rejected، `label`، `urgent`، `decisionNote` للمرفوض، `decidedAt`؛ الملغى لا يظهر) و`canRequestEdit` و`url` للمنشور |
| `GET /performance?period=7\|30\|all` | المراسل أو كاتب الرأي | «أداء أخباري»/«أدائي» في طلب واحد (`ContributorPerformance` في `shared/contributorPerformance.ts`): المشاهدات وتغيرها عن الفترة السابقة، وسلسلة يومية، والتفاعل، وأكثر 5 مواد قراءة، وعدادات الحالات، والنشاط، والترتيب الشهري بين أصحاب الأخبار (كاش 5 دقائق مشترك)، وتعليق القرّاء. الاستعلامات متوازية في `contributorPerformanceService.ts`، وكاش دقيقة لكل مستخدم وفترة |
| `GET /edit-requests/context/:articleId` | المراسل أو كاتب الرأي (منذ 2026-10-31) | المادة وفقراتها القابلة للتعديل وطلبه المفتوح (خدمة الويب `getEditRequestContext`) |
| `POST /edit-requests` | المراسل أو كاتب الرأي | `{ articleId, urgent, note, proposed: { title?, contentEdits?[{before,after}], appendParagraph?, imageUrl?, albumAdd?[] } }` → 201. الصور تُرفع قبلها عبر `POST /api/v1/articles/images` |
| `POST /edit-requests/:id/cancel` | المراسل أو كاتب الرأي | إلغاء طلبه المفتوح |

> **قرار الطلب في «إشعاراتي التحريرية» (2026-10-31):** الاعتماد أو الرفض يظهر أيضًا في `GET /api/v1/notifications` بنوع `edit_request_approved` أو `edit_request_rejected` (السبب في `reviewerNote`)، ورابط `sabq://article/<slug>?editRequest=<id>` أو `sabq://draft/<articleId>?editRequest=<id>`، مع دفع APNs بنوع `editorial.edit_request_*` حسب تفضيل `revisionEnabled`. أشكال الاستجابة لم تتغير، والطلب الثاني المتزامن يرجع `409 EDIT_REQUEST_PENDING` كالمعتاد. التطبيق يعرض النوعين الجديدين بالأيقونة الافتراضية إلى أن يُضافا إلى `EditorialNotificationsView`.
| `GET /news`, `/news/categories`, `/news/:id`, `POST /news/:id/publish\|schedule\|return`, `GET /news/edit-requests/:id`, `POST …/approve\|reject` | المشرف (`articles.publish`) | نفس مسارات «الأخبار» في «مكتب سبق» حرفيًا (`registerStaffNewsRoutes` في `server/routes/staffNewsDesk.ts`)، الشكل في [`STAFF_APP_API.md`](./STAFF_APP_API.md) |

## التطبيق (iOS)

- العميل والنماذج: `sabq app ios/sabq/Services/EditorialService.swift` (`EditorialAPI`، يحفظ رمز الخطأ `code`).
- الشاشات: `ReporterNewsView` («أخباري»)، `PerformanceView` («أداء أخباري» و«أدائي»، تفتح بآخر نسخة محفوظة ثم تتحدث)، و«طلب تعديل» على المقال المنشور في `WriterWorkspaceView`، `EditRequestComposeView`، `SupervisorNewsView` + `SupervisorNewsPreviewView`، `EditRequestReviewView`، وعناصر مشتركة في `EditorialComponents.swift`.
- المداخل في الإعدادات ← «الأدوات التحريرية والإدارة»: «بانتظار قرارك» (أدوار التحرير) و«أخباري» (المراسل).
- إرسال خبر جديد (`ArticleSubmissionView`) يرفع كل صورة وحدها أولًا (`POST /articles/images`) مع عدّاد «رفع الصور 2 من 4»، ثم يرسل الروابط؛ الصورة التي يتعذر رفعها تُرسل base64 كما كان.

## غير مشمول بعد

- تعليق لكل صورة، والتصنيف و«عاجل» عند الإرسال من الجوال: تحتاج تغيير `/articles/submit` في `mobileApiRoutes.ts` (فوق سقف الأسطر) فتُنقل لوحدة مستقلة أولًا.

## القاموس الموحّد للحالات (2026-10-31)

كلمات الحالات والأزرار وملصق طلب التعديل في `shared/editorialStates.ts`، ونسختها الحرفية في iOS `sabq app ios/sabq/Services/EditorialStates.swift`. يقرؤها الويب (`/dashboard/reporter/articles`، مساحة الكاتب) والسيرفر (`stateLabel` هنا) وتطبيق «سبق». الاختبار `tests/unit/editorialStates.test.ts` يفشل إن اختلف نص في Swift عن الويب. لا تكتب اسم حالة جديدًا في شاشة؛ أضفه للقاموس.
