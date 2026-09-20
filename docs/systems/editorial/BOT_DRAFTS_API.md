# Bot Drafts API — مسودات فقط لبوتات «نشر سبق» ومهندّس (Grok Bot)

> آخر مراجعة: 2026-09-20 | المالك: editorial | الحالة: جاهز للدمج بعد موافقة علي الحازمي على المصادقة والإسناد (انظر «قرارات تحتاج موافقة»)

## الملخص في سطرين (للبوت)

1. **إنشاء مسودة:** `POST https://api.sabq.org/api/internal/bot-drafts` مع ترويسة `Authorization: Bearer <SABQ_BOT_DRAFTS_TOKEN>` وجسم JSON فيه `title` و`content` (وتصنيف اختياري `categorySlug`). الرد يحمل `id` و`editUrl`.
2. **تحديث مسودة:** `PATCH https://api.sabq.org/api/internal/bot-drafts/<id>` بنفس الترويسة والحقول التي تغيّرت فقط. ممنوع إرسال `status` أو أي حقل نشر/جدولة — يُرفض 422، والنشر يبقى من لوحة التحكم بيد المحررين.

---

## 1) عقد الـ API

### Base URL

| البيئة | Base URL | ملاحظة |
|--------|----------|--------|
| الإنتاج | `https://api.sabq.org` | Railway مباشرة (مثل الموبايل). يتجاوز وسيط Pages فلا يتأثر بمشكلة IP الواحد. |
| الإنتاج عبر الواجهة | `https://sabq.org` | يعمل أيضاً عبر وسيط `/api/*` لكن الأفضل `api.sabq.org`. |
| محلياً | `http://localhost:5000` | `npm run dev` مع `BOT_DRAFTS_API_TOKENS` في `.env.local`. |

لا توجد بيئة staging مستقلة حالياً؛ الاختبار قبل الإنتاج يكون محلياً على Docker Postgres.

### المسارات

| الفعل | المسار | الغرض |
|-------|--------|-------|
| `POST` | `/api/internal/bot-drafts` | إنشاء مسودة عربية جديدة (الحالة `draft` دائماً) |
| `GET` | `/api/internal/bot-drafts/:id` | قراءة حالة المسودة ومعرّفها ورابط التحرير |
| `PATCH` | `/api/internal/bot-drafts/:id` | تحديث مسودة أنشأها بوت وما زالت `draft` |
| أي فعل آخر | `/:id/publish` `/:id/schedule` `DELETE` `PUT` … | مرفوض عمداً: `403 forbidden_action` أو `405` |

الكود: [`server/routes/botDrafts.ts`](../../../server/routes/botDrafts.ts) (HTTP) و[`server/services/botDraftsService.ts`](../../../server/services/botDraftsService.ts) (البيانات) و[`shared/botDrafts.ts`](../../../shared/botDrafts.ts) (العقد/Zod). ملف OpenAPI للاستيراد في أدوات البوتات: [`bot-drafts.openapi.yaml`](./bot-drafts.openapi.yaml).

### الترويسات

```
Authorization: Bearer <token>
Content-Type: application/json
User-Agent: Mozilla/5.0 (compatible; SabqBotDrafts/1.0)
```

كل الردود `Cache-Control: private, no-store`.

طلبات الخوادم الصادرة إلى `api.sabq.org` يجب أن ترسل `User-Agent` متصفّح عادي؛ بدونها قد يرد Cloudflare الخطأ 1010. مثال: `User-Agent: Mozilla/5.0 (compatible; SabqBotDrafts/1.0)`. عميل `scripts/bot-drafts-client.ts` يضبط هذا الافتراضي تلقائياً.

### حقول الطلب (POST و PATCH)

| الحقل | النوع | POST | ملاحظات |
|-------|------|------|---------|
| `title` | string 3–300 | مطلوب | عنوان الخبر |
| `content` | string 20–300000 | مطلوب | HTML أو نص خام. النص الخام يتحول تلقائياً إلى فقرات `<p>` (فاصل الفقرة سطر فارغ). HTML يمر بتنقية المحرر القياسية. |
| `contentFormat` | `"html"` \| `"text"` | اختياري | يفرض التفسير بدل الاكتشاف التلقائي (وجود وسوم = HTML). |
| `subtitle` | string ≤300 \| null | اختياري | عنوان فرعي |
| `excerpt` | string ≤1000 \| null | اختياري | المقدمة/الموجز |
| `categoryId` أو `categorySlug` | string | اختياري | تصنيف منشور للقرّاء (`status=visible` في الإنتاج، ويُقبل `active` تاريخياً) من `GET https://api.sabq.org/api/categories` (عام بلا مصادقة). غير موجود أو `inactive` → `422 category_not_found`. |
| `imageUrl` | https URL \| null | اختياري | صورة الغلاف برابط `https://` فقط (رفع الملفات الثنائية غير مدعوم في هذا العقد — انظر «حدود»). |
| `keywords` | string[] ≤20 | اختياري | تُحفظ في `seo.keywords` |
| `sourceUrl` | http(s) URL \| null | اختياري | المصدر الأصلي |
| `clientReference` | string ≤120 | اختياري | معرّف البوت الداخلي للمادة (يُعاد في الرد للمطابقة) |
| `notes` | string ≤2000 \| null | اختياري | ملاحظة للمحررين (مثل: «تحقق من الأرقام») |

في `PATCH` كل الحقول اختيارية ويلزم حقل واحد على الأقل. الحقول غير المعروفة تُرفض `400`.

### الحقول الممنوعة (ترفض 422 قبل أي معالجة)

`status`, `publishType`, `scheduledAt`, `publishedAt`, `reviewStatus`, `reviewedBy`, `reviewedAt`, `reviewNotes`, `authorId`, `submitterId`, `reporterId`, `opinionAuthorId`, `publisherId`, `isPublisherNews`, `isPublisherContent`, `newsType`, `isFeatured`, `isReading`, `hideFromHomepage`, `displayOrder`, `slug`, `englishSlug`, `articleType`, `source`, `sourceMetadata`, `aiGenerated`, `submitForReview`, `confirmStatusDowngrade`.

القائمة المرجعية: `BOT_DRAFT_FORBIDDEN_FIELDS` في `shared/botDrafts.ts`.

### كيف تُضمن الحالة `draft` دائماً

- الإدراج يكتب `status='draft'`, `reviewStatus=null`, `publishType='instant'`, `scheduledAt=null`, `publishedAt=null`, `articleType='news'`, `newsType='regular'`, `source='bot'` — قيم ثابتة في الخدمة لا تأتي من الطلب.
- الإسناد من الخادم فقط: `authorId` و`reporterId` = حساب «صحيفة سبق» (`BOT_DRAFTS_AUTHOR_USER_ID` أو الافتراضي). البوت لا يرسلهما (`422 forbidden_fields`). عند `PATCH` يُملأ `reporterId` فقط إن كان فارغاً — اختيار المحرر لا يُستبدل. حساب الإسناد غير موجود/غير نشط → `503 author_not_configured` (نفس مسار الإنشاء).
- التحديث يضرب فقط الصفوف التي `status='draft' AND source='bot'` (شرط SQL)؛ لو نشر محرر المادة بين القراءة والكتابة يُرجع `409 not_a_draft`.
- لا يوجد أي مسار بهذا التوكن يصل إلى `publishGate` أو المجدول. المسارات الإدارية (`/api/admin/articles`) تتطلب جلسة Passport + CSRF ولا تقبل Bearer.
- الحالة الحقيقية تُعاد في كل رد (`status` + `updatable`) حتى يعرف البوت إن نُشرت المادة لاحقاً.

### مثال إنشاء

```http
POST /api/internal/bot-drafts HTTP/1.1
Host: api.sabq.org
Authorization: Bearer ****
Content-Type: application/json
User-Agent: Mozilla/5.0 (compatible; SabqBotDrafts/1.0)

{
  "title": "أمانة الرياض تطلق مبادرة لتشجير 500 حديقة",
  "content": "أعلنت أمانة منطقة الرياض اليوم عن انطلاق مبادرة...\n\nوتستهدف المبادرة...",
  "excerpt": "مبادرة جديدة لتشجير الحدائق في العاصمة.",
  "categorySlug": "local",
  "imageUrl": "https://example.com/cover.jpg",
  "keywords": ["الرياض", "تشجير"],
  "sourceUrl": "https://spa.gov.sa/...",
  "clientReference": "grok-2026-09-20-0042",
  "notes": "تحقق من الرقم 500 قبل النشر"
}
```

```json
HTTP/1.1 201 Created
{
  "id": "0d8c8a1e-6f2b-4b1e-9d2a-2f6f4f9d1a11",
  "status": "draft",
  "updatable": true,
  "title": "أمانة الرياض تطلق مبادرة لتشجير 500 حديقة",
  "subtitle": null,
  "slug": "أمانة-الرياض-تطلق-مبادرة-لتشجير-500-حديقة",
  "excerpt": "مبادرة جديدة لتشجير الحدائق في العاصمة.",
  "categoryId": "…",
  "categorySlug": "local",
  "imageUrl": "https://example.com/cover.jpg",
  "sourceUrl": "https://spa.gov.sa/...",
  "keywords": ["الرياض", "تشجير"],
  "source": "bot",
  "bot": "grok-bot",
  "clientReference": "grok-2026-09-20-0042",
  "notes": "تحقق من الرقم 500 قبل النشر",
  "editUrl": "https://sabq.org/dashboard/articles/0d8c8a1e-…/edit",
  "previewUrl": "https://sabq.org/dashboard/articles/0d8c8a1e-…/preview",
  "createdAt": "2026-09-20T10:00:00.000Z",
  "updatedAt": "2026-09-20T10:00:00.000Z"
}
```

### مثال تحديث

```http
PATCH /api/internal/bot-drafts/0d8c8a1e-6f2b-4b1e-9d2a-2f6f4f9d1a11 HTTP/1.1
Authorization: Bearer ****
Content-Type: application/json
User-Agent: Mozilla/5.0 (compatible; SabqBotDrafts/1.0)

{ "title": "أمانة الرياض تطلق مبادرة لتشجير 500 حديقة خلال عام", "excerpt": "…" }
```

الرد `200` بنفس شكل الإنشاء. `slug` لا يتغير عند تعديل العنوان (المحرر يغيّره من اللوحة إن لزم).

### مثال قراءة

`GET /api/internal/bot-drafts/<id>` → `200` بنفس الشكل. إن نشر محرر المادة: `status: "published"`, `updatable: false`.

### أكواد الأخطاء

| HTTP | `code` | متى |
|------|--------|-----|
| 400 | `validation_error` | حقل ناقص/غير صالح/غير معروف. `details` = `zod.flatten()` |
| 401 | `unauthorized` | توكن مفقود أو غير مطابق (مع `WWW-Authenticate: Bearer`) |
| 403 | `forbidden_action` | محاولة `/:id/publish` أو `/:id/schedule` أو أي فعل فرعي |
| 404 | `not_found` | المعرّف غير موجود **أو** المادة ليست من إنشاء بوت (`source != 'bot'`) — لا نكشف مسودات المحررين |
| 405 | `forbidden_action` | `PUT`/`DELETE` على `/:id` |
| 409 | `not_a_draft` | المادة لم تعد `draft` (نُشرت/جُدولت/أُرشفت). `details.status` = الحالة الحالية |
| 409 | `locked_by_editor` | محرر يفتح المسودة الآن (قفل تحرير نشط، TTL 10 دقائق). `details.editor`, `details.lockExpiresAt` |
| 422 | `forbidden_fields` | وجود حقل ممنوع. `details.fields` = القائمة |
| 422 | `category_not_found` | تصنيف غير موجود أو غير قابل للإسناد (`inactive`؛ الإنتاج يستخدم `visible`) |
| 429 | `rate_limited` | تجاوز سقف الكتابة للدقيقة لهذا البوت (افتراضي 30) |
| 503 | `not_configured` | `BOT_DRAFTS_API_TOKENS` غير مضبوط على الخادم |
| 503 | `author_not_configured` | حساب الإسناد غير موجود/غير نشط |
| 500 | `server_error` | خطأ داخلي (بلا تفاصيل) |

شكل الخطأ دائماً: `{ "code": "...", "message": "...", "details"?: {...} }`.

---

## 2) المصادقة للبوتات

**التصميم المختار: توكن Bearer ثابت لكل بوت، من متغير بيئة على Railway، بلا جلسة متصفح.** وهو أصغر مسار آمن متاح لأن:

- المشروع يستخدم النمط نفسه فعلاً لعامل محاضر الاجتماعات (`/api/internal/meetings-agent/*` + سر مشترك)؛ البادئة `/api/internal/` **معفاة أصلاً من CSRF** (`server/csrf.ts`) ومن محدد الكتابة العام (`server/index.ts`)، فلم نلمس أياً منهما.
- لا جدول جديد ولا `db:push` ولا صلاحيات RBAC جديدة: التوكن لا يملك أي صلاحية سوى ما تنفذه الخدمة (إدراج/تحديث مسودة)، ولا يُترجم لمستخدم Passport ولا `articles.publish`.
- التوكن **لا يمكنه** الوصول للمسارات الإدارية (`/api/admin/*` تتطلب جلسة) ولا لمسارات الموبايل (`/api/v1/*` تتطلب جلسة عضو).

### المتغيرات

| المتغير | القيمة | أين |
|---------|--------|-----|
| `BOT_DRAFTS_API_TOKENS` | `nashr-sabq:<token>,grok-bot:<token>` — اسم صغير `[a-z0-9_-]` ثم `:` ثم توكن ≥32 حرفاً | Railway → خدمة API → Variables |
| `BOT_DRAFTS_AUTHOR_USER_ID` | اختياري. حساب الإسناد (`articles.authorId` و`articles.reporterId`). الافتراضي حساب «صحيفة سبق» `RnP7eDOAl5T5rGpib9_8d` — نفس إسناد وكلاء البريد/الواتساب | Railway |
| `BOT_DRAFTS_WRITE_RATE_LIMIT` | اختياري. كتابات/دقيقة لكل بوت (افتراضي 30) | Railway |

توليد توكن:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### القواعد

- **لا تضع التوكن في الشات أو في الريبو أو في الـ prompt.** يُخزَّن في Railway (جهة الخادم) وفي مدير أسرار منصة البوت (متغير `SABQ_BOT_DRAFTS_TOKEN`).
- لكل بوت توكنه باسمه: الاسم يُسجَّل في `sourceMetadata.bot` وفي سجل أحداث المادة (`article_events`) وسجل النشاط، فيُعرف من أنشأ ومن عدّل.
- المقارنة ثابتة الزمن على SHA-256 ولا تُطبع التوكنات في اللوج أبداً (اللوج يذكر اسم البوت ومعرّف المادة فقط).
- التدوير: بدّل الزوج في `BOT_DRAFTS_API_TOKENS` وأعد النشر؛ لإيقاف بوت واحد احذف زوجه.
- إن رغبنا لاحقاً بحساب خدمة مستقل بدل «صحيفة سبق»: أنشئ مستخدماً (`scripts/create-reporter.ts` أو من اللوحة) واضبط `BOT_DRAFTS_AUTHOR_USER_ID`. لا يلزم أي صلاحية RBAC لهذا الحساب لأن التوكن لا يستعمل RBAC.

### CSRF

لا حاجة لإعفاء جديد: المسار تحت `/api/internal/` المعفى مسبقاً. الاختبار `tests/unit/botDrafts.test.ts` يثبت الإعفاء عبر `isCsrfExemptRequest`.

---

## 3) الربط للبوتات

الخيار المنفّذ: **(ب) عميل HTTP موثّق + curl + TypeScript + ملف OpenAPI**. لا يوجد Composio/MCP جاهز على CMS سبق، وملف OpenAPI يسمح باستيراد المسارات الثلاثة كأداة مخصصة (Custom Tool / OpenAPI action) في أي منصة بوتات تدعم ذلك.

### curl

```bash
export SABQ_BOT_DRAFTS_TOKEN='…'   # من مدير الأسرار، لا من الشات
B=https://api.sabq.org
UA='Mozilla/5.0 (compatible; SabqBotDrafts/1.0)'   # بدون User-Agent عادي قد يرد Cloudflare 1010

# إنشاء
curl -sS -X POST "$B/api/internal/bot-drafts" \
  -H "Authorization: Bearer $SABQ_BOT_DRAFTS_TOKEN" -H "Content-Type: application/json" \
  -H "User-Agent: $UA" \
  -d '{"title":"عنوان تجريبي من البوت","content":"فقرة أولى من الخبر التجريبي.\n\nفقرة ثانية.","categorySlug":"local","clientReference":"test-001"}'

# قراءة
curl -sS "$B/api/internal/bot-drafts/<id>" \
  -H "Authorization: Bearer $SABQ_BOT_DRAFTS_TOKEN" -H "User-Agent: $UA"

# تحديث
curl -sS -X PATCH "$B/api/internal/bot-drafts/<id>" \
  -H "Authorization: Bearer $SABQ_BOT_DRAFTS_TOKEN" -H "Content-Type: application/json" \
  -H "User-Agent: $UA" \
  -d '{"title":"عنوان محدث","excerpt":"مقدمة جديدة"}'

# يجب أن يفشل (422 forbidden_fields)
curl -sS -X PATCH "$B/api/internal/bot-drafts/<id>" \
  -H "Authorization: Bearer $SABQ_BOT_DRAFTS_TOKEN" -H "Content-Type: application/json" \
  -H "User-Agent: $UA" \
  -d '{"status":"published"}'
```

### TypeScript / CLI

الملف [`scripts/bot-drafts-client.ts`](../../../scripts/bot-drafts-client.ts) يصدّر `BotDraftsClient` ويعمل كأداة سطر أوامر:

```bash
export SABQ_BOT_DRAFTS_TOKEN='…'
export SABQ_API_BASE=https://api.sabq.org   # افتراضي

npx tsx scripts/bot-drafts-client.ts create --title="عنوان" --content-file=./body.txt --category-slug=local --ref=grok-001
npx tsx scripts/bot-drafts-client.ts get <id>
npx tsx scripts/bot-drafts-client.ts update <id> --title="عنوان جديد" --excerpt="مقدمة"
npx tsx scripts/bot-drafts-client.ts create --json=./draft.json   # جسم كامل من ملف
```

```ts
import { BotDraftsClient } from "./scripts/bot-drafts-client";
const client = new BotDraftsClient({ baseUrl: "https://api.sabq.org", token: process.env.SABQ_BOT_DRAFTS_TOKEN! });
const draft = await client.create({ title: "…", content: "…", categorySlug: "local", clientReference: "grok-001" });
await client.update(draft.id, { excerpt: "…" });
const status = await client.get(draft.id); // status.updatable === false بعد النشر من اللوحة
```

### تعليمات تشغيل بوت «نشر سبق»

1. اطلب من علي إضافة زوج `nashr-sabq:<token>` إلى `BOT_DRAFTS_API_TOKENS` على Railway، وضع التوكن نفسه في أسرار البوت باسم `SABQ_BOT_DRAFTS_TOKEN`.
2. في تعريف أداة البوت استورد `docs/systems/editorial/bot-drafts.openapi.yaml` أو عرّف أداتين: `create_sabq_draft` (POST) و`update_sabq_draft` (PATCH) بالحقول أعلاه.
3. تعليمة النظام للبوت (سطران):
   - «لإنشاء مسودة في سبق: `POST /api/internal/bot-drafts` مع `title` و`content` و`categorySlug` و`clientReference`، واحفظ `id` و`editUrl` من الرد وأرسلهما للمحرر.»
   - «لتحديث مسودة: `PATCH /api/internal/bot-drafts/{id}` بالحقول المتغيرة فقط. لا ترسل `status` أو أي حقل نشر؛ إن رجع 409 فالمادة نُشرت أو يحررها محرر — توقف وأبلغ.»
4. اجعل البوت يُرفق دائماً `notes` بما يجب على المحرر التحقق منه.

### تعليمات تشغيل مهندّس (Grok Bot)

نفس الخطوات مع زوج `grok-bot:<token>`، مع اعتماد `clientReference` = معرّف الطلب لدى Grok حتى تُطابَق المسودة لاحقاً من الرد. Grok يستدعي HTTP مباشرة (أو عبر `scripts/bot-drafts-client.ts` إن كان في بيئة Node) ولا يحتاج جلسة أو CSRF.

---

## 4) اختبارات القبول

| # | الخطوة | النتيجة المتوقعة |
|---|--------|------------------|
| 1 | `POST` بعنوان ومتن وتصنيف | `201` + `status: "draft"` + `editUrl`؛ تظهر المادة فوراً في `/dashboard/articles` تبويب المسودات ويفتحها `editUrl` في المحرر |
| 2 | `PATCH` بعنوان جديد ثم فتح المسودة في اللوحة | `200` والعنوان الجديد ظاهر مباشرة (كاش قوائم اللوحة يُبطل مع كل كتابة) |
| 3 | `PATCH` بـ `{"status":"published"}` أو `{"scheduledAt":…}` | `422 forbidden_fields` ولا تغيير في القاعدة |
| 4 | `POST /api/internal/bot-drafts/<id>/publish` | `403 forbidden_action` |
| 5 | بنفس التوكن: `PATCH /api/admin/articles/<id>` أو `POST /api/admin/articles` | `401` (لا جلسة) — التوكن لا يعمل على المسارات الإدارية |
| 6 | افتح المسودة في اللوحة (قفل تحرير نشط) ثم `PATCH` من البوت | `409 locked_by_editor` |
| 7 | انشر المسودة من اللوحة ثم `PATCH` من البوت | `409 not_a_draft` و`GET` يرجع `status: "published"`, `updatable: false` |
| 8 | توكن خاطئ / بدون توكن | `401` مع `Cache-Control: private, no-store` ولا يظهر أي توكن في الرد أو اللوج |
| 9 | `GET` بمعرّف مسودة أنشأها محرر (ليست من بوت) | `404` — لا كشف لمسودات المحررين |
| 10 | لوج Railway بعد الخطوات أعلاه | أسطر `[BotDrafts] created/updated draft <id> by bot=<name>` بلا توكنات |

آلياً: `npm run test:unit -- tests/unit/botDrafts.test.ts` (45 اختباراً: التوكنات، الحقول الممنوعة كلها، 401/403/405/409/422/429/503، عدم تسريب الأسرار، إعفاء CSRF، تحويل النص إلى فقرات).

---

## الحدود المعروفة (v1)

- **صورة الغلاف برابط فقط** (`imageUrl` https). رفع ملف ثنائي يحتاج مسار رفع منفصلاً (`newsImageStorageService`) — مرحلة لاحقة إن احتاجها البوت؛ حالياً يضع البوت رابطاً ويستبدله المحرر من اللوحة إن لزم.
- **أخبار عربية `news` فقط**. لا رأي/تحليل/EN/UR من هذا العقد.
- **لا idempotency على الإنشاء**: تكرار `POST` ينتج مسودتين؛ استخدم `clientReference` للمطابقة، ولا تعد المحاولة بعد `201`.
- **لا حذف**: يحذف المحرر من اللوحة.
- المحدد `express-rate-limit` في الذاكرة لكل نسخة خادم؛ مع عدة نسخ Railway السقف الفعلي ≈ السقف × عدد النسخ.

## قرارات تحتاج موافقة علي الحازمي قبل الدمج

1. **نمط المصادقة**: توكن Bearer ثابت لكل بوت من متغير بيئة (لا جدول توكنات ولا OAuth). البديل الأثقل: جدول `api_tokens` مع صلاحيات وتدوير من اللوحة — يمكن الترقية لاحقاً دون تغيير عقد البوت.
2. **الإسناد الافتراضي** لحساب «صحيفة سبق». البديل: حساب خدمة مخصص عبر `BOT_DRAFTS_AUTHOR_USER_ID`.
3. **ضبط الأسرار على Railway** (`BOT_DRAFTS_API_TOKENS`) وإعادة النشر — بدونها المسار يرد `503` ولا أثر له على التحرير الحالي.

لا تغييرات schema ولا `db:push`: التعديل الوحيد في `shared/schema.ts` نوعي (TypeScript) لحقل `sourceMetadata` (jsonb).
