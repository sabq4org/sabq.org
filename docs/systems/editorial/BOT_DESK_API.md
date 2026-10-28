# Bot Desk API — واجهة بوت الديسك لاستفسارات المساهمين ومقترحات النشر الاجتماعي

> آخر مراجعة: 2026-10-24 | المالك: editorial + social-publishing + auth-rbac | الحالة: نشط، بلا ترحيل قاعدة بيانات (No Migration).

## الملخص

توفّر واجهة `/api/internal/bot-desk/*` نقاط دخول آمنة لبوت مساعد موثوق للتعامل مع:
1. **استفسارات المساهمين (التذاكر):** استعراض التذاكر، قراءة سلسلة المحادثة الكاملة، الرد باسم مالك التوكن (مع تحويل الحالة من `open` إلى `answered`)، وتحديث حالة التذكرة (`open | answered | closed`).
2. **مقترحات النشر الاجتماعي على X:** استعراض المقترحات المعلقة من كتّاب الرأي والوكالات، قراءة تفاصيل المنشور وسجل محاولاته، والرفض (`reject` → `canceled` مع إشعار صاحب المقترح) أو النشر الفوري (`publish`) أو الجدولة (`schedule`) على منشورات أنشأها مستخدمون آخرون.
3. **تنبيهات البريد الإلكتروني القابلة للتحليل آلياً:** إشعار البوت بريدياً فور وصول تذكرة/رسالة جديدة من مساهم أو مقترح تغريدة من كاتب رأي أو وكالة، مع سطر ثابت قابل للتحليل الآلي (`[sabq-desk] type=ticket id=<id>` أو `[sabq-desk] type=social_proposal id=<id>` أو `[sabq-desk] type=opinion_draft id=<articleId>` لمقال رأي جديد بانتظار المراجعة منذ 2026-10-28) ليجلب البوت السجل الكامل بالمعرّف.

---

## 1) المصادقة ونموذج الصلاحيات (Auth & RBAC)

تعتمد جميع مسارات `/api/internal/bot-desk/*` على توكنات الناشر الشخصية (`botpub_*`) المخزّنة بتجزئة SHA-256 في جدول `bot_publisher_tokens`:

```http
Authorization: Bearer botpub_<secret>
Content-Type: application/json
User-Agent: Mozilla/5.0 (compatible; SabqBotDesk/1.0)
```

### قواعس التحقق والصلاحيات
- **التحقق من التوكن:** يتم عبر `authenticatePublisherToken` في `server/services/botPublisherTokenService.ts`.
  - التوكن المفقود أو غير المطابق لبادئة `botpub_` أو المنتهي أو الملغى (`revokedAt IS NOT NULL`) أو المرتبط بحساب موقوف/مقفل يعيد `401 Unauthorized` مع ترويسة `WWW-Authenticate: Bearer realm="sabq-bot-desk"`.
  - كل طلب ناجح يحدّث `last_used_at` على صف التوكن.
- **تطبيق RBAC الخاص بمالك التوكن:**
  - **مسارات التذاكر (`/tickets*`):** تشترط نفس قاعدة `isOpinionDeskViewer` (أن يكون مالك التوكن ضمن `SUPERUSER_ROLE_NAMES` أو `editor`، مع تجاهل صفوف `user_roles` القديمة لحسابات `users.role = reader`). عند عدم تحقق الشرط تُعاد `403 Forbidden`.
  - **مسارات النشر الاجتماعي (`/social*`):** تشترط نفس صلاحيات مسارات لوحة التحكم:
    - `GET /social/pending` و`GET /social/posts/:id`: `social_publish.view_log`
    - `POST /social/posts/:id/publish`: `social_publish.publish_now`
    - `POST /social/posts/:id/schedule`: `social_publish.schedule`
    - `POST /social/posts/:id/reject`: `social_publish.manage_scheduled` **أو** `social_publish.create`
- **الإعفاء من CSRF:** جميع المسارات تقع تحت `/api/internal/*` المعفاة من فحص CSRF المتصفحي، وترسل دائماً `Cache-Control: private, no-store`.
- **سجل التدقيق (`activity_logs`):** كل عملية كتابة تُسجَّل في `activity_logs` تحت القناة `channel: "bot-desk-api"` مع `tokenId` و`tokenPrefix` و`tokenLabel`؛ **لا يُحفظ التوكن الخام في السجلات أبداً**.

---

## 2) كيفية إصدار توكن `botpub_`

يمكن لمسؤول النظام إصدار التوكن من لوحة التحكم (`/dashboard/publisher-tokens`) أو عبر الـ API الإداري المحمي بجلسة Passport وصلاحية `system.manage_settings`:

```bash
curl -sS -X POST "https://sabq.org/api/admin/bot-publisher-tokens" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=<SESSION_COOKIE>" \
  -H "X-CSRF-Token: <CSRF_TOKEN>" \
  -d '{
    "email": "admin-or-editor@sabq.org",
    "label": "sohba-desk-assistant",
    "expiresInDays": 180
  }'
```

الاستجابة (`201 Created`) تعيد حقل `token` (`botpub_...`) **مرة واحدة فقط** عند الإصدار أو التدوير (`POST /api/admin/bot-publisher-tokens/:id/rotate`)، ويمكن إبطاله في أي وقت عبر `POST /api/admin/bot-publisher-tokens/:id/revoke`.

---

## 3) المسارات (Endpoints)

### أ) استفسارات المساهمين (Tickets)

| الطريقة | المسار | الصلاحية | الوصف |
|---------|--------|----------|-------|
| `GET` | `/api/internal/bot-desk/tickets` | `isOpinionDeskViewer` | قائمة التذاكر مع فلاتر اختيارية: `status` (`open\|answered\|closed`)، `authorKind` (`reporter\|opinion_author\|angle_writer\|other\|all`)، `unread` (`true\|false\|1\|0`)، `limit` (`1..100`، افتراضي `50`). |
| `GET` | `/api/internal/bot-desk/tickets/:id` | `isOpinionDeskViewer` | تفاصيل التذكرة وكامل الرسائل مرتبة زمنياً (`senderName`, `role`, `text`, `created_at` بصيغة ISO)، مع تحديث `lastReadByAdminAt`. |
| `POST` | `/api/internal/bot-desk/tickets/:id/reply` | `isOpinionDeskViewer` | إضافة رد `{ "message": "...", "parentMessageId"?: "..." }` باسم مالك التوكن (`senderRole = "admin"`). ينقل التذكرة من `open` إلى `answered`، ويرفض التذكرة المغلقة (`closed`) بـ `400 ticket_closed`. |
| `PATCH` | `/api/internal/bot-desk/tickets/:id/status` | `isOpinionDeskViewer` | تغيير حالة التذكرة `{ "status": "open" \| "answered" \| "closed" }`. |

#### أمثلة التذاكر

```bash
# 1) جلب التذاكر المفتوحة غير المقروءة
curl -sS "https://api.sabq.org/api/internal/bot-desk/tickets?status=open&unread=true&limit=20" \
  -H "Authorization: Bearer $SABQ_BOT_DESK_TOKEN" \
  -H "User-Agent: Mozilla/5.0 (compatible; SabqBotDesk/1.0)"

# 2) قراءة تذكرة مع رسائلها
curl -sS "https://api.sabq.org/api/internal/bot-desk/tickets/<ticketId>" \
  -H "Authorization: Bearer $SABQ_BOT_DESK_TOKEN" \
  -H "User-Agent: Mozilla/5.0 (compatible; SabqBotDesk/1.0)"

# 3) الرد على تذكرة
curl -sS -X POST "https://api.sabq.org/api/internal/bot-desk/tickets/<ticketId>/reply" \
  -H "Authorization: Bearer $SABQ_BOT_DESK_TOKEN" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 (compatible; SabqBotDesk/1.0)" \
  -d '{"message":"تمت مراجعة المقال وجدولته للنشر في موعدكم الأسبوعي."}'

# 4) إغلاق تذكرة
curl -sS -X PATCH "https://api.sabq.org/api/internal/bot-desk/tickets/<ticketId>/status" \
  -H "Authorization: Bearer $SABQ_BOT_DESK_TOKEN" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 (compatible; SabqBotDesk/1.0)" \
  -d '{"status":"closed"}'
```

---

### ب) مقترحات النشر الاجتماعي (Social Publishing Proposals)

| الطريقة | المسار | الصلاحية | الوصف |
|---------|--------|----------|-------|
| `GET` | `/api/internal/bot-desk/social/pending` | `social_publish.view_log` | قائمة المسودات (`status=draft`) المقدمة من كتّاب الرأي أو الوكالات. الفلاتر: `kind` (`author\|agency\|all`، افتراضي `all`) و`limit` (`1..100`، افتراضي `50`). تعيد `id`, `text`, `authorName`, `agencyName`, `article` (`title`, `url`), `created_at`. |
| `GET` | `/api/internal/bot-desk/social/posts/:id` | `social_publish.view_log` | تفاصيل منشور اجتماعي وسجل محاولات النشر (`attempts`). |
| `POST` | `/api/internal/bot-desk/social/posts/:id/reject` | `social_publish.manage_scheduled` أو `social_publish.create` | رفض المقترح `{ "reason"?: "..." }` عبر `cancelPost` (`status = "canceled"`) مع إشعار الكاتب أو الوكالة. |
| `POST` | `/api/internal/bot-desk/social/posts/:id/publish` | `social_publish.publish_now` | مطالبة ذرية ونشر فوري لجسم فارغ `{}` (`claimPostForImmediatePublish` + `publishClaimedPost`). محدد بـ 20 عملية / 5 دقائق؛ ويعيد `409 conflict` إذا كان المنشور قيد النشر أو منشوراً مسبقاً. |
| `POST` | `/api/internal/bot-desk/social/posts/:id/schedule` | `social_publish.schedule` | جدولة المنشور `{ "scheduledAt": "2026-10-25T19:30:00+03:00" }` (ISO-8601 مع المنطقة الزمنية) عبر `schedulePost`. |

#### أمثلة النشر الاجتماعي

```bash
# 1) جلب مقترحات الكتّاب والوكالات المعلقة
curl -sS "https://api.sabq.org/api/internal/bot-desk/social/pending?kind=all" \
  -H "Authorization: Bearer $SABQ_BOT_DESK_TOKEN" \
  -H "User-Agent: Mozilla/5.0 (compatible; SabqBotDesk/1.0)"

# 2) نشر مقترح فوراً
curl -sS -X POST "https://api.sabq.org/api/internal/bot-desk/social/posts/<postId>/publish" \
  -H "Authorization: Bearer $SABQ_BOT_DESK_TOKEN" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 (compatible; SabqBotDesk/1.0)" \
  -d '{}'

# 3) جدولة مقترح بتوقيت الرياض
curl -sS -X POST "https://api.sabq.org/api/internal/bot-desk/social/posts/<postId>/schedule" \
  -H "Authorization: Bearer $SABQ_BOT_DESK_TOKEN" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 (compatible; SabqBotDesk/1.0)" \
  -d '{"scheduledAt":"2026-10-25T20:00:00+03:00"}'

# 4) رفض مقترح مع ملاحظة للكاتب/الوكالة
curl -sS -X POST "https://api.sabq.org/api/internal/bot-desk/social/posts/<postId>/reject" \
  -H "Authorization: Bearer $SABQ_BOT_DESK_TOKEN" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 (compatible; SabqBotDesk/1.0)" \
  -d '{"reason":"نعتذر، تم الاكتفاء بتغريدة الخبر الرئيسي اليوم."}'
```

---

## 4) إعداد مستلمي التنبيهات البريدية (Email Alerts Configuration)

تُرسل التنبيهات عبر `sendEmailNotification` في ثلاث حالات:
1. تذكرة جديدة أو رسالة جديدة من مساهم (`notifyDeskOfWriterInquiry`).
2. مقترح تغريدة جديد من كاتب رأي أو تعديل فعلي لنص المسودة (`createOrUpdateAuthorSocialProposal` — لا يُرسل تنبيه إذا أُعيد حفظ نفس النص دون تغيير).
3. مقترح تغريدة من وكالة (`saveAgencySocialPost` — مع بقاء `aalhazmi@sabq.org` مستلماً افتراضياً دائماً).

### طرق الضبط
1. **متغير البيئة (موصى به في الإنتاج على Railway):**
   ```env
   DESK_BOT_ALERT_EMAILS=sohba@mail.grokbot.com
   ```
   (يقبل عنواناً واحداً أو عدة عناوين مفصولة بفواصل `,`).
2. **إعدادات النظام (`system_settings` مفتاح `editor_alerts`):**
   حقل `deskBotAlertEmails` (مصفوفة عناوين بريدية) عبر `PUT /api/admin/editor-alerts/settings`:
   ```json
   {
     "deskBotAlertEmails": ["sohba@mail.grokbot.com"]
   }
   ```
   يدمج الخادم عناوين `DESK_BOT_ALERT_EMAILS` مع `editor_alerts.deskBotAlertEmails` ويزيل التكرار تلقائياً.

### صيغة السطر القابل للتحليل آلياً (Machine-Parseable Line)
يتضمن عنوان البريد (`subject`) وأول سطر في متنه (`text` و`html`) العلامة الثابتة:
- للتذاكر:
  `[sabq-desk] type=ticket id=<ticketId>`
- لمقترحات النشر الاجتماعي (كاتب رأي أو وكالة):
  `[sabq-desk] type=social_proposal id=<postId>`
- لمقال رأي جديد بانتظار المراجعة والجدولة (منذ 2026-10-28، من `notifyOpinionArticleSubmittedForReview` لكل مسارات الإرسال: الويب والجوال ولوحة الرأي):
  `[sabq-desk] type=opinion_draft id=<articleId>`
  يُرسل أيضاً عند إعادة إرسال الكاتب مقاله من الجوال بعد «يحتاج تعديل» (`PUT /api/v1/articles/:id/resubmit`، منذ 2026-10-28)، ويمكن للمكتب إعادة إطلاقه يدوياً لمسودة ما زالت `pending_review` عبر `POST /api/v1/staff/opinion/:id/renotify` (push الديسك + هذا البريد فقط، مرة لكل مقال لكل عضو كل 5 دقائق) — فقد يصل البوت البريد نفسه لنفس `id` أكثر من مرة؛ عامله كتحديث لا كمسودة جديدة.
  المتن: `author` و`time` و`title` و`next_slot` (ISO للموعد الثابت القادم للكاتب، أو `none`)، ثم سطر عربي «موعده الثابت: <اليوم التاريخ الساعة> (الرياض)» أو «بلا موعد ثابت». المستلمون: `DESK_BOT_ALERT_EMAILS` + `editor_alerts.deskBotAlertEmails` فقط (`getDeskBotAlertRecipients()`). المنشئ `buildDeskOpinionDraftAlertEmail` في `server/services/deskBotAlerts.ts`. فشل البريد لا يُفشل الإرسال.

ويتبعها في المتن:
- `sender`: اسم المرسل
- `role`: دور المرسل (`opinion_author` / `reporter` / `angle_writer` / `writer` / `agency`)
- `time`: الوقت بتوقيت الرياض (`YYYY-MM-DD HH:mm:ss Asia/Riyadh`)
- `excerpt`: مقتطف من نص الرسالة أو التغريدة المقترحة
