# Sabq Desk Staff Mobile API — واجهة تطبيق الديسك للمنسوبين (`/api/v1/staff/*`)

> آخر مراجعة: 2026-10-25 | المالك: editorial + social-publishing + auth-rbac + push-notifications | الحزمة: `com.sabq.desk` | الحالة: نشط، بلا ترحيل قاعدة بيانات (No Migration).

## الملخص

توفّر طبقة `/api/v1/staff/*` الواجهة البرمجية الخلفية لتطبيق iOS المستقل للمنسوبين **«Sabq Desk»** (`com.sabq.desk`) لإدارة:
1. **الهوية والقدرات الحية (`GET /me`):** بيانات حساب الموظف الأساسية، أدواره، ومصفوفة صلاحياته الحية للتذاكر والنشر الاجتماعي.
2. **الصندوق الموحد (`GET /inbox`) والعدادات (`GET /unread-counts`):** دمج استفسارات المساهمين (التذاكر) ومقترحات النشر الاجتماعي (كتّاب الرأي والوكالات) في تدفق زمني واحد مرتب من الأحدث إلى الأقدم مع ترقيم بمؤشر معتم (Opaque Cursor Pagination).
3. **استفسارات المساهمين (`Tickets`):** قراءة سلسلة رسائل التذكرة، الرد باسم المنسوب مع نقل الحالة من `open` إلى `answered`، وتحديث حالة التذكرة (`open | answered | closed`).
4. **مقترحات النشر الاجتماعي على X (`Social`):** معاينة التغريدة المقترحة والكاتب/الوكالة وسجل المحاولات، والنشر الفوري (`publish`) أو الجدولة (`schedule`) أو الرفض (`reject` مع ملاحظة اختيارية).
5. **إشعارات الدفع الفوري الموجهة لتطبيق الديسك (`com.sabq.desk`):** إرسال إشعارات APNs/FCM عبر `sendPushToUserApp(userId, 'com.sabq.desk', ...)` مع روابط عميقة `sabqdesk://ticket/<id>` و`sabqdesk://social/<id>` عند وصول تذكرة/رسالة جديدة أو مقترح نشر اجتماعي من كاتب رأي أو وكالة، مع عزل تام لإشعارات تطبيق القارئ (`com.sabq.sabqorg`).

---

## 1) المصادقة وبوابة 2FA ونموذج الصلاحيات (Auth, 2FA & RBAC)

### أ) المصادقة بجلسة العضو (`Bearer`)
تعتمد جميع مسارات `/api/v1/staff/*` حصرياً على جلسة العضو الشخصية (`verifyMemberBearer` في `server/services/memberSessionService.ts`) الصادرة من:
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/verify-2fa`

```http
Authorization: Bearer <member_session_token>
X-Installation-Id: <ios_idfv_uuid>
Content-Type: application/json
```

- **رفض توكنات البوت (`botpub_*`):** لا يُسمح إطلاقاً باستخدام توكنات `botpub_*` على مسارات `/api/v1/staff/*`؛ أي طلب يحمل توكن `botpub_*` يُرفض فوراً بـ `401 Unauthorized` (`code: "unauthorized"`).
- **عدم التخزين المؤقت:** ترسل جميع مسارات `/api/v1/staff/*` الترويسة `Cache-Control: private, no-store`.

### ب) بوابة المصادقة الثنائية الإلزامية (Mandatory 2FA Gate)
يشترط تطبيق الديسك تفعيل المصادقة الثنائية (`users.twoFactorEnabled === true`) على حساب الموظف. إذا كان الحساب لا يملك 2FA مفعلاً، ترد جميع مسارات `/api/v1/staff/*` بـ:

```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "code": "two_factor_required",
  "message": "يلزم تفعيل المصادقة الثنائية (2FA) للوصول إلى تطبيق الديسك"
}
```

### ج) الصلاحيات الحية لكل طلب (Live RBAC per Request)
يُبطل الخادم كاش الصلاحيات المحلي ويعيد تقييم صلاحيات المستخدم الفعلية في كل طلب:

| المجال | المسارات | قاعدة الصلاحية (مطابقة للويب وBot Desk) |
|--------|----------|-----------------------------------------|
| **الهوية** | `GET /api/v1/staff/me` | جلسة عضو صالحة + 2FA مفعل (يعيد مصفوفة `capabilities`) |
| **الصندوق والعدادات** | `GET /api/v1/staff/inbox`، `GET /api/v1/staff/unread-counts` | `canTickets` (عند `type=ticket`) أو `social_publish.view_log` (عند `type=social`) أو أحدهما على الأقل (عند `type=all`) |
| **التذاكر** | `GET /tickets/:id`، `POST /tickets/:id/reply`، `PATCH /tickets/:id/status` | `canUserViewOpinionDesk` / `isOpinionDeskViewer` (المحررون `editor` والمسؤولون `SUPERUSER_ROLE_NAMES`) |
| **عرض المقترح الاجتماعي** | `GET /social/:id` | `social_publish.view_log` |
| **نشر المقترح فوراً** | `POST /social/:id/publish` | `social_publish.publish_now` |
| **جدولة المقترح** | `POST /social/:id/schedule` | `social_publish.schedule` |
| **رفض المقترح** | `POST /social/:id/reject` | `social_publish.manage_scheduled` **أو** `social_publish.create` |

### د) سجل التدقيق (`activity_logs`) ومحددات المعدل
- **التدقيق:** تُسجَّل كل عملية كتابة (`ticket_reply`, `ticket_status_update`, `social_post_publish`, `social_post_schedule`, `social_post_reject`) في جدول `activity_logs` مع:
  - `metadata.channel = "staff-app"`
  - `metadata.userId` = معرّف المستخدم
  - `metadata.installationId` = قيمة الترويسة `X-Installation-Id` (إن أُرسلت من التطبيق)
- **محدد المعدل (Rate Limit):** عمليات النشر الاجتماعي (`publish` / `schedule` / `reject`) محددة بـ **20 عملية لكل 5 دقائق لكل مستخدم** (`429 { code: "rate_limited", message: "..." }`).

---

## 2) المسارات (Endpoints)

### 1. `GET /api/v1/staff/me`
يعيد البيانات الأساسية للموظف، قائمة أدواره، ومصفوفة القدرات:

```json
{
  "id": "user-uuid",
  "email": "editor@sabq.org",
  "name": "ماجد العتيبي",
  "firstName": "ماجد",
  "lastName": "العتيبي",
  "profileImageUrl": "https://media.sabq.org/avatars/editor.webp",
  "role": "editor",
  "twoFactorEnabled": true,
  "user": {
    "id": "user-uuid",
    "email": "editor@sabq.org",
    "name": "ماجد العتيبي",
    "firstName": "ماجد",
    "lastName": "العتيبي",
    "profileImageUrl": "https://media.sabq.org/avatars/editor.webp",
    "role": "editor",
    "twoFactorEnabled": true
  },
  "roles": ["editor"],
  "capabilities": {
    "canTickets": true,
    "canSocial": {
      "view": true,
      "publish": true,
      "schedule": true,
      "reject": true
    }
  }
}
```

### 2. `GET /api/v1/staff/inbox`
يعيد قائمة موحدة من التذاكر ومقترحات النشر الاجتماعي مرتبة من الأحدث إلى الأقدم (`updatedAt DESC`).

مقترحات النشر المعروضة: `draft | scheduled | processing` دائماً، و`published | failed` لآخر 24 ساعة؛ المرفوض (`canceled`) لا يظهر. استثناء السجل (2026-10-25): إذا طُلب `status=published` أو `status=canceled` (أو قائمة منهما فقط) يُعاد السجل كاملاً (أحدث 200 مقترح) لتبويبَي «منشور» و«مرفوض» في التطبيق. عناصر `canceled`/`failed` تحمل `lastError` (سبب الرفض أو آخر خطأ نشر)، وهو `null` لغيرها. عناصر النشر تحمل `scheduledAt` و`publishedAt` (ISO أو `null`). `hasUnread` وعدّاد `social` في `/unread-counts` للمسودات (`draft`) فقط.

**معاملات الاستعلام (Query Parameters):**
- `type`: `all | ticket | social` (افتراضي `all`)
- `status`: فلتر اختياري بالحالة (`open | answered | closed | draft | scheduled | processing | published | failed | canceled`)، أو قائمة مفصولة بفواصل مثل `draft,processing,failed` (تبويب «بانتظارك»)
- `unread`: فلتر اختياري بغير المقروء (`true | false | 1 | 0`)
- `q`: بحث نصي اختياري في العنوان/المعاينة/اسم المرسل
- `cursor`: مؤشر معتم (`opaque base64url cursor`) للصفحة التالية
- `limit`: عدد العناصر في الصفحة (`1..50`، افتراضي `20`؛ أي قيمة `> 50` تُرفض بـ `400 validation_error`)

**نموذج الاستجابة:**
```json
{
  "items": [
    {
      "id": "social-post-uuid",
      "kind": "social",
      "title": "انطلاق المؤتمر التقني بالرياض",
      "previewText": "تغريدة وكالة الأنباء حول المؤتمر التقني",
      "preview": "تغريدة وكالة الأنباء حول المؤتمر التقني",
      "sender": {
        "id": "pub-uuid",
        "name": "وكالة الأفق",
        "kind": "agency",
        "roleKind": "agency"
      },
      "createdAt": "2026-10-24T13:00:00.000Z",
      "updatedAt": "2026-10-24T15:00:00.000Z",
      "status": "draft",
      "hasUnread": true,
      "deeplink": "sabqdesk://social/social-post-uuid",
      "scheduledAt": null,
      "publishedAt": null,
      "article": {
        "id": "art-uuid",
        "title": "انطلاق المؤتمر التقني بالرياض",
        "url": "https://sabq.org/article/tech-conf",
        "imageUrl": null
      }
    },
    {
      "id": "ticket-uuid",
      "kind": "ticket",
      "title": "استفسار عن موعد المقال",
      "previewText": "هل ينشر مقالي غداً؟",
      "preview": "هل ينشر مقالي غداً؟",
      "sender": {
        "id": "writer-uuid",
        "name": "د. خالد العتيبي",
        "kind": "writer",
        "roleKind": "opinion_author"
      },
      "createdAt": "2026-10-24T10:00:00.000Z",
      "updatedAt": "2026-10-24T14:00:00.000Z",
      "status": "open",
      "hasUnread": true,
      "deeplink": "sabqdesk://ticket/ticket-uuid"
    }
  ],
  "nextCursor": "eyJ0IjoiMjAyNi0xMC0yNFQxNDowMDowMC4wMDBaIiwia2luZCI6InRpY2tldCIsImlkIjoidGlja2V0LXV1aWQifQ",
  "hasMore": false
}
```
> ملاحظة: حقل `sender.kind` يأخذ إحدى القيم الثلاث الموحدة: `"writer" | "reporter" | "agency"`.

### 3. `GET /api/v1/staff/unread-counts`
يعيد أعداد العناصر غير المقروءة/المعلقة حسب صلاحيات الموظف:
```json
{
  "tickets": 3,
  "social": 2,
  "total": 5
}
```

### 4. مسارات التذاكر (`Tickets`)
- **`GET /api/v1/staff/tickets/:id`**
  يعيد تفاصيل التذكرة وكامل رسائل المحادثة مرتبة زمنياً، ويحدّث `lastReadByAdminAt`.
- **`POST /api/v1/staff/tickets/:id/reply`**
  الجسم: `{ "message": "نص الرد", "parentMessageId"?: "msg-id" }`.
  ينشر الرد باسم الموظف (`senderRole = "admin"`) وينقل التذكرة من `open` إلى `answered`، ويرفض التذكرة المغلقة بـ `400 { code: "ticket_closed" }`.
- **`PATCH /api/v1/staff/tickets/:id/status`**
  الجسم: `{ "status": "open" | "answered" | "closed" }`.

### 5. مسارات النشر الاجتماعي (`Social`)
- **`GET /api/v1/staff/social/:id`**
  يعيد `{ post, preview, author, agency, article, sender, attempts, deeplink }`.
- **`POST /api/v1/staff/social/:id/publish`**
  الجسم: `{}` (فارغ). يطالب بالمنشور ذرياً (`claimPostForImmediatePublish`) وينشره عبر `publishClaimedPost`. يعيد `409 conflict` إذا كان المنشور قيد النشر أو منشوراً مسبقاً.
- **`POST /api/v1/staff/social/:id/schedule`**
  الجسم: `{ "scheduledAt": "2026-10-25T19:30:00+03:00" }` (صيغة ISO-8601 مع المنطقة الزمنية؛ يرفض الأوقات في الماضي بـ `400 validation_error`).
- **`POST /api/v1/staff/social/:id/reject`**
  الجسم: `{ "reason"?: "سبب الرفض الاختياري" }`. يلغي المقترح (`status = "canceled"`) عبر `cancelPost` ويشعر الكاتب أو الوكالة.
- **`POST /api/v1/staff/social/:id/return-to-draft`**
  الجسم: `{}` (فارغ). يعيد المقترح إلى «بانتظار القرار» (`draft`) عبر `returnPostToDraft`: من `scheduled` (إلغاء الجدولة، يحتاج `canSocial.schedule`) أو من `canceled` (التراجع عن الرفض، يحتاج `canSocial.reject`). يمسح `scheduledAt` و`lastError` و`canceledByUserId` ويصفّر `attempts`. أي حالة أخرى ترد `409 conflict` دون لمس الصف. يُسجَّل في التدقيق بـ `social_post_return_to_draft`. لا يرسل إشعاراً لصاحب المقترح.

---

## 3) صيغة الأخطاء الموحدة (Error Format)

تعيد جميع مسارات `/api/v1/staff/*` الأخطاء بصيغة JSON موحدة `{ code, message }`:

| الكود (`code`) | HTTP Status | المعنى |
|----------------|-------------|--------|
| `unauthorized` | `401` | جلسة مفقودة أو منتهية أو محاولة استخدام توكن `botpub_*` |
| `two_factor_required` | `403` | الحساب لا يملك مصادقة ثنائية (2FA) مفعّلة |
| `forbidden` | `403` | الحساب لا يملك صلاحية RBAC المطلوبة للمسار |
| `not_found` | `404` | التذكرة أو المنشور الاجتماعي غير موجود |
| `validation_error` | `400` | خطأ في معاملات الاستعلام أو الجسم أو وقت جدولة في الماضي |
| `ticket_closed` | `400` | محاولة الرد على تذكرة مغلقة (`closed`) |
| `conflict` | `409` | المنشور قيد المعالجة أو منشور مسبقاً أو بحالة لا تسمح بالإجراء |
| `rate_limited` | `429` | تجاوز حد العمليات المسموح (20 عملية نشر/جدولة/رفض لكل 5 دقائق لكل مستخدم) |
| `publish_failed` | `502` | فشل المزود الخارجي عند محاولة النشر الفوري |
| `server_error` | `500` | خطأ داخلي في الخادم |

---

## 4) الإشعارات الفورية والروابط العميقة (Push Notifications & Deep Links)

### أ) تسجيل جهاز تطبيق الديسك
يسجل تطبيق **Sabq Desk** رمز الدفع عبر المسار القائم `POST /api/v1/members/push-token` مع تمرير:
```json
{
  "token": "<64-char-apns-hex-token>",
  "provider": "apns",
  "platform": "ios",
  "bundleId": "com.sabq.desk",
  "installationId": "<ios-idfv-uuid>"
}
```
تمت إضافة `com.sabq.desk` إلى قائمة الحزم المسموحة (`ALLOWED_MEMBER_PUSH_BUNDLE_IDS`) في `server/services/deviceRegistrationPolicy.ts`.

### ب) الخطافات الثلاثة وحمولات الدفع (`sendPushToUserApp`)
جميع إشعارات الديسك تُرسل عبر `sendPushToUserApp(userId, 'com.sabq.desk', ...)` (مغلفة بـ `try/catch` بحيث لا يُفشل عطل الدفع حفظ التذكرة أو المقترح أبداً، وبالتوازي مع تنبيهات البريد والصندوق الداخلي القائمة):

1. **استفسار جديد أو رد من مساهم (`notifyDeskOfWriterInquiry` في `server/services/opinionTicketNotifications.ts`):**
   - **المستلمون:** `listOpinionDeskRecipients(senderId)`
   - **الرابط العميق (`deeplink`):** `sabqdesk://ticket/<ticketId>`
   - **الحمولة الإضافية (`data`):** `{ "ticketId": "<ticketId>", "kind": "new_ticket" | "writer_message" }`
   - **معرّف الدمج (`collapseId`):** `desk-ticket-<ticketId>`

2. **مقترح تغريدة من كاتب رأي (`notifyDeskOfAuthorSocialProposal` في `server/services/socialPublishing/socialPublishingService.ts`):**
   - **المستلمون:** المستخدمون النشطون الذين يملكون صلاحية `social_publish.view_log`
   - **الرابط العميق (`deeplink`):** `sabqdesk://social/<postId>`
   - **الحمولة الإضافية (`data`):** `{ "postId": "<postId>", "proposalKind": "author" }`
   - **معرّف الدمج (`collapseId`):** `desk-social-<postId>`

3. **مقترح تغريدة من وكالة (`saveAgencySocialPost` في `server/services/publisherSocialService.ts`):**
   - **المستلمون:** المستخدمون النشطون الذين يملكون صلاحية `social_publish.view_log`
   - **الرابط العميق (`deeplink`):** `sabqdesk://social/<postId>`
   - **الحمولة الإضافية (`data`):** `{ "postId": "<postId>", "proposalKind": "agency" }`
   - **معرّف الدمج (`collapseId`):** `desk-social-<postId>`

### ج) عزل إشعارات القارئ عن أجهزة الديسك
تم تحديث `notifyEditorialEvent` في `server/services/editorialNotifications.ts` لفلترة أجهزة iOS حسب حزمة تطبيق القارئ (`bundleId = 'com.sabq.sabqorg'`) وتمرير `topic: 'com.sabq.sabqorg'` إلى APNs، مما يضمن عدم إرسال إشعارات القارئ/الكاتب إلى أجهزة `com.sabq.desk`.

---

## 5) تطبيق iOS «مكتب سبق» (`sabq desk ios/`)

| الجزء | المسار |
|-------|--------|
| مشروع Xcode (هدف واحد، مجلد متزامن) | `sabq desk ios/SabqDesk.xcodeproj` — الحزمة `com.sabq.desk`، الفريق `CBU7MJEC5R`، iOS 17، RTL عربي، ثيم فاتح فقط، الإصدار 1.1.0 ورقم البناء `2026102601` |
| شاشات التطبيق | `sabq desk ios/SabqDesk/` — تصميم «تطبيقات البوت» المعتمد 2026-10-25: الروبوت (`DeskMascot`) كبير في الدخول وقفل Face ID، ثلاثة تبويبات «المكتب» (`DeskView`: بانتظارك/مجدول/منشور/مرفوض، والمجدول خط زمني بالأيام) و«الرسائل» (`MessagesView`: تنتظر ردك/تم الرد/مغلقة مع بحث) و«حسابي» (`SettingsView` مع الآفاتار والصلاحيات والردود السريعة)؛ محادثة الرسالة (`TicketDetailView`: فقاعات، فواصل أيام، «ردًا على» عبر `parentMessageId`)، تفاصيل المقترح، ورقة الجدولة (أوقات سريعة + تنبيه تعارض ±30 دقيقة) وورقة الرفض. المكوّنات المشتركة في `Components/DeskChrome.swift` والمنطق القابل للاختبار في `SabqDeskKit/DeskBoard.swift` |
| حزمة `SabqDeskKit` المحلية | `sabq desk ios/SabqDeskKit/` — `SabqDeskKit` (عميل الـ API، النماذج، تسميات الأدوار العربية `StaffRoleLabel`، تحويل الأخطاء، Keychain، الروابط العميقة، توقيت الرياض) و`SabqDeskDesign` (ألوان وخطوط IBM Plex Sans Arabic منسوخة من تطبيق القارئ دون ربط أهدافه) |
| الاختبارات | `sabq desk ios/SabqDeskKit/Tests/SabqDeskKitTests/` — `swift test` على macOS، ومخطط `SabqDeskKit-Package` على محاكي iOS |
| CI | `.github/workflows/sabq-desk-ios-build.yml` — بناء بلا توقيع + الاختبارات |

**سلوك العميل:**
- الجلسة في Keychain (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`)، وتُمسح قبل بدء أي تسجيل دخول جديد وعند أي `401`. `403 two_factor_required` لا يحذف الجلسة؛ يعرض التطبيق شاشة تشرح التفعيل من `https://sabq.org/settings/security` ثم «تحقّق الآن».
- تسمية الدور في شاشة الإعدادات تمر عبر `StaffRoleLabel` (`me.roleDisplayLabel`) لترجمة مفاتيح الأدوار (`system_admin` ← «مدير النظام»، `editor` ← «محرر»، إلخ) بالتطابق مع لوحة التحكم، مع الرجوع للمفتاح الخام عند عدم معرفته.
- «ألغِ الجدولة» (مجدول) و«أعده إلى بانتظارك» (مرفوض) يستدعيان `POST /api/v1/staff/social/:id/return-to-draft`. الردود السريعة محلية على الجهاز (`QuickReplyStore`، حتى 8).
- تخفي شاشتا تفاصيل الاستفسار وتفاصيل المقترح شريط التبويبات وتثبّتان شريط الإجراء في الأسفل عبر `safeAreaInset`.
- `X-Installation-Id` معرّف عشوائي لكل تثبيت (UserDefaults)، ويُرسل أيضاً مع `POST /api/v1/members/push-token` (`bundleId: "com.sabq.desk"`). عند الخروج يُلغى تسجيل الرمز بـ `DELETE /api/v1/members/push-token`.
- تسجيل رمز الدفع مربوط بمعرّف المستخدم (`PushRegistrationState`): يُعاد التسجيل كلما اختلف المستخدم أو تغيّر الرمز، ويُصفَّر الربط عند الخروج وعند أي `401`، لأن الخادم يربط الرمز بآخر حساب سجّله (upsert على `deviceToken`).
- الأرقام العربية-الهندية والفارسية (`١٢٣`، `۱۲۳`) تُحوَّل إلى ASCII قبل الإرسال (`DeskInput`): رمز 2FA (أرقام فقط)، والرمز الاحتياطي (مع تكبير الأحرف)، ورقم الجوال في الدخول.
- الأزرار تتبع `capabilities` من `/me` وحالة المنشور كحراسة الخادم: النشر/الجدولة لـ `draft | scheduled | failed`، والرفض لـ `draft | scheduled`.
- «انشر الآن» يمر بتأكيد، والجدولة تعرض ملخص الموعد بتوقيت الرياض قبل الإرسال (`scheduledAt` بإزاحة `+03:00`).
- أسباب الرفض الجاهزة: لا يناسب سياسة الحساب، معلومة غير دقيقة، مكرر، يحتاج إعادة صياغة؛ مع ملاحظة اختيارية تُضم في `reason` (`<السبب> — <الملاحظة>`).
- المعرّفات القادمة من رابط أو إشعار تُقبل فقط إن كانت `[A-Za-z0-9_-]{1,128}`؛ يقرأ التطبيق `deeplink` أولاً ثم `ticketId`/`postId`.
