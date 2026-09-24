# Bot Drafts API — مسودات فقط لبوتات «نشر سبق» ومهندّس (Grok Bot)

> آخر مراجعة: 2026-09-24 | المالك: editorial | الحالة: مسودات + تعليم «جاهز للنشر» فقط. البوت لا ينشر.

## الملخص في سطرين (للبوت)

1. **إنشاء مسودة:** `POST https://api.sabq.org/api/internal/bot-drafts` مع ترويسة `Authorization: Bearer <SABQ_BOT_DRAFTS_TOKEN>` وجسم JSON فيه `title` و`content` (وتصنيف اختياري `categorySlug`). الرد يحمل `id` و`editUrl`.
2. **تحديث مسودة:** `PATCH https://api.sabq.org/api/internal/bot-drafts/<id>` بنفس الترويسة والحقول التي تغيّرت فقط، ما دامت `draft`. ممنوع إرسال `status` أو أي حقل نشر/جدولة — يُرفض 422.
3. **جاهز للنشر (بعد اعتماد علي في المحادثة):** `PATCH https://api.sabq.org/api/internal/bot-drafts/<id>/ready` بجسم فارغ `{}`. الحالة تصبح `ready_to_publish` و`updatable: false`. هذا ليس نشراً. محرر الوردية ينشر يدوياً من لوحة «جاهز للنشر»، أو يُرجع المادة إلى `draft`.
4. **رفع صورة (غلاف أو متن):** `POST https://api.sabq.org/api/internal/bot-drafts/images` بنفس توكن Bot Drafts (`multipart/form-data`، الحقل `file`). `deliveryUrl` على `https://media.sabq.org/…` يذهب إلى `imageUrl` إن كان غلافاً، أو إلى مصفوفة `imageUrls` إن كان داخل المتن / أسفله.
5. **صور المتن ليست الغلاف.** `imageUrl` يظهر أعلى الخبر فقط. صور الجسم تُمرَّر في `imageUrls` فيلحقها الخادم أسفل المتن كوسوم `<img>` يراها المحرر والمعاينة صوراً لا كنص. لا تضع رابط https خام داخل فقرات النص.

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
| `POST` | `/api/internal/bot-drafts/images` | رفع صورة غلاف واحدة إلى R2 (`sabq-news-images` / `media.sabq.org`) عبر `newsImageStorageService` |
| `GET` | `/api/internal/bot-drafts/:id` | قراءة حالة المسودة ومعرّفها ورابط التحرير |
| `PATCH` | `/api/internal/bot-drafts/:id` | تحديث مسودة أنشأها بوت وما زالت `draft` |
| `PATCH` | `/api/internal/bot-drafts/:id/ready` | انتقال واحد: `draft` → `ready_to_publish`. جسم فارغ. لا نشر |
| أي فعل آخر | `/:id/publish` `/:id/schedule` `DELETE` `PUT` … | مرفوض عمداً: `403 forbidden_action` أو `405`. لا يوجد مسار نشر للبوت |

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
| `content` | string 20–300000 | مطلوب | HTML أو نص خام. النص الخام يتحول تلقائياً إلى فقرات `<p>` (فاصل الفقرة سطر فارغ). HTML يمر بتنقية المحرر ثم تُعاد كتابة كل `<img src="https://…">` مغلق إلى شكل صورة المحرر. |
| `contentFormat` | `"html"` \| `"text"` | اختياري | يفرض التفسير بدل الاكتشاف التلقائي (وجود وسوم = HTML). `text` يهرّب الوسوم؛ صور المتن عندها عبر `imageUrls` لا عبر لصق HTML. |
| `subtitle` | string ≤300 \| null | اختياري | عنوان فرعي |
| `excerpt` | string ≤1000 \| null | اختياري | المقدمة/الموجز |
| `categoryId` أو `categorySlug` | string | اختياري | تصنيف منشور للقرّاء (`status=visible` في الإنتاج، ويُقبل `active` تاريخياً) من `GET https://api.sabq.org/api/categories` (عام بلا مصادقة). غير موجود أو `inactive` → `422 category_not_found`. |
| `imageUrl` | https URL \| null | اختياري | صورة **الغلاف** فقط (أعلى الخبر). ارفع عبر `POST /images` ثم ضع `deliveryUrl`. لا يُنسخ تلقائياً إلى المتن. |
| `imageUrls` | https URL[] ≤20 | اختياري | صور **المتن**. كل عنصر `deliveryUrl` من `POST /images`. الخادم يلحقها أسفل الجسم بترتيب المصفوفة كعقدة TipTap `img` (انظر «صور المتن»). الرابط الموجود أصلاً داخل المتن لا يُكرَّر. |
| `keywords` | string[] ≤20 | اختياري | تُحفظ في `seo.keywords` |
| `sourceUrl` | http(s) URL \| null | اختياري | المصدر الأصلي |
| `clientReference` | string ≤120 | اختياري | معرّف البوت الداخلي للمادة (يُعاد في الرد للمطابقة) |
| `notes` | string ≤2000 \| null | اختياري | ملاحظة للمحررين (مثل: «تحقق من الأرقام») |

في `PATCH` كل الحقول اختيارية ويلزم حقل واحد على الأقل. الحقول غير المعروفة تُرفض `400`.

### الحقول الممنوعة (ترفض 422 قبل أي معالجة)

`status`, `publishType`, `scheduledAt`, `publishedAt`, `reviewStatus`, `reviewedBy`, `reviewedAt`, `reviewNotes`, `authorId`, `submitterId`, `reporterId`, `opinionAuthorId`, `publisherId`, `isPublisherNews`, `isPublisherContent`, `newsType`, `isFeatured`, `isReading`, `hideFromHomepage`, `displayOrder`, `slug`, `englishSlug`, `articleType`, `source`, `sourceMetadata`, `aiGenerated`, `submitForReview`, `confirmStatusDowngrade`.

القائمة المرجعية: `BOT_DRAFT_FORBIDDEN_FIELDS` في `shared/botDrafts.ts`.

### الحالة: `draft` ثم `ready_to_publish` — والبوت لا ينشر

`articles.status` عمود نصّي (ليس enum في Postgres). القيمة الجديدة `ready_to_publish` لا تحتاج ترحيل مخطط. `reviewStatus` يبقى لمسار مراجعة الرأي (`pending_review` …) ولا يُستخدم هنا؛ رد البوت يعرض الجاهزية في الحقل `status`.

- الإدراج يكتب `status='draft'`, `reviewStatus=null`, `publishType='instant'`, `scheduledAt=null`, `publishedAt=null`, `articleType='news'`, `newsType='regular'`, `source='bot'` — قيم ثابتة في الخدمة لا تأتي من الطلب.
- الإسناد من الخادم فقط: `authorId` و`reporterId` = حساب «صحيفة سبق» (`BOT_DRAFTS_AUTHOR_USER_ID` أو الافتراضي). البوت لا يرسلهما (`422 forbidden_fields`). عند `PATCH` المحتوى يُملأ `reporterId` فقط إن كان فارغاً — اختيار المحرر لا يُستبدل. حساب الإسناد غير موجود/غير نشط → `503 author_not_configured`.
- تحديث المحتوى يضرب فقط `status='draft' AND source='bot'`. بعد `ready_to_publish` (أو النشر/الجدولة/الأرشفة) يُرجع `409 not_a_draft` و`updatable: false` — البوت لا يكتب فوق مادة اعتمدها المحرر.
- `PATCH /:id/ready` هو الانتقال الوحيد الذي يغيّره البوت: `draft` → `ready_to_publish`، بشرط ألا يكون هناك قفل تحرير نشط (`409 locked_by_editor`). جسم فيه حقول يُرفض `400`، وحقل ممنوع مثل `status` يُرفض `422`. استدعاؤه على مادة جاهزة أو منشورة → `409 not_a_draft`.
- `/:id/publish` وأي فعل نشر/جدولة يبقى `403 forbidden_action`. لا مسار بهذا التوكن يصل إلى `publishGate` أو المجدول. النشر من لوحة التحكم بجلسة Passport فقط (`POST /api/admin/articles/:id/publish` أو زر «نشر» في المحرر).
- من `ready_to_publish` المحرر ينشر، أو يُرجع إلى `draft` (زر «إرجاع لمسودة» في قائمة «جاهز للنشر» وفي المحرر). الإرجاع يعيد `updatable: true` فيستطيع البوت التعديل من جديد. حفظ التعديلات في المحرر يُبقي `ready_to_publish` ولا يُسقطها إلى مسودة بصمت.
- القائمة: `GET /api/admin/articles?status=ready_to_publish` وشريحة «جاهز للنشر» في إدارة الأخبار. العداد `readyToPublish` في `/api/admin/articles/metrics` (مفتاح الكاش `articles:admin:metrics:v4`) ولا يُحسب ضمن المسودات. المادة لا تظهر للقرّاء لأن الواجهة العامة تشترط `published`.

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
  "imageUrl": "https://media.sabq.org/news/cover.webp",
  "imageUrls": ["https://media.sabq.org/news/body-1.webp"],
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
  "imageUrl": "https://media.sabq.org/news/cover.webp",
  "bodyImageUrls": ["https://media.sabq.org/news/body-1.webp"],
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

### رفع صورة غلاف — `POST /api/internal/bot-drafts/images`

نفس توكنات `BOT_DRAFTS_API_TOKENS` (ليس SendGrid ولا أي سر بريد). مسار وسائط فقط: يخزّن **على Cloudflare R2** (`sabq-news-images` عبر `newsImageStorageService`، الغرض `bot-article-image` + `forceR2: true`) ويعيد رابط العرض العام `https://media.sabq.org/…`؛ لا ينشئ مسودة ولا ينشر. لا يُستخدم Cloudflare Images كمخزن أساسي هنا حتى لو كانت نسبة الرول-آوت أقل من 100٪.

| العنصر | القيمة |
|--------|--------|
| Method / Path | `POST /api/internal/bot-drafts/images` |
| Authorization | `Bearer <SABQ_BOT_DRAFTS_TOKEN>` |
| Content-Type | `multipart/form-data` (يضبطه العميل تلقائياً مع الـ boundary) |
| الحقل | `file` — ملف واحد |
| الأنواع | `image/jpeg`, `image/png`, `image/webp`, `image/gif` — تُرفض غير الصور، ويُتحقق من البايتات السحرية |
| الحجم | حد أقصى **10MB** (نفس `/api/media/upload`) |
| المخزن | R2 إلزامي: `forceR2` يتجاوز `NEWS_IMAGES_R2_ROLLOUT_PERCENT` ولا يسقط على Cloudflare Images |
| `deliveryUrl` | رابط https على `https://media.sabq.org/news/…` (ليس `imagedelivery.net`) |
| CSRF | معفى عبر بادئة `/api/internal/` الحالية |
| المحدد | نفس محدد كتابة البوت (`BOT_DRAFTS_WRITE_RATE_LIMIT`، افتراضي 30/دقيقة) |

```http
POST /api/internal/bot-drafts/images HTTP/1.1
Host: api.sabq.org
Authorization: Bearer ****
Content-Type: multipart/form-data; boundary=----sabq
User-Agent: Mozilla/5.0 (compatible; SabqBotDrafts/1.0)

------sabq
Content-Disposition: form-data; name="file"; filename="cover.jpg"
Content-Type: image/jpeg

<bytes>
------sabq--
```

```json
HTTP/1.1 201 Created
{
  "deliveryUrl": "https://media.sabq.org/news/2026/09/…/w1600.webp",
  "imageId": "…",
  "filename": "cover.jpg",
  "provider": "r2",
  "thumbnailUrl": "https://media.sabq.org/news/2026/09/…/w480.webp",
  "width": 1600,
  "height": 900,
  "purpose": "bot-article-image"
}
```

مرّر `deliveryUrl` كما هو إلى `imageUrl` (غلاف) أو أدخله في `imageUrls` (متن). هذا الرابط هو عنوان R2 العام (`media.sabq.org`) وليس Cloudflare Images. إن لم يكن R2 مضبوطاً: `503 storage_unavailable`. فشل الرفع إلى R2: `502 upload_failed` (بلا بديل Images). ملف أكبر من 10MB: `400 file_too_large`. بايتات ليست صورة: `400 invalid_image`.

### صور المتن — أسفل الجسم أو داخله

الغلاف (`imageUrl`) يظهر أعلى الخبر في المعاينة والمحرر، ولا يدخل المتن. صورة داخل المقال هي عقدة TipTap `image` (`client/src/components/editor-extensions/ResizableImage.ts`): وسم `<img src>` مع `class="sabq-article-image sabq-image--center"` و`data-align="center"` و`data-width="100%"`. المعاينة (`ArticlePreview`) تعرض هذا الوسم عبر DOMPurify كصورة. رابط https خام داخل فقرة `<p>` يبقى نصاً.

المسار الرسمي للبوت — ارفع كل ملف عبر `POST /images` ثم:

```json
{
  "content": "فقرة أولى من الخبر.\n\nفقرة ثانية.",
  "imageUrl": "https://media.sabq.org/news/cover.webp",
  "imageUrls": [
    "https://media.sabq.org/news/body-1.webp",
    "https://media.sabq.org/news/body-2.webp"
  ]
}
```

الخادم يحوّل النص إلى فقرات ثم يلحق الصور **أسفل المتن** بهذا الشكل (مختصراً):

```html
<p>فقرة أولى من الخبر.</p>
<p>فقرة ثانية.</p>
<img src="https://media.sabq.org/news/body-1.webp" alt="صورة" data-align="center" data-width="100%" class="sabq-article-image sabq-image--center" style="width: 100%; float: none; margin: 1.5rem auto; max-width: 100%; height: auto;">
<img src="https://media.sabq.org/news/body-2.webp" alt="صورة" data-align="center" data-width="100%" class="sabq-article-image sabq-image--center" style="width: 100%; float: none; margin: 1.5rem auto; max-width: 100%; height: auto;">
```

ليس ألبوماً (`div[data-image-gallery]`). كل صورة عقدة `img` مستقلة مثل زر الصورة في المحرر.

لوضع صورة **داخل** المتن (بين الفقرات) أرسل `contentFormat: "html"` ووسم `<img src="https://…">` مغلقاً حيث تريدها. الخادم يبقي النص ويعيد كتابة الوسم إلى الشكل أعلاه، ويحذف `onerror` وأي `src` ليس `https://`. ثم يلحق `imageUrls` في النهاية دون تكرار رابط موجود.

`PATCH` بـ `imageUrls` وحدها (بلا `content`) يلحق الصور أسفل HTML المخزّن ولا يغيّر عرض أو محاذاة صور ضبطها المحرر. `PATCH` مع `content` يستبدل المتن ثم يلحق `imageUrls`.

`GET` لا يعيد المتن. يعيد `bodyImageUrls`: روابط `img` في الجسم بالترتيب. الغلاف لا يظهر فيها إلا إذا وُضع أيضاً في المتن.

لا تضع رابط الصورة كنص. الاستثناء الوحيد: في وضع النص، فقرة كاملة لا تحتوي إلا `https://media.sabq.org/…` تتحول إلى صورة في مكانها. جملة فيها الرابط تبقى نصاً.

وسم `<img` غير المغلق (بلا `>`) كان يبتلع الفقرات التالية داخل محلّل المعاينة وTipTap فيبدو المتن فارغاً. الخادم يسقط هذه البداية المكسورة ويبقي النص. استخدم `imageUrls` أو `<img …>` مغلقاً.

### تعليم «جاهز للنشر» — `PATCH /api/internal/bot-drafts/:id/ready`

بعد أن يعتمد علي المسودة في المحادثة، البوت يستدعي هذا المسار بجسم فارغ. لا يرسل `status` ولا متنًا.

```http
PATCH /api/internal/bot-drafts/0d8c8a1e-6f2b-4b1e-9d2a-2f6f4f9d1a11/ready HTTP/1.1
Host: api.sabq.org
Authorization: Bearer ****
Content-Type: application/json
User-Agent: Mozilla/5.0 (compatible; SabqBotDrafts/1.0)

{}
```

```json
{
  "id": "0d8c8a1e-6f2b-4b1e-9d2a-2f6f4f9d1a11",
  "status": "ready_to_publish",
  "updatable": false,
  "editUrl": "https://sabq.org/dashboard/articles/0d8c8a1e-6f2b-4b1e-9d2a-2f6f4f9d1a11/edit",
  "previewUrl": "https://sabq.org/dashboard/articles/0d8c8a1e-6f2b-4b1e-9d2a-2f6f4f9d1a11/preview"
}
```

| الحالة الحالية | النتيجة |
|----------------|---------|
| `draft` وبلا قفل | `200` و`status: "ready_to_publish"` و`updatable: false` |
| `draft` وعليها قفل محرر | `409 locked_by_editor` |
| `ready_to_publish` أو `published` / `scheduled` / `archived` | `409 not_a_draft` مع `details.status` |
| ليست من إنشاء بوت | `404 not_found` |
| `PATCH /:id/publish` | `403 forbidden_action` |

### مثال قراءة

`GET /api/internal/bot-drafts/<id>` → `200` بنفس الشكل. بعد التعليم: `status: "ready_to_publish"`, `updatable: false`. إن نشر محرر المادة: `status: "published"`, `updatable: false`.

### أكواد الأخطاء

| HTTP | `code` | متى |
|------|--------|-----|
| 400 | `validation_error` | حقل ناقص/غير صالح/غير معروف. `details` = `zod.flatten()` |
| 401 | `unauthorized` | توكن مفقود أو غير مطابق (مع `WWW-Authenticate: Bearer`) |
| 403 | `forbidden_action` | محاولة `/:id/publish` أو `/:id/schedule` أو أي فعل فرعي غير `PATCH /:id/ready` |
| 404 | `not_found` | المعرّف غير موجود **أو** المادة ليست من إنشاء بوت (`source != 'bot'`) — لا نكشف مسودات المحررين |
| 405 | `forbidden_action` | `PUT`/`DELETE` على `/:id` |
| 409 | `not_a_draft` | تحديث محتوى أو `PATCH /ready` والمادة ليست `draft` (جاهزة بالفعل، أو نُشرت/جُدولت/أُرشفت). `details.status` = الحالة الحالية |
| 409 | `locked_by_editor` | محرر يفتح المسودة الآن (قفل تحرير نشط، TTL 10 دقائق). `details.editor`, `details.lockExpiresAt` |
| 422 | `forbidden_fields` | وجود حقل ممنوع. `details.fields` = القائمة |
| 422 | `category_not_found` | تصنيف غير موجود أو غير قابل للإسناد (`inactive`؛ الإنتاج يستخدم `visible`) |
| 400 | `invalid_image` | نوع غير مسموح أو البايتات ليست JPEG/PNG/WEBP/GIF |
| 400 | `file_too_large` | الملف أكبر من 10MB |
| 429 | `rate_limited` | تجاوز سقف الكتابة للدقيقة لهذا البوت (افتراضي 30) |
| 502 | `upload_failed` | فشل رفع R2 أو لم يُرجع `deliveryUrl` على `media.sabq.org` |
| 503 | `not_configured` | `BOT_DRAFTS_API_TOKENS` غير مضبوط على الخادم |
| 503 | `author_not_configured` | حساب الإسناد غير موجود/غير نشط |
| 503 | `storage_unavailable` | إعدادات `NEWS_IMAGES_R2_*` ناقصة — المسار لا يستخدم Cloudflare Images بديلاً |
| 500 | `server_error` | خطأ داخلي (بلا تفاصيل) |

شكل الخطأ دائماً: `{ "code": "...", "message": "...", "details"?: {...} }`.

---

## 2) المصادقة للبوتات

**التصميم المختار: توكن Bearer ثابت لكل بوت، من متغير بيئة على Railway، بلا جلسة متصفح.** وهو أصغر مسار آمن متاح لأن:

- المشروع يستخدم النمط نفسه فعلاً لعامل محاضر الاجتماعات (`/api/internal/meetings-agent/*` + سر مشترك)؛ البادئة `/api/internal/` **معفاة أصلاً من CSRF** (`server/csrf.ts`) ومن محدد الكتابة العام (`server/index.ts`)، فلم نلمس أياً منهما.
- لا جدول جديد ولا `db:push` ولا صلاحيات RBAC جديدة: `ready_to_publish` قيمة نصية في `articles.status` القائم. التوكن لا يُترجم لمستخدم Passport ولا يملك `articles.publish`.
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

الخيار المنفّذ: **(ب) عميل HTTP موثّق + curl + TypeScript + ملف OpenAPI**. لا يوجد Composio/MCP جاهز على CMS سبق، وملف OpenAPI يسمح باستيراد المسارات (بما فيها `PATCH /ready`) كأداة مخصصة (Custom Tool / OpenAPI action) في أي منصة بوتات تدعم ذلك.

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

# تعليم جاهز للنشر — جسم فارغ، لا ينشر
curl -sS -X PATCH "$B/api/internal/bot-drafts/<id>/ready" \
  -H "Authorization: Bearer $SABQ_BOT_DRAFTS_TOKEN" -H "Content-Type: application/json" \
  -H "User-Agent: $UA" \
  -d '{}'

# يجب أن يفشل (403) — لا نشر عبر البوت
curl -sS -o /dev/null -w "%{http_code}\n" -X PATCH "$B/api/internal/bot-drafts/<id>/publish" \
  -H "Authorization: Bearer $SABQ_BOT_DRAFTS_TOKEN" -H "Content-Type: application/json" \
  -H "User-Agent: $UA" \
  -d '{}'

# يجب أن يفشل (422 forbidden_fields)
curl -sS -X PATCH "$B/api/internal/bot-drafts/<id>" \
  -H "Authorization: Bearer $SABQ_BOT_DRAFTS_TOKEN" -H "Content-Type: application/json" \
  -H "User-Agent: $UA" \
  -d '{"status":"published"}'

# رفع غلاف وصورة متن ثم إنشاء مسودة
DELIVERY=$(curl -sS -X POST "$B/api/internal/bot-drafts/images" \
  -H "Authorization: Bearer $SABQ_BOT_DRAFTS_TOKEN" -H "User-Agent: $UA" \
  -F "file=@./cover.jpg;type=image/jpeg" | jq -r .deliveryUrl)
BODY=$(curl -sS -X POST "$B/api/internal/bot-drafts/images" \
  -H "Authorization: Bearer $SABQ_BOT_DRAFTS_TOKEN" -H "User-Agent: $UA" \
  -F "file=@./body.jpg;type=image/jpeg" | jq -r .deliveryUrl)
curl -sS -X POST "$B/api/internal/bot-drafts" \
  -H "Authorization: Bearer $SABQ_BOT_DRAFTS_TOKEN" -H "Content-Type: application/json" \
  -H "User-Agent: $UA" \
  -d "{\"title\":\"عنوان\",\"content\":\"فقرة أولى من الخبر التجريبي.\\n\\nفقرة ثانية.\",\"imageUrl\":\"$DELIVERY\",\"imageUrls\":[\"$BODY\"]}"
```

### TypeScript / CLI

الملف [`scripts/bot-drafts-client.ts`](../../../scripts/bot-drafts-client.ts) يصدّر `BotDraftsClient` ويعمل كأداة سطر أوامر:

```bash
export SABQ_BOT_DRAFTS_TOKEN='…'
export SABQ_API_BASE=https://api.sabq.org   # افتراضي

npx tsx scripts/bot-drafts-client.ts create --title="عنوان" --content-file=./body.txt --category-slug=local --image-urls="https://media.sabq.org/news/a.webp" --ref=grok-001
npx tsx scripts/bot-drafts-client.ts get <id>
npx tsx scripts/bot-drafts-client.ts ready <id>
npx tsx scripts/bot-drafts-client.ts update <id> --title="عنوان جديد" --excerpt="مقدمة"
npx tsx scripts/bot-drafts-client.ts create --json=./draft.json   # جسم كامل من ملف
npx tsx scripts/bot-drafts-client.ts upload --file=./cover.jpg   # يعيد deliveryUrl
```

```ts
import { readFileSync } from "node:fs";
import { BotDraftsClient } from "./scripts/bot-drafts-client";
const client = new BotDraftsClient({ baseUrl: "https://api.sabq.org", token: process.env.SABQ_BOT_DRAFTS_TOKEN! });
const uploaded = await client.uploadImage({ data: readFileSync("./cover.jpg"), filename: "cover.jpg" });
const bodyImage = await client.uploadImage({ data: readFileSync("./body.jpg"), filename: "body.jpg" });
const draft = await client.create({ title: "…", content: "…", categorySlug: "local", imageUrl: uploaded.deliveryUrl, imageUrls: [bodyImage.deliveryUrl], clientReference: "grok-001" });
await client.update(draft.id, { excerpt: "…" });
const status = await client.get(draft.id); // status.updatable === false بعد النشر من اللوحة
```

### تعليمات تشغيل بوت «نشر سبق»

1. اطلب من علي إضافة زوج `nashr-sabq:<token>` إلى `BOT_DRAFTS_API_TOKENS` على Railway، وضع التوكن نفسه في أسرار البوت باسم `SABQ_BOT_DRAFTS_TOKEN`.
2. في تعريف أداة البوت استورد `docs/systems/editorial/bot-drafts.openapi.yaml` أو عرّف ثلاث أدوات: `create_sabq_draft` (POST) و`update_sabq_draft` (PATCH) و`upload_sabq_draft_image` (POST `/images`).
3. تعليمة النظام للبوت:
   - «لإنشاء مسودة في سبق: `POST /api/internal/bot-drafts` مع `title` و`content` و`categorySlug` و`clientReference`، واحفظ `id` و`editUrl` من الرد وأرسلهما للمحرر.»
   - «لتحديث مسودة: `PATCH /api/internal/bot-drafts/{id}` بالحقول المتغيرة فقط. لا ترسل `status` أو أي حقل نشر؛ إن رجع 409 فالمادة نُشرت أو يحررها محرر — توقف وأبلغ.»
   - «لرفع صورة: `POST /api/internal/bot-drafts/images` بنفس التوكن وحقل `file`. الغلاف = `deliveryUrl` في `imageUrl`. صور المتن = نفس الرابط داخل `imageUrls` (تظهر أسفل الجسم كصور لا كنص). لا تلصق رابط https داخل فقرات `content`.»
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
| 4 | `POST` أو `PATCH /api/internal/bot-drafts/<id>/publish` | `403 forbidden_action` |
| 4b | `PATCH /:id/ready` بجسم `{}` على مسودة بلا قفل | `200` و`status: "ready_to_publish"` و`updatable: false`؛ تظهر في لوحة «جاهز للنشر» لا في المسودات |
| 4c | `PATCH` محتوى بعد الجاهزية، أو `PATCH /ready` مرة ثانية | `409 not_a_draft` |
| 4d | من اللوحة: نشر المادة الجاهزة، أو «إرجاع لمسودة» | النشر عبر جلسة المحرر فقط؛ الإرجاع يعيد `draft` و`updatable: true` |
| 5 | بنفس التوكن: `PATCH /api/admin/articles/<id>` أو `POST /api/admin/articles` | `401` (لا جلسة) — التوكن لا يعمل على المسارات الإدارية |
| 6 | افتح المسودة في اللوحة (قفل تحرير نشط) ثم `PATCH` من البوت | `409 locked_by_editor` |
| 7 | انشر المسودة من اللوحة ثم `PATCH` من البوت | `409 not_a_draft` و`GET` يرجع `status: "published"`, `updatable: false` |
| 8 | توكن خاطئ / بدون توكن | `401` مع `Cache-Control: private, no-store` ولا يظهر أي توكن في الرد أو اللوج |
| 9 | `GET` بمعرّف مسودة أنشأها محرر (ليست من بوت) | `404` — لا كشف لمسودات المحررين |
| 10 | لوج Railway بعد الخطوات أعلاه | أسطر `[BotDrafts] created/updated draft` و`marked ready` بلا توكنات |
| 11 | `POST` بمتن نصي و`imageUrls` من `deliveryUrl` | `201` و`bodyImageUrls` فيها الروابط بالترتيب؛ معاينة اللوحة تعرض صوراً أسفل المتن لا نص الرابط. الغلاف يبقى في `imageUrl` فقط |

آلياً: `npm run test:unit -- tests/unit/botDrafts.test.ts` (التوكنات، الحقول الممنوعة كلها، 401/403/405/409/422/429/503، رفع الصور مع تخزين وهمي، عدم تسريب الأسرار، إعفاء CSRF، تحويل النص إلى فقرات، إلحاق `imageUrls` كوسوم محرر، بقاء المتن مع `<img>`، إسقاط `<img` المكسور).

---

## الحدود المعروفة (v1)

- **صورة الغلاف:** ارفع ملفاً عبر `POST /api/internal/bot-drafts/images` (10MB، JPEG/PNG/WEBP/GIF) إلى R2 (`sabq-news-images`) ثم مرّر `deliveryUrl` (`https://media.sabq.org/news/…`) كـ `imageUrl`. لا نشر ولا جدول من مسار الرفع، ولا تخزين أساسي على Cloudflare Images. GIF مقبول هنا فقط لأن المسار مصادق للبوت ومحدود الحجم؛ مسار `/api/media/upload` العام ما زال يرفض GIF (تدقيق M8).
- **صور المتن:** نفس الرفع، والروابط في `imageUrls` (حتى 20) أو `<img src="https://…">` مغلق داخل HTML. تُخزَّن كعقدة صورة المحرر أسفل المتن أو في موضع الوسم. `GET` يعيد `bodyImageUrls` لا المتن. لا ألبوم منفصل ولا نسخ تلقائي للغلاف إلى الجسم.
- **أخبار عربية `news` فقط**. لا رأي/تحليل/EN/UR من هذا العقد.
- **لا idempotency على الإنشاء**: تكرار `POST` ينتج مسودتين؛ استخدم `clientReference` للمطابقة، ولا تعد المحاولة بعد `201`.
- **لا حذف**: يحذف المحرر من اللوحة.
- المحدد `express-rate-limit` في الذاكرة لكل نسخة خادم؛ مع عدة نسخ Railway السقف الفعلي ≈ السقف × عدد النسخ.

## قرارات تحتاج موافقة علي الحازمي قبل الدمج

1. **نمط المصادقة**: توكن Bearer ثابت لكل بوت من متغير بيئة (لا جدول توكنات ولا OAuth). البديل الأثقل: جدول `api_tokens` مع صلاحيات وتدوير من اللوحة — يمكن الترقية لاحقاً دون تغيير عقد البوت.
2. **الإسناد الافتراضي** لحساب «صحيفة سبق». البديل: حساب خدمة مخصص عبر `BOT_DRAFTS_AUTHOR_USER_ID`.
3. **ضبط الأسرار على Railway** (`BOT_DRAFTS_API_TOKENS`) وإعادة النشر — بدونها المسار يرد `503` ولا أثر له على التحرير الحالي.

لا تغييرات schema ولا `db:push`: `ready_to_publish` قيمة جديدة في عمود `articles.status` النصي، وتعليق الحقل وZod لوحة التحكم فقط. `sourceMetadata` يبقى jsonb بلا DDL.
