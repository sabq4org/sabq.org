# Sabq Desk Staff Mobile API — واجهة تطبيق الديسك للمنسوبين (`/api/v1/staff/*`)

> آخر مراجعة: 2026-10-26 | المالك: editorial + social-publishing + auth-rbac + push-notifications | الحزمة: `com.sabq.desk` | الحالة: نشط، بلا ترحيل قاعدة بيانات (No Migration).

## الملخص

توفّر طبقة `/api/v1/staff/*` الواجهة البرمجية الخلفية لتطبيق iOS المستقل للمنسوبين **«Sabq Desk»** (`com.sabq.desk`) لإدارة:
1. **الهوية والقدرات الحية (`GET /me`):** بيانات حساب الموظف الأساسية، أدواره، ومصفوفة صلاحياته الحية للتذاكر والنشر الاجتماعي.
2. **الصندوق الموحد (`GET /inbox`) والعدادات (`GET /unread-counts`):** دمج استفسارات المساهمين (التذاكر) ومقترحات النشر الاجتماعي (كتّاب الرأي والوكالات) في تدفق زمني واحد مرتب من الأحدث إلى الأقدم مع ترقيم بمؤشر معتم (Opaque Cursor Pagination).
3. **استفسارات المساهمين (`Tickets`):** قراءة سلسلة رسائل التذكرة، الرد باسم المنسوب مع نقل الحالة من `open` إلى `answered`، وتحديث حالة التذكرة (`open | answered | closed`).
4. **مقترحات النشر الاجتماعي على X (`Social`):** معاينة التغريدة المقترحة والكاتب/الوكالة وسجل المحاولات، والنشر الفوري (`publish`) أو الجدولة (`schedule`) أو الرفض (`reject` مع سبب إلزامي إلا عند سحب صاحب المقترح لمقترحه).
5. **إشعارات الدفع الفوري الموجهة لتطبيق الديسك (`com.sabq.desk`):** إرسال إشعارات APNs/FCM عبر `sendPushToUserApp(userId, 'com.sabq.desk', ...)` مع روابط عميقة `sabqdesk://ticket/<id>` و`sabqdesk://social/<id>` عند وصول تذكرة/رسالة جديدة أو مقترح نشر اجتماعي من كاتب رأي أو وكالة، و`sabqdesk://opinion/<articleId>` عند وصول مقال رأي جديد للمراجعة (2026-10-28)، مع عزل تام لإشعارات تطبيق القارئ (`com.sabq.sabqorg`).
6. **أدوات المشرفين (`ai_hub.view`) — 2026-10-25:** صحة النظام (`GET /system/health`)، تنبيهات الإدارة (`GET /alerts`)، وتفضيلات التنبيهات (`GET|PUT /me/alert-prefs`)، مع إشعارات دفع لتغيّر حالة نماذج الذكاء الاصطناعي وحدود الميزانية وفشل نشر التغريدات.
7. **أرصدة النماذج (`ai_hub.view`، والكتابة `ai_hub.manage`) — 2026-10-25:** `GET /system/balances` و`GET /system/balances/:provider` و`POST /system/balances/:provider/topup` و`PUT /system/balances/:provider/threshold` (§2-10)، مع إشعار دفع واحد عند عبور الرصيد إلى «منخفض» أو «حرج» ورابط `sabqdesk://balances/<provider>`.

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
| **صحة النظام وتنبيهات الإدارة وتفضيلاتها وأرصدة النماذج** | `GET /system/health`، `GET /alerts`، `GET`/`PUT /me/alert-prefs`، `GET /system/balances[/:provider]` | `ai_hub.view` (`capabilities.canSystemHealth` / `canAdminAlerts`)؛ بدونها `403 forbidden` |
| **حفظ شحنة/ميزانية أو حد تنبيه رصيد** | `POST /system/balances/:provider/topup`، `PUT /system/balances/:provider/threshold` | `ai_hub.view` + `ai_hub.manage` (`capabilities.canManageBalances`)؛ من يملك العرض فقط يرد `403 forbidden` برسالة «تحديث الأرصدة وحدود التنبيه يتطلب صلاحية إدارة مركز الذكاء الاصطناعي» |

### د) سجل التدقيق (`activity_logs`) ومحددات المعدل
- **التدقيق:** تُسجَّل كل عملية كتابة (`ticket_reply`, `ticket_status_update`, `social_post_publish`, `social_post_schedule`, `social_post_reject`, `staff_alert_prefs_update`) في جدول `activity_logs` مع:
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
    },
    "canSystemHealth": true,
    "canAdminAlerts": true,
    "canManageBalances": true,
    "canOpinion": { "view": true, "schedule": true, "publish": true, "returnToWriter": true }
  },
  "alertPrefs": { "aiAlerts": true, "adminAlerts": false }
}
```
- `canSystemHealth` و`canAdminAlerts` كلاهما = `ai_hub.view`.
- `canManageBalances` = `ai_hub.view` و`ai_hub.manage` معاً (حفظ الشحنات والميزانية وحدود التنبيه في §2-10). الخوادم الأقدم لا ترسله، فيعدّه التطبيق `false`.
- `canOpinion` (منذ 2026-10-28، `computeStaffOpinionCapabilities` في `shared/staffApp.ts`): `view` = `opinion.review` أو `articles.schedule`؛ `schedule` = `articles.schedule` أو `articles.publish`؛ `publish` = `articles.publish`؛ `returnToWriter` = `opinion.review` أو `articles.edit_any`. كل فعل يشترط `view` أيضاً. الخوادم الأقدم لا ترسله، فيعدّه التطبيق كله `false`.
- `alertPrefs` يُعاد لكل عضو (منذ 2026-10-26): `{ aiAlerts, adminAlerts, writerMessages, socialProposals, opinionDrafts, quietHours }`. إن تعذّرت قراءته تُعاد القيم الافتراضية (كلها مفعّلة، `quietHours: "off"`) بدل إفشال `/me`.

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
        "roleKind": "opinion_author",
        "avatarUrl": "https://media.sabq.org/avatars/writer.jpg"
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
> ملاحظة: حقل `sender.kind` يأخذ إحدى القيم الموحدة: `"writer" | "reporter" | "agency" | "organization"` (`organization` = حساب منسوب غير كاتب ولا مراسل). `sender.avatarUrl` رابط `https` مطلق (صورة الشخص أو شعار الوكالة) أو `null` (`safeStaffAvatarUrl` في `shared/staffApp.ts`)؛ قد يغيب في الخوادم الأقدم.

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
  يعيد `{ ticket, messages }`: تفاصيل التذكرة وكامل رسائل المحادثة مرتبة زمنياً، ويحدّث `lastReadByAdminAt`. يحمل `ticket.sender` الشكل نفسه في الصندوق `{ id, name, kind, roleKind, avatarUrl }` (`buildStaffTicketDetailSender` في `server/services/staffAppService.ts`) مع `ticket.deeplink`.
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
  الجسم: `{ "reason": "سبب الرفض" }` (حتى 1000 حرف، يُقلَّم). السبب **إلزامي** بالقاعدة نفسها في إلغاء الويب (`resolveCancelReason`، انظر §9): جسم فارغ أو `reason` فارغ/مسافات من غير صاحب المقترح يرد `400 { code: "validation_error", message: "اكتب سبب الرفض" }` دون لمس الصف؛ صاحب المقترح (`createdByUserId` = المستخدم) يسحبه بلا سبب (`reason = null`). المسار البديل `/social/posts/:id/reject` مثله. يلغي المقترح (`status = "canceled"`) عبر `cancelPost` ويشعر الكاتب أو الوكالة.
- **`POST /api/v1/staff/social/:id/return-to-draft`**
  الجسم: `{}` (فارغ). يعيد المقترح إلى «بانتظار القرار» (`draft`) عبر `returnPostToDraft`: من `scheduled` (إلغاء الجدولة، يحتاج `canSocial.schedule`) أو من `canceled` (التراجع عن الرفض، يحتاج `canSocial.reject`). يمسح `scheduledAt` و`lastError` و`canceledByUserId` ويصفّر `attempts`. أي حالة أخرى ترد `409 conflict` دون لمس الصف. يُسجَّل في التدقيق بـ `social_post_return_to_draft`. لا يرسل إشعاراً لصاحب المقترح.

### 6. `GET /api/v1/staff/system/health` (`ai_hub.view`)
لقطة صحة نماذج الذكاء الاصطناعي والميزانيات (`server/services/staffSystemHealthService.ts`):
```json
{
  "generatedAt": "2026-10-25T09:00:00.000Z",
  "lastCheckAt": "2026-10-25T08:55:00.000Z",
  "summary": { "status": "partial", "title": "تعطّل جزئي", "detail": "..." },
  "aiAlertsEnabled": true,
  "models": [
    {
      "provider": "openai", "providerLabel": "OpenAI", "modelId": "gpt-5.1",
      "status": "down", "rawStatus": "quota_exceeded",
      "lastCheckAt": "2026-10-25T08:55:00.000Z", "since": "2026-10-25T08:40:00.000Z",
      "cooldownUntil": null,
      "lastError": { "code": "insufficient_quota", "message": "..." },
      "requests24h": 120, "failures24h": 14
    }
  ],
  "budgets": [
    { "id": "budget-uuid", "label": "...", "limitUsd": 500, "spentUsd": 410.5, "percent": 82, "period": "monthly" }
  ]
}
```
- `models[].status`: `up | degraded | down` (`quota_exceeded` ← `down`). `summary.status`: `ok | partial | down`.
- `lastError.message` مختصرة إلى 140 حرفاً مع حجب ما يشبه المفاتيح والتوكنات (`shortenAiError`).
- `aiAlertsEnabled` = تفضيل `aiAlerts` للمستخدم الحالي.

### 7. `GET /api/v1/staff/alerts` (`ai_hub.view`)
تنبيهات الإدارة المجمّعة (`server/services/staffAdminAlertsService.ts`). كل مصدر مستقل ولا يُسقط فشلُه البقية، بحد أقصى 50 عنصراً:
```json
{
  "generatedAt": "2026-10-25T09:00:00.000Z",
  "counts": { "urgent": 2, "info": 1 },
  "items": [
    {
      "id": "social_failed:post-uuid",
      "kind": "social_failed",
      "severity": "urgent",
      "title": "فشل نشر تغريدة",
      "body": "...",
      "occurredAt": "2026-10-25T08:30:00.000Z",
      "deeplink": "sabqdesk://social/post-uuid",
      "action": { "type": "retry_social", "postId": "post-uuid" }
    }
  ]
}
```
- `kind`: `social_failed` (آخر 72 ساعة) | `agency_balance_low` | `breaking_expiring` (خلال ساعتين) | `breaking_expired` (من صف `system_settings` `staff_app.breaking_expired_recent`) | `ai_incident` | `ai_budget` (≥ 80%).
- `severity`: `urgent | info`. `action`: `{ type: "retry_social", postId }` (فقط لمن يملك `canSocial.publish`) | `{ type: "open_system" }` | `null`.

### 8. `GET` / `PUT /api/v1/staff/me/alert-prefs` (كل عضو)
- **`GET`** يعيد `{ "aiAlerts": true, "adminAlerts": true }`. غياب الصف = الاثنان مفعّلان.
- **`PUT`** الجسم: `{ "aiAlerts"?: boolean, "adminAlerts"?: boolean, "writerMessages"?: boolean, "socialProposals"?: boolean, "opinionDrafts"?: boolean, "quietHours"?: "off" | "night" | "offhours" }` (`staffAlertPrefsUpdateSchema` صارم؛ قيمة غير صالحة ← `400 validation_error`). منذ 2026-10-26 متاح لكل عضو؛ مفتاحا `aiAlerts`/`adminAlerts` لا أثر لهما إلا لمن يملك `ai_hub.view`.
- **الساعات الهادئة** (بتوقيت الرياض): `night` = 23:00–07:00، `offhours` = 17:00–08:00. كل إشعار ديسك خلالها يُرسل بـ `interruption-level: passive` وبلا صوت، فيبقى في مركز الإشعارات دون إزعاج. لا يُؤجَّل ولا يُجمع.
- **رسائل الكتّاب** (`writerMessages`) و**مقترحات X** (`socialProposals`) و**مقالات الرأي** (`opinionDrafts`، منذ 2026-10-28، الافتراضي مفعّل) تخص إشعار الجوال فقط؛ الصندوق الداخلي والبريد لا يتغيران. يعيد التفضيلات بعد الحفظ ويُسجَّل `staff_alert_prefs_update`.
- التخزين: صف `system_settings` بالمفتاح `staff_app.alert_prefs:<userId>` (الفئة `staff_app`) بلا تغيير مخطط. الحفظ upsert ذري يدمج الحقول المرسلة فقط في قيمة jsonb المخزنة (`stored || patch`)، فلا يعيد طلبان متزامنان يغيّر كل منهما مفتاحاً مختلفاً تفعيلَ الآخر. جسم بلا حقول منطقية لا يكتب شيئاً ويعيد القيمة الحالية.

### 9. سبب الرفض في إلغاء الويب ورفض المكتب
`POST /api/social-publishing/posts/:id/cancel` (لوحة التحكم) و`POST /api/v1/staff/social/:id/reject` (تطبيق المكتب) يشترطان `reason` غير فارغ إلا إذا كان الملغي هو صاحب المقترح (`resolveCancelReason` ← `400 "اكتب سبب الرفض"`). يُخزَّن السبب في `lastError` ويظهر في تبويب «مرفوض» مع `canceledBySelf`.

---

### 10. أرصدة النماذج `/api/v1/staff/system/balances*` (القراءة `ai_hub.view`، الكتابة `ai_hub.manage`)
الخدمة: `server/services/aiBalanceService.ts` (الجلب والتخزين) و`server/services/aiBalanceMath.ts` (حساب نقي مختبَر). القراءة محروسة مثل `/system/health` (`capabilities.canSystemHealth`)؛ وحفظ الشحنة/الميزانية وحد التنبيه يتطلب أيضاً `ai_hub.manage` (`capabilities.canManageBalances`) وإلا `403 forbidden`. كل استجابة (القائمة، التفاصيل، الكتابة) تحمل `canManage` للمستخدم الحالي، فيخفي التطبيق «تحديث الرصيد» و«تعديل الميزانية» و«اضبطه» و«حدود التنبيه» و«تعديل» الحد حين تكون `false`. والمزوّد خارج القائمة البيضاء (`deepseek | openai | anthropic | gemini | elevenlabs`) يرد `404 not_found`.

| المزوّد | `kind` | المصدر | المفتاح |
|---|---|---|---|
| DeepSeek | `actual` | `GET https://api.deepseek.com/user/balance` (رصيد فعلي بالدولار، وCNY إن لم يوجد دولار) | `DEEPSEEK_API_KEY` |
| ElevenLabs | `actual` (`unit: "characters"`) | `GET https://api.elevenlabs.io/v1/user/subscription` (الأحرف المتبقية وموعد التجدد) | `ELEVENLABS_API_KEY` |
| OpenAI | `estimated` | آخر شحنة/رصيد أدخله المدير − الصرف منذه. الصرف من `GET https://api.openai.com/v1/organization/costs` (`Bearer OPENAI_ADMIN_KEY`، `spendSource: "provider_admin_api"`)، وعند غياب المفتاح أو فشل الطلب من تكاليف سبق المسجّلة (`ai_usage_logs` / `ai_usage_daily`، `spendSource: "tracked"`) | `OPENAI_ADMIN_KEY` (الإنتاج على Render) |
| Anthropic | `estimated` | الشحنة − الصرف المسجّل في سبق فقط (حساب Individual Org بلا مفتاح إداري). يبقى دعم اختياري لـ `ANTHROPIC_ADMIN_KEY` عبر `cost_report` إن ضُبط مستقبلاً | — (اختياري `ANTHROPIC_ADMIN_KEY`) |
| Gemini | `budget` | الصرف المسجّل في سبق هذا الشهر مقابل ميزانية شهرية يضعها المدير (ليس فوترة Google Cloud) | — |

وجود مفتاح المزوّد العادي (`*_API_KEY`) يحدد فقط إن كان المزوّد مفعّلاً؛ لا تُسجَّل قيم المفاتيح ولا تُعاد، وأخطاء المزوّد تُختصر بحجب ما يشبه المفاتيح (`error`، 120 حرفاً).

**التخزين (بلا جداول ولا ترحيلات)** في `system_settings` بفئة `staff_app`: `staff_app.ai_balance:<provider>` (الحد، خط الأساس، الميزانية، سجل الشحنات)، `staff_app.ai_balance_snapshots:deepseek` (آخر رصيد لكل يوم لاستنتاج الصرف اليومي)، `staff_app.ai_balance_alert:<provider>` (آخر مستوى أُشعر به). ذاكرة مؤقتة 10 دقائق لكل مزوّد، وتُحدَّث فوراً بعد أي كتابة.

- **`GET /api/v1/staff/system/balances`**
```json
{
  "generatedAt": "2026-10-25T09:00:00.000Z",
  "canManage": true,
  "summary": { "critical": 1, "low": 1, "notConfigured": 1, "attention": 3, "text": "رصيد DeepSeek شبه نافد، وOpenAI تحت حدّك. Anthropic لم يُضبط رصيده بعد." },
  "providers": [
    {
      "provider": "openai", "label": "OpenAI", "kind": "estimated", "unit": "usd",
      "state": "low", "reason": null,
      "amount": 86.3, "total": 500, "fraction": 0.17, "remaining": null,
      "threshold": { "low": 100, "critical": 25, "presets": [50, 100, 200], "isDefault": false },
      "todaySpend": 14.2, "monthSpend": 380.4, "spendUnit": "usd", "spentSinceBaseline": 413.7,
      "daysLeft": 6.1, "resetsAt": null,
      "baseline": { "amount": 500, "at": "2026-10-02T09:00:00.000Z" },
      "lastTopup": { "mode": "add", "amount": 500, "topupAt": "2026-10-02T09:00:00.000Z", "byName": "..." },
      "spendSource": "provider_admin_api", "canUpdateBalance": true,
      "fetchedAt": "2026-10-25T09:00:00.000Z", "error": null
    }
  ]
}
```
  - `state`: `healthy | low | critical | not_configured | unavailable`، و`reason`: `missing_key | no_topup | no_budget | fetch_failed | null`. الترتيب: حرج ثم منخفض ثم غير مضبوط ثم غير متاح ثم جيد.
  - `amount`: المتبقي (فعلي/تقديري)، وللميزانية المصروف هذا الشهر؛ `remaining` للميزانية فقط (الميزانية − المصروف) وعليه تُقاس الحالة.
  - `threshold.low` بوحدة المزوّد (دولار، أو أحرف لـ ElevenLabs)، و`critical` = ربع الحد.
  - `daysLeft` بمعدل الصرف اليومي الأخير؛ `resetsAt` لتجدد باقة ElevenLabs.
- **`GET /api/v1/staff/system/balances/:provider`** — الشكل نفسه مع `series` (آخر 30 يوماً `[{ "date": "2026-10-25", "value": 14.2 }]` بتوقيت UTC اليومي وبوحدة `spendUnit`) و`topups` (سجل الشحنات `{ mode, amountUsd, topupAt, savedAt, byUserId, byName, balanceAfterUsd }`).
- **`POST /api/v1/staff/system/balances/:provider/topup`**
  الجسم (`strict`): `{ "mode": "add" | "set" | "budget", "amountUsd": 500, "topupAt": "2026-10-25T12:00:00+03:00"?, "threshold": 100? }`. `add` يضيف شحنة إلى الرصيد التقديري الحالي، و`set` يضبط الرصيد الحالي كما في لوحة المزوّد (OpenAI/Anthropic فقط)، و`budget` يضبط ميزانية Gemini الشهرية. وضع غير مناسب للمزوّد يرد `400 validation_error` مع `details.reason`. يعيد عرض المزوّد المحدّث، ويُسجَّل في التدقيق بـ `ai_balance_topup`.
- **`PUT /api/v1/staff/system/balances/:provider/threshold`**
  الجسم (`strict`): `{ "threshold": 100 }` بوحدة المزوّد. يعيد عرض المزوّد المحدّث، ويُسجَّل بـ `ai_balance_threshold`.

**التنبيهات:** وظيفة `aiProviderHealthCheck` (القائد فقط، كل 5 دقائق) تستدعي `evaluateAiBalanceAlerts` في `staffAiAlertPush.ts`: إشعار واحد لكل عبور إلى `low` أو `critical` (المستوى يُحجز ذرياً حتى لا ترسله نسختان)، والعودة إلى «جيد» تعيد التسليح. التفضيل `aiAlerts`، `type: "ai_status"`، الرابط `sabqdesk://balances/<provider>`، `collapseId: desk-ai-balance-<provider>`، و`time-sensitive` للحرج. أول تقييم لمزوّد لا صف تنبيه له (أول تشغيل بعد النشر، أو أول ضبط لمزوّد كان غير مضبوط) يخزّن مستواه الحالي بصمت دون إشعار، فلا يصل سيل إشعارات لمزوّدين منخفضين أصلاً؛ الإشعار يبدأ من العبور التالي. ما يزال الرصيد المنخفض ظاهراً في القائمة وشريط التنبيه داخل التطبيق.

### 11. تبويب «الرأي» `/api/v1/staff/opinion/*` (منذ 2026-10-28)

المنطق في `server/services/staffOpinionDeskService.ts` (الاستعلامات والأفعال)، و`staffOpinionBoard.ts` (توزيع خالص على المواعيد)، و`opinionSlotClash.ts` (تعارض خالص). كل كتابة بمحدد `STAFF_APP_OPINION_RATE_LIMIT` (افتراضي 30 / 5 دقائق لكل عضو) وتُسجَّل في التدقيق.

| المسار | الصلاحية | الوصف |
|---|---|---|
| `GET /opinion/board?weekStart=YYYY-MM-DD` | `canOpinion.view` | سبعة أيام بتوقيت الرياض من اليوم (أو `weekStart` ضمن ±60 يوماً): `{ weekStart, days:[{date, weekday, counts:{draft,prep,scheduled,missing}}], slots, unslotted, pendingCount }` |
| `GET /opinion/:id` | `view` | `{ item, nextSlot }` بالشكل نفسه؛ `404` إن لم يعد المقال بانتظار المكتب |
| `GET /opinion/:id/slot-check?scheduledAt=ISO` | `schedule` | `{ scheduledAt, warnings }` بلا كتابة |
| `POST /opinion/:id/schedule` | `schedule` | `{ "mode": "fixed_slot" }` (الموعد الثابت القادم) أو `{ "scheduledAt": ISO+offset }`؛ يعيد `{ article, scheduledAt, warnings }`؛ تدقيق `staff_opinion_schedule` |
| `POST /opinion/:id/publish` | `publish` | نشر فوري (جسم فارغ)؛ يقبل `pending_review` و`approved` ويثبت الاعتماد؛ `409` إن كان منشوراً؛ تدقيق `staff_opinion_publish` |
| `POST /opinion/:id/return-to-writer` | `returnToWriter` | `{ "note": "…" }` من 3 إلى 2000 حرف إلزامي ← `needs_changes` + `draft` + إشعار وبريد للكاتب؛ تدقيق `staff_opinion_return_to_writer` |
| `POST /opinion/:id/prepare` | `schedule` | «جهّز وجدول»: مرحلة لاحقة، يرد دائماً `501 { code: "not_implemented", message: "التجهيز الآلي قريبًا" }` (حتى مع `OPINION_AUTO_PREP_ENABLED=true`) |

- **العنصر:** `{ writer: { id, name, avatarUrl, jobTitle, fixedSlot: { weekday, publishTime } | null }, slotAt, state, article: { id, title, status, submittedAt, scheduledAt, publishedAt } | null, deeplink }`. `status`: `new_draft` (بانتظار التحرير: `pending_review` أو مسودة موبايل قديمة)، `in_prep` (`approved` ولم يُجدول)، `scheduled`، و`published` للعرض فقط. `state`: `arrived | missing | scheduled | published | late`.
- **التوزيع:** لكل كاتب بموعد ثابت خانة في يومه (نُشر ← مجدول ← مسودة ← «لم تصل بعد»)، ومجدولات أخرى في موعدها الفعلي، ومسودة زائدة لكاتب بموعد ثابت تأخذ موعده التالي، ومسودات من لا موعد ثابت له في `unslotted`. `pendingCount` = `new_draft` + `in_prep` (شارة التبويب).
- **الجدولة** تعيد استخدام `scheduleApprovedOpinionArticle` (ومنها قاعدة الفاصل الأسبوعي للكاتب نفسه ← `409`)، ثم إشعارات الويب نفسها. **التعارض** مع كاتب آخر في الدقيقة نفسها لا يمنع: يرد `200` مع `warnings: [{ code: "slot_clash", message, otherWriterName, otherArticleId }]`.
- **النشر والإعادة** يكرران منطق `/api/dashboard/opinion/:id/publish` و`request-revision` في `routes.ts` (الذي بقي دون تعديل) بالدوال نفسها: إبطال الكاش، `createNotification`، `sendOpinionAuthorPublishEmail`/`sendOpinionAuthorRevisionEmail`، `notifyArticleStakeholders`.

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

### ب) خطافات الكتّاب وحمولات الدفع (`sendPushToUserApp`)
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

4. **مقال رأي جديد بانتظار المراجعة (`notifyStaffDeskOfOpinionDraft` في `server/services/staffAppPushService.ts`، يُستدعى من `notifyOpinionArticleSubmittedForReview` لكل مسارات الإرسال) — 2026-10-28:**
   - **المستلمون:** `listOpinionDeskRecipientUserIds(authorId)`: كل عضو نشط يملك `opinion.review` **أو** `articles.schedule` (فحص RBAC حي، وتُستثنى الكاتبة/الكاتب نفسه)، وهما الصلاحيتان اللتان يشترطهما `GET /api/opinion-writers/:writerId/next-slot`.
   - **التفضيل:** `opinionDrafts` («مقالات الرأي») + الساعات الهادئة.
   - **العنوان:** «مقال رأي جديد: <اسم الكاتب>»؛ **النص:** ««<عنوان المقال>» — موعده الثابت: <اليوم التاريخ HH:mm> (الرياض)» من `getNextSlotForWriter(authorId, articleId)`، أو «بلا موعد ثابت».
   - **النوع (`type`):** `desk.opinion_draft`
   - **الرابط العميق (`deeplink`):** `sabqdesk://opinion/<articleId>` — نسخة iOS الحالية لا تعرف هذا المسار فتتجاهله وتفتح التطبيق فقط؛ الشاشة تأتي في المرحلة 2.
   - **الحمولة الإضافية (`data`):** `{ "articleId": "<articleId>", "nextSlot"?: "<ISO>" }` (بلا `ticketId`/`postId` عمداً حتى لا يفسّرها التطبيق الحالي كتذكرة أو تغريدة).
   - **معرّف الدمج (`collapseId`):** `desk-opinion-<articleId>`
   - يُرسل في الخلفية مع بريد البوت (`[sabq-desk] type=opinion_draft id=<articleId>`)؛ فشلهما لا يُفشل الإرسال ولا يؤخّره.

### ب-2) إشعارات المشرفين (`sendStaffAdminPush` في `server/services/staffAppPushService.ts`)
المستلمون: المستخدمون النشطون الذين يملكون `ai_hub.view` ولم يطفئوا التفضيل المعني في `/me/alert-prefs` (إن تعذّرت قراءة التفضيلات يُرسل للجميع). كل إشعارات الديسك (هنا وفي خطافات الكتّاب أعلاه) تمر على `applyStaffDeskPrefs` في `staffAppPushService.ts`: نوع مطفأ لا يُرسل، وفي الساعات الهادئة يصل صامتاً. لا ترمي هذه الدوال، ولا يمس فشلها مسار الذكاء الاصطناعي أو النشر.

| الحدث | التفضيل | المصدر | `type` | `deeplink` | `collapseId` |
|-------|---------|--------|--------|------------|--------------|
| تغيّر حالة نموذج (`down` / `degraded` / `quota_exceeded` / تعافٍ) | `aiAlerts` | `notifyStaffOfAiStatusChange` من `aiCriticalAlerts` (تهدئة 15 دقيقة لكل مزود:نموذج:حالة) | `ai_status` | `sabqdesk://system` | `desk-ai-<provider>-<modelId>` |
| استنفاد سلسلة البدائل (`chain_exhausted`) | `aiAlerts` | `handleAiGatewayIncident` عبر `setIncidentHandler` في بوابة الذكاء (تهدئة ≥ 10 دقائق لكل `featureKey`؛ مخزن دائري بالذاكرة لكل نسخة تقرؤه `/alerts`) | `ai_status` | `sabqdesk://system` | `desk-ai-chain-<featureKey>` |
| بلوغ ميزانية 80% / 100% | `aiAlerts` | وظيفة `aiProviderHealthCheck` (مرة لكل ميزانية/شهر/حد بعلامة في `system_settings`) | `ai_status` | `sabqdesk://system` | `desk-ai-budget-<budgetId>` |
| رصيد نموذج «منخفض» / «حرج» (عبور المستوى) | `aiAlerts` | `evaluateAiBalanceAlerts` من وظيفة `aiProviderHealthCheck` (المستوى المخزَّن في `staff_app.ai_balance_alert:<provider>`) | `ai_status` | `sabqdesk://balances/<provider>` | `desk-ai-balance-<provider>` |
| فشل نشر تغريدة فشلاً نهائياً | `adminAlerts` | `notifyStaffAdminsOfSocialFailure` من `socialPublishingService` | `admin_alert` (`data.postId`) | `sabqdesk://alerts` | `desk-social-failed-<postId>` |

الكود: `server/services/staffAiAlertPush.ts`، `staffAlertPrefsService.ts`، `staffSystemHealthService.ts`، `staffAdminAlertsService.ts`، `staffBreakingExpiryLog.ts`.

### ج) عزل إشعارات القارئ عن أجهزة الديسك
تم تحديث `notifyEditorialEvent` في `server/services/editorialNotifications.ts` لفلترة أجهزة iOS حسب حزمة تطبيق القارئ (`bundleId = 'com.sabq.sabqorg'`) وتمرير `topic: 'com.sabq.sabqorg'` إلى APNs، مما يضمن عدم إرسال إشعارات القارئ/الكاتب إلى أجهزة `com.sabq.desk`.

---

## 5) تطبيق iOS «مكتب سبق» (`sabq desk ios/`)

| الجزء | المسار |
|-------|--------|
| مشروع Xcode (هدف واحد، مجلد متزامن) | `sabq desk ios/SabqDesk.xcodeproj` — الحزمة `com.sabq.desk`، الفريق `CBU7MJEC5R`، iOS 17، RTL عربي، ثيم فاتح فقط، الإصدار 1.1.0 ورقم البناء `2026102605` |
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
- أسباب الرفض الجاهزة: لا يناسب سياسة الحساب، معلومة غير دقيقة، مكرر، يحتاج إعادة صياغة؛ مع ملاحظة تُضم في `reason` (`<السبب> — <الملاحظة>`)؛ يكفي السبب الجاهز أو الملاحظة، وزر التأكيد معطّل حتى يتوفر أحدهما.
- «أرصدة النماذج» (للمشرفين، `canSystemHealth`): صف «أرصدة النماذج» مع عدّاد ما يحتاج انتباهاً في «حالة النظام»، وشريط تنبيه داخل التطبيق لأخطر رصيد مع «افتح الأرصدة» و«ذكّرني بعد ساعة» (إخفاء محلي يعود عند تغيّر المستوى). الشاشات: `ModelBalancesView` (القائمة)، `ProviderBalanceDetailView` (مخطط صرف 30 يوماً بـ Swift Charts وسجل الشحنات)، `UpdateBalanceSheet` (تحديث الرصيد/الميزانية وحدود التنبيه). أدوات التعديل تظهر فقط حين `canManage` في الاستجابة (أو `capabilities.canManageBalances` إن غاب)، ومن يملك العرض فقط يرى الأرصدة للقراءة. الروابط العميقة `sabqdesk://balances` و`sabqdesk://balances/<provider>` (قائمة بيضاء للمزوّدين) تفتح تبويب النظام.
- «الرأي» (`canOpinion.view`، التبويب الثاني بأيقونة `square.and.pencil` وشارة `pendingCount`): `OpinionView` — شريط أيام الأسبوع بنقاط الحالة، ثم خط زمني بالساعة كـ«مجدول» في المكتب، وقسم «بلا موعد ثابت» في الآخر، وحالة «لا مسودات بانتظارك هذا الأسبوع». «جهّز وجدول»/«أكمل التجهيز» معطّل حتى `OpinionFeatureFlags.autoPrepEnabled`؛ «جدول في موعده» يجدول في الموعد الثابت؛ «انشر الآن» بتأكيد ثم Face ID (`AppLockController.confirmSensitiveAction`)؛ الجدولة تفحص `slot-check` أولاً وتنبّه «جدول رغم ذلك». الرابط `sabqdesk://opinion/<articleId>` وإشعار `type: "desk.opinion_draft"` (`articleId`) يفتحان التبويب ويبرزان المقال. مفتاح «مقالات الرأي» في التنبيهات لمن يملك `canOpinion.view`.
- المعرّفات القادمة من رابط أو إشعار تُقبل فقط إن كانت `[A-Za-z0-9_-]{1,128}`؛ يقرأ التطبيق `deeplink` أولاً ثم `ticketId`/`postId`.
