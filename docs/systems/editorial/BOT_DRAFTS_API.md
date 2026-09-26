# Bot Drafts API — مسودات ونشر وجدولة وإدارة بعد النشر لبوت «نشر سبق»

> آخر مراجعة: 2026-09-26 | المالك: editorial | الحالة: مسودة، جاهز للمناوب، نشر، جدولة، تعديل المحتوى بعد النشر، ثم أرشفة وتعديل الموعد والظهور.

## الملخص (للبوت)

1. **إنشاء مسودة:** `POST https://api.sabq.org/api/internal/bot-drafts` مع ترويسة `Authorization: Bearer <SABQ_BOT_DRAFTS_TOKEN>` وجسم JSON فيه `title` و`content` (وتصنيف اختياري `categorySlug`). الرد يحمل `id` و`editUrl`.
2. **تحديث المحتوى:** `PATCH https://api.sabq.org/api/internal/bot-drafts/<id>` بنفس الترويسة والحقول التي تغيّرت فقط. يعمل على `draft`، وعلى `published` إن كان `source=bot`. ممنوع إرسال `status` أو أي حقل نشر/جدولة في الجسم — يُرفض 422. على المنشور: العنوان والمتن والموجز والصورة والكلمات والمصدر فقط؛ `categorySlug` مرفوض 422. الحالة تبقى `published` والرابط و`publishedAt` لا يتغيران.
3. **نشر فوري:** `POST https://api.sabq.org/api/internal/bot-drafts/<id>/publish` بجسم فارغ `{}`. يعمل على `draft` أو `ready_to_publish` فقط. الرد: `status: "published"` و`updatable: true` (البوت يستطيع بعدها تعديل المحتوى) و`publicUrl` (رابط القارئ).
4. **جدولة:** `POST https://api.sabq.org/api/internal/bot-drafts/<id>/schedule` بجسم `{ "publishAt": "2026-09-24T18:30:00+03:00" }`. وقت الرياض يُرسل بإزاحة `+03:00` أو ما يعادله UTC (`Z`). الماضي يُرفض 400. الرد: `status: "scheduled"` و`scheduledAt` و`editUrl`.
5. **تغيير الموعد:** `PATCH .../<id>/schedule` بنفس جسم `publishAt`، والمادة حالتها `scheduled` فقط.
6. **إلغاء الجدولة:** `DELETE .../<id>/schedule` بجسم فارغ. تعود `draft` ولا تُحذف.
7. **أرشفة مادة منشورة:** `POST .../<id>/archive` بجسم `{}` أو `{ "reason": "…" }`. أرشفة ناعمة (`archived`) مثل اللوحة. `DELETE /<id>` يبقى 405 ولا يحذف الصف.
8. **الظهور بعد النشر:** `PATCH .../<id>/visibility` بحقول `isFeatured` و/أو `newsType` (`breaking`|`regular`) و/أو `hideFromHomepage`. تعليم العاجل لا يرسل إشعار القرّاء.
9. **جاهز للمناوب (بدون نشر):** `PATCH .../<id>/ready` بجسم فارغ `{}`. الحالة `ready_to_publish`. محرر الوردية ينشر من اللوحة، أو البوت ينشر/يجدول لاحقاً.
10. **رفع صورة:** `POST .../images` بنفس التوكن. `deliveryUrl` غلاف (`imageUrl`) أو متن (`imageUrls`).

كل المسارات أعلاه تعمل فقط على مادة `source=bot`، باستثناء `PATCH /:id` على خبر منشور ليس للبوت: يرد `409 not_a_draft` لا `404`. بقية صفوف المحرر تبقى `404 not_found`. قفل التحرير النشط يُرجع `409 locked_by_editor`.

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
| `PATCH` | `/api/internal/bot-drafts/:id` | تحديث محتوى مسودة `draft` أو خبر `published` أنشأه البوت. نفس شكل الجسم |
| `PATCH` | `/api/internal/bot-drafts/:id/ready` | انتقال واحد: `draft` → `ready_to_publish`. جسم فارغ. لا نشر |
| `POST` | `/api/internal/bot-drafts/:id/publish` | نشر فوري. جسم فارغ `{}`. من `draft` أو `ready_to_publish` |
| `POST` | `/api/internal/bot-drafts/:id/schedule` | جدولة أولى. الجسم `{ "publishAt": "<ISO-8601 مع منطقة>" }` من `draft` أو `ready_to_publish` |
| `PATCH` | `/api/internal/bot-drafts/:id/schedule` | تغيير موعد مادة `scheduled`. نفس جسم `publishAt` |
| `DELETE` | `/api/internal/bot-drafts/:id/schedule` | إلغاء الجدولة والعودة إلى `draft`. جسم فارغ. لا حذف للصف |
| `POST` | `/api/internal/bot-drafts/:id/archive` | أرشفة ناعمة لمادة `published`. الجسم `{}` أو `{ "reason": "…" }` |
| `PATCH` | `/api/internal/bot-drafts/:id/visibility` | مميز / عاجل / إخفاء الرئيسية لمادة `published` |
| أي فعل آخر | `PATCH /:id/publish` و`DELETE /:id` و`PUT` و`/:id/submit-review` … | `403 forbidden_action` أو `405`. `DELETE /:id` لا يحذف ولا يؤرشف |

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

### الحالة: مسودة، جاهزية، نشر، جدولة

`articles.status` عمود نصّي (ليس enum في Postgres). القيمة الجديدة `ready_to_publish` لا تحتاج ترحيل مخطط. `reviewStatus` يبقى لمسار مراجعة الرأي (`pending_review` …) ولا يُستخدم هنا؛ رد البوت يعرض الجاهزية في الحقل `status`.

- الإدراج يكتب `status='draft'`, `reviewStatus=null`, `publishType='instant'`, `scheduledAt=null`, `publishedAt=null`, `articleType='news'`, `newsType='regular'`, `source='bot'` — قيم ثابتة في الخدمة لا تأتي من الطلب.
- الإسناد من الخادم فقط: `authorId` و`reporterId` = حساب «صحيفة سبق» (`BOT_DRAFTS_AUTHOR_USER_ID` أو الافتراضي). البوت لا يرسلهما (`422 forbidden_fields`). عند `PATCH` المحتوى يُملأ `reporterId` فقط إن كان فارغاً — اختيار المحرر لا يُستبدل. حساب الإسناد غير موجود/غير نشط → `503 author_not_configured`.
- تحديث المحتوى يضرب `source='bot'` في `draft` أو `published`. بعد `ready_to_publish` أو الجدولة أو الأرشفة أو الحذف يُرجع `409 not_a_draft`. خبر منشور ليس `source=bot` يُرجع `409 not_a_draft` أيضاً. صف محرر في حالة أخرى يبقى `404`.
- على `published`: الحقول المسموحة `title`, `subtitle`, `excerpt`, `content`, `contentFormat`, `sourceUrl`, `imageUrl`, `keywords`. `categorySlug` و`categoryId` و`imageUrls` و`clientReference` و`notes` تُرفض `422 forbidden_fields` — نقل التصنيف يغيّر أرشيف القسم وخلاصة RSS و`articleSection` وليس تعديلاً نصياً آمناً على مسار إبطال كاش حفظ المحرر. `status` و`publishedAt` و`slug` لا تُكتب. `excerpt` يزامن `aiSummary` ويمسح `aiBullets` كما يفعل حفظ اللوحة. `updatedAt` يتقدم، و`seo_metadata.editorialModifiedAt` يُدمج ذرياً عند تغيّر حقل ظاهر (مصدر `dateModified` العربي) عبر `buildEditorialMetadataUpdate`. لا جدول مراجعات منفصل: السجل هو `article_events` و`activity_logs` مثل حفظ المحرر، عبر `recordEvent`.
- إبطال الكاش بعد تعديل المنشور هو مسار `PATCH /api/admin/articles/:id`: `invalidateArticleWrite` (ذاكرة القوائم والمقال بما فيها نافذة العشر ثوانٍ، جيل seo-meta، Redis pub/sub، purge Cloudflare للرئيسية ولـ`slug`/`englishSlug`) ثم حذف `lite-feed`. لا مسح لخرائط الموقع في Redis ولا لذاكرة `sitemap-news` لأن حفظ المحتوى في اللوحة لا يمسحها. لا إشعار دفع ولا IndexNow ولا إعادة نشر.
- `PATCH /:id/ready` ينقل `draft` → `ready_to_publish` فقط، بلا `publishedAt` وبلا مرور على ناشر الإنتاج. قفل تحرير نشط → `409 locked_by_editor`. جسم فيه حقول → `400`، وحقل ممنوع مثل `status` → `422`.
- `POST /:id/publish` و`POST /:id/schedule` يعملان على `source=bot` في `draft` أو `ready_to_publish`. صف محرر → `404 not_found`. منشور أو مجدول أو مؤرشف → `409 not_a_draft`. قفل تحرير → `409 locked_by_editor`.
- النشر الفوري يكتب نفس أعمدة زر «نشر» في اللوحة: `status=published` و`publishType=instant` و`publishedAt` الآن و`displayOrder` بثواني يونكس، ثم يُبطل كاش القرّاء وCDN (`invalidateArticleWrite`) ويُرسل IndexNow على `englishSlug`. الإسناد لا يتغير.
- الجدولة تكتب `status=scheduled` و`publishType=scheduled` و`scheduledAt`. ناشر المواد المجدولة (`publishScheduledArticles`) يرقّيها عند حلول الموعد كما لو جدولها محرر. لا نشر فوري من هذا المسار.
- تفويض البوت هو توكن Bearer لا جلسة Passport ولا `denyPublish`. بوابة الترخيص المهني تُفحص على صاحب الاسم؛ حساب «صحيفة سبق» مؤسسي ومُعفى. مراسل بدّله المحرر بلا ترخيص ساري → `403 license_required`.
- من `ready_to_publish` المحرر ما زال يستطيع النشر من اللوحة أو الإرجاع إلى `draft` (يعيد `updatable: true`). حفظ المحرر يُبقي الجاهزية.
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

الرد `200` بنفس شكل الإنشاء، ويضيف `status` و`publishedAt` و`updatable`. على المسودة `updatable: true`. على الخبر المنشور الذي أنشأه البوت `status` يبقى `"published"` و`updatable: true` و`publishedAt` والـ`slug` و`publicUrl` لا تتغير حتى لو تغيّر العنوان (المحرر يغيّر الرابط من اللوحة إن لزم). `categorySlug` على المنشور → `422 forbidden_fields`. مؤرشف أو محذوف → `409 not_a_draft`.

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
| `PATCH /:id/publish` (الفعل الخطأ) | `403 forbidden_action` — النشر الصحيح `POST` |

### مثال قراءة

### نشر فوري — `POST /api/internal/bot-drafts/:id/publish`

جسم فارغ. لا ترسل `status` ولا `authorId`. الخادم ينشر المادة الآن ويبقي إسناد «صحيفة سبق».

```http
POST /api/internal/bot-drafts/0d8c8a1e-6f2b-4b1e-9d2a-2f6f4f9d1a11/publish HTTP/1.1
Host: api.sabq.org
Authorization: Bearer ****
Content-Type: application/json
User-Agent: Mozilla/5.0 (compatible; SabqBotDrafts/1.0)

{}
```

```json
{
  "id": "0d8c8a1e-6f2b-4b1e-9d2a-2f6f4f9d1a11",
  "status": "published",
  "updatable": false,
  "editUrl": "https://sabq.org/dashboard/articles/0d8c8a1e-6f2b-4b1e-9d2a-2f6f4f9d1a11/edit",
  "publicUrl": "https://sabq.org/article/abc12xy",
  "publishedAt": "2026-09-24T12:00:00.000Z",
  "scheduledAt": null
}
```

`publicUrl` هو رابط القارئ: `{PUBLIC_SITE_URL أو https://sabq.org}/article/{englishSlug}`. يُفضَّل `englishSlug` لأن الرابط العربي (`slug`) يُحوَّل 301 إليه. الصفحة العامة تعرض المادة عندما `status` هي `published`.

| الحالة | النتيجة |
|--------|---------|
| `draft` أو `ready_to_publish` وبلا قفل | `200` و`status: "published"` و`updatable: true` و`publicUrl` |
| قفل محرر | `409 locked_by_editor` |
| `published` / `scheduled` / `archived` | `409 not_a_draft` مع `details.status` |
| ليست `source=bot` | `404 not_found` |
| جسم فيه حقول محتوى | `400 validation_error` |
| جسم فيه `status` أو `authorId` | `422 forbidden_fields` |
| `PATCH /:id/publish` | `403 forbidden_action` |

### جدولة — `POST /api/internal/bot-drafts/:id/schedule`

```json
{ "publishAt": "2026-09-24T18:30:00+03:00" }
```

`2026-09-24T18:30:00+03:00` هو 18:30 بتوقيت الرياض ويساوي `2026-09-24T15:30:00Z`. الوقت بلا `Z` أو `±hh:mm` مرفوض حتى لا يُفسَّر كتوقيت الخادم. موعد في الماضي أو مساوٍ للآن → `400` ورسالة تذكر `+03:00`.

النتيجة: `status: "scheduled"` و`publishType=scheduled` و`scheduledAt` المحفوظ. عند حلول الموعد ينشرها عامل `publishScheduledArticles` (نفس مسار جدولة المحرر: كاش، تنبيهات، ترقية إلى `published`). الرد يؤكد `scheduledAt` و`editUrl` و`publicUrl` (الرابط نفسه يُفتح بعد النشر). `updatable: false`.

نفس قيود القفل والمصدر والحالة كالنشر الفوري. `scheduledAt` داخل الجسم يبقى `422 forbidden_fields`؛ الحقل المقبول اسمه `publishAt` فقط.

`GET /api/internal/bot-drafts/<id>` → `200` بنفس الشكل، ويضيف `isFeatured` و`newsType` و`hideFromHomepage`. بعد التعليم: `status: "ready_to_publish"`, `updatable: false`. بعد النشر: `status: "published"` و`updatable: true` و`publicUrl`. بعد الجدولة: `status: "scheduled"` و`scheduledAt` و`updatable: false`. بعد إلغاء الجدولة: `status: "draft"` و`updatable: true` و`scheduledAt: null`. بعد الأرشفة: `status: "archived"` و`updatable: false`.

### تغيير موعد الجدولة — `PATCH /api/internal/bot-drafts/:id/schedule`

نفس جسم الجدولة الأولى، وعلى مادة `source=bot` حالتها `scheduled` فقط:

```json
{ "publishAt": "2026-09-24T21:00:00+03:00" }
```

الوقت بلا إزاحة أو في الماضي → `400 validation_error`. `scheduledAt` داخل الجسم → `422 forbidden_fields`؛ الاسم المقبول `publishAt`. الرد `200`: `status` تبقى `"scheduled"` و`scheduledAt` الجديد و`updatable: false`. لا يُعاد تنبيه «تمت الجدولة» لأن الحالة لم تنتقل إلى `scheduled` من حالة أخرى (نفس سلوك حفظ المحرر لموعد قائم). الكرون `publishScheduledArticles` ينشر عند الموعد الجديد.

| الحالة | النتيجة |
|--------|---------|
| `scheduled` وبلا قفل ووقت مستقبلي بإزاحة | `200` و`scheduledAt` الجديد |
| قفل محرر | `409 locked_by_editor` |
| ليست `scheduled` (مسودة أو منشورة أو مؤرشفة) | `409 not_scheduled` مع `details.status` |
| ليست `source=bot` | `404 not_found` |

### إلغاء الجدولة — `DELETE /api/internal/bot-drafts/:id/schedule`

جسم فارغ `{}`. المادة تعود `draft` (`publishType=instant` و`scheduledAt=null`) فيقدر البوت أن يعدّل محتواها أو ينشرها أو يجدولها من جديد. الصف لا يُحذف ولا يُؤرشف. لا تنبيه بريد لأن الهبوط من `scheduled` إلى `draft` في اللوحة لا يُطلق تنبيه أصحاب المصلحة.

```http
DELETE /api/internal/bot-drafts/0d8c8a1e-6f2b-4b1e-9d2a-2f6f4f9d1a11/schedule HTTP/1.1
Host: api.sabq.org
Authorization: Bearer ****
Content-Type: application/json
User-Agent: Mozilla/5.0 (compatible; SabqBotDrafts/1.0)

{}
```

```json
{
  "status": "draft",
  "updatable": true,
  "scheduledAt": null,
  "publishedAt": null
}
```

| الحالة | النتيجة |
|--------|---------|
| `scheduled` وبلا قفل | `200` و`status: "draft"` و`updatable: true` |
| قفل محرر | `409 locked_by_editor` |
| ليست `scheduled` | `409 not_scheduled` |
| ليست `source=bot` | `404 not_found` |
| جسم فيه `status` | `422 forbidden_fields` |

### أرشفة مادة منشورة — `POST /api/internal/bot-drafts/:id/archive`

هذا هو حذف البوت. يطابق أرشفة لوحة الأخبار (`PATCH /api/admin/articles/:id` بحالة `archived`، و`POST /api/admin/articles/:id/archive`): `status=archived` و`reviewStatus=null`. لا `DELETE` من جدول `articles`. المحرر يستطيع لاحقاً استعادتها من اللوحة (`POST /api/admin/articles/:id/restore` يعيدها `draft`). `DELETE /api/internal/bot-drafts/:id` يبقى `405` حتى لا يُفهم كحذف نهائي.

جسم فارغ، أو سبب اختياري يُحفظ في `reviewNotes` (الحد 1000 حرف) مثل ملاحظة الأرشفة في اللوحة:

```json
{ "reason": "الخبر مكرر وتم نشر النسخة المعتمدة" }
```

بعد الأرشفة تختفي المادة من الموقع بالطريقة نفسها التي تختفي بها أرشفة المحرر، لأن الرئيسية وشريط العاجل وخلاصات RSS وخرائط الموقع كلها تشترط `status=published`. صفحة SSR (`seo-bundle`) ترد 404 لغير المنشور. إبطال الكاش هو `invalidateArticleWrite` بسبب يحوي `archive` (بلا تدفئة لصفحة غادرت الموقع) بالإضافة إلى مسح كاش `sitemap-news` في الذاكرة وكاش Redis لخرائط المقالات العربية وفهرسها، وتطهير Cloudflare لـ `/sitemap-news.xml` و`/sitemap.xml` ودلو المقال الذي يحوي المعرّف و`/api/rss/articles`. أرشفة اللوحة اليوم لا تُسقط كاش الخرائط ذا الست ساعات بنفسها؛ مسار البوت يسقطه حتى لا يبقى الرابط في الخريطة بعد الأرشفة.

تنبيه صاحب الاسم (حساب «صحيفة سبق») بالدفع والبريد يُرسل كما في أرشفة اللوحة العربية. لا إشعار عام للقرّاء بأن الخبر حُذف.

| الحالة | النتيجة |
|--------|---------|
| `published` وبلا قفل | `200` و`status: "archived"` و`updatable: false` |
| قفل محرر | `409 locked_by_editor` |
| ليست منشورة | `409 not_published` مع `details.status`. إن كانت `scheduled` فالرسالة تدل على `PATCH/DELETE /schedule` |
| ليست `source=bot` | `404 not_found` |
| `status` أو `reviewNotes` في الجسم | `422 forbidden_fields`. السبب اسمه `reason` |
| `DELETE /:id` | `405 forbidden_action` — لا حذف |

### الظهور — `PATCH /api/internal/bot-drafts/:id/visibility`

لمادة `published` و`source=bot` فقط. الحقول هي أعمدة المحرر العربي نفسها، وحقل واحد على الأقل:

| الحقل | العمود | معنى `true` / القيمة |
|-------|--------|----------------------|
| `isFeatured` | `articles.isFeatured` | مميز. مطابق `POST /api/admin/articles/:id/feature` بجسم `{ "featured": true/false }` |
| `newsType` | `articles.newsType` | `"breaking"` عاجل أو `"regular"`. المحرر لا يستخدم القيمة القديمة `"featured"` هنا؛ التمييز حقل `isFeatured`. مطابق قلب `POST /toggle-breaking` لكن بالقيمة الصريحة لا بالقلب الأعمى |
| `hideFromHomepage` | `articles.hideFromHomepage` | `true` يخفي الخبر من الرئيسية وشريط العاجل ويبقي رابطه المباشر. مطابق مربع المحرر |

```json
{ "isFeatured": true, "newsType": "breaking", "hideFromHomepage": false }
```

لإلغاء العاجل: `{ "newsType": "regular" }`. لإظهاره في الرئيسية من جديد: `{ "hideFromHomepage": false }`.

**الإشعارات:** تعليم العاجل أو إلغاؤه، والتمييز، وإخفاء الرئيسية **لا ترسل إشعار دفع للقرّاء**. زرّا اللوحة `POST /feature` و`POST /toggle-breaking` لا يرسلان دفعاً؛ دفع العاجل يخرج فقط عند **النشر** إذا كانت `newsType=breaking` في تلك اللحظة (`POST /publish` أو كرون الجدولة). مسار البوت يطابق ذلك عمداً: وسم خبر منشور بأنه عاجل لا يعيد بث الإشعار. إبطال الكاش يطابق اللوحة (`invalidateArticleWrite` + `lite-feed`). عند **إلغاء** العاجل يُطهَّر شريط العاجل على Cloudflare أيضاً، لأن إبطال اللوحة يمرّر الصف بعد التحديث فلم يعد `breaking` وقد يترك نسخة الحافة حتى انتهاء عمرها. تغيير `newsType` يُنسخ إلى الترجمة الإنجليزية المرتبطة (`en_articles.seoMetadata.sourceArticleId`) مثل زر العاجل العربي. `isFeatured` و`hideFromHomepage` لا يُنسخان إلى الإنجليزية، مثل اللوحة العربية.

إخفاء الرئيسية لا يُخرج الخبر من RSS ولا من رابطه؛ استعلام RSS يشترط `published` فقط. الرئيسية وشريط العاجل يشترطان `hideFromHomepage=false`.

هذه الحقول الثلاثة ممنوعة في جسم الإنشاء والتحديث والنشر (422). الاستثناء هذا المسار فقط.

| الحالة | النتيجة |
|--------|---------|
| `published` وبلا قفل وحقل ظهور واحد على الأقل | `200` والقيم الجديدة في `isFeatured` / `newsType` / `hideFromHomepage` |
| جسم فارغ أو `newsType: "featured"` | `400 validation_error` |
| `status` أو `authorId` مع حقل ظهور | `422 forbidden_fields` |
| قفل محرر | `409 locked_by_editor` |
| ليست منشورة | `409 not_published` |
| ليست `source=bot` | `404 not_found` |

### أكواد الأخطاء

| HTTP | `code` | متى |
|------|--------|-----|
| 400 | `validation_error` | حقل ناقص/غير صالح/غير معروف. `details` = `zod.flatten()` |
| 401 | `unauthorized` | توكن مفقود أو غير مطابق (مع `WWW-Authenticate: Bearer`) |
| 403 | `forbidden_action` | فعل فرعي غير معروف، أو `PATCH/PUT/DELETE` على `/publish` أو `/schedule` |
| 403 | `license_required` | صاحب الاسم الظاهر بلا ترخيص مهني ساري. حساب «صحيفة سبق» لا يُرفض لهذا السبب |
| 404 | `not_found` | المعرّف غير موجود **أو** المادة ليست من إنشاء بوت (`source != 'bot'`) — لا نكشف مسودات المحررين |
| 405 | `forbidden_action` | `PUT`/`DELETE` على `/:id` |
| 409 | `not_a_draft` | تحديث محتوى والمادة ليست `draft`، أو جاهزية والمادة ليست `draft`، أو نشر/جدولة أولى والمادة ليست `draft` ولا `ready_to_publish`. `details.status` = الحالة الحالية |
| 409 | `not_published` | أرشفة أو ظهور والمادة ليست `published`. `details.status` = الحالة الحالية |
| 409 | `not_scheduled` | تغيير موعد أو إلغاء جدولة والمادة ليست `scheduled`. `details.status` = الحالة الحالية |
| 409 | `locked_by_editor` | محرر يفتح المادة الآن (قفل تحرير نشط، TTL 10 دقائق). `details.editor`, `details.lockExpiresAt` |
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
- لا جدول جديد ولا `db:push` ولا صلاحيات RBAC جديدة. `published` و`scheduled` و`ready_to_publish` قيم في `articles.status` القائم. التوكن لا يُترجم لمستخدم Passport ولا يفتح `/api/admin/*`.
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

# نشر فوري — جسم فارغ
curl -sS -X POST "$B/api/internal/bot-drafts/<id>/publish" \
  -H "Authorization: Bearer $SABQ_BOT_DRAFTS_TOKEN" -H "Content-Type: application/json" \
  -H "User-Agent: $UA" \
  -d '{}'

# جدولة بتوقيت الرياض (+03:00)
curl -sS -X POST "$B/api/internal/bot-drafts/<id>/schedule" \
  -H "Authorization: Bearer $SABQ_BOT_DRAFTS_TOKEN" -H "Content-Type: application/json" \
  -H "User-Agent: $UA" \
  -d '{"publishAt":"2026-09-24T18:30:00+03:00"}'

# تغيير موعد مادة مجدولة
curl -sS -X PATCH "$B/api/internal/bot-drafts/<id>/schedule" \
  -H "Authorization: Bearer $SABQ_BOT_DRAFTS_TOKEN" -H "Content-Type: application/json" \
  -H "User-Agent: $UA" \
  -d '{"publishAt":"2026-09-24T21:00:00+03:00"}'

# إلغاء الجدولة والعودة إلى مسودة (لا حذف)
curl -sS -X DELETE "$B/api/internal/bot-drafts/<id>/schedule" \
  -H "Authorization: Bearer $SABQ_BOT_DRAFTS_TOKEN" -H "Content-Type: application/json" \
  -H "User-Agent: $UA" \
  -d '{}'

# أرشفة مادة منشورة (تختفي من الموقع، والصف يبقى)
curl -sS -X POST "$B/api/internal/bot-drafts/<id>/archive" \
  -H "Authorization: Bearer $SABQ_BOT_DRAFTS_TOKEN" -H "Content-Type: application/json" \
  -H "User-Agent: $UA" \
  -d '{"reason":"الخبر مكرر"}'

# مميز + عاجل، ويبقى على الرئيسية. لا إشعار قرّاء من هذا النداء
curl -sS -X PATCH "$B/api/internal/bot-drafts/<id>/visibility" \
  -H "Authorization: Bearer $SABQ_BOT_DRAFTS_TOKEN" -H "Content-Type: application/json" \
  -H "User-Agent: $UA" \
  -d '{"isFeatured":true,"newsType":"breaking","hideFromHomepage":false}'

# إخفاء من الرئيسية مع بقاء الرابط
curl -sS -X PATCH "$B/api/internal/bot-drafts/<id>/visibility" \
  -H "Authorization: Bearer $SABQ_BOT_DRAFTS_TOKEN" -H "Content-Type: application/json" \
  -H "User-Agent: $UA" \
  -d '{"hideFromHomepage":true}'

# الفعل الخطأ يبقى 403
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
npx tsx scripts/bot-drafts-client.ts publish <id>
npx tsx scripts/bot-drafts-client.ts schedule <id> --publish-at="2026-09-24T18:30:00+03:00"
npx tsx scripts/bot-drafts-client.ts reschedule <id> --publish-at="2026-09-24T21:00:00+03:00"
npx tsx scripts/bot-drafts-client.ts unschedule <id>
npx tsx scripts/bot-drafts-client.ts archive <id> --reason="الخبر مكرر"
npx tsx scripts/bot-drafts-client.ts visibility <id> --featured=true --breaking=false --hide-from-homepage=false
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
const status = await client.get(draft.id);
const live = await client.publish(draft.id); // live.publicUrl و live.status === "published"
// أو: await client.schedule(draft.id, "2026-09-24T18:30:00+03:00");
// await client.reschedule(draft.id, "2026-09-24T21:00:00+03:00");
// await client.unschedule(draft.id); // تعود draft
// await client.archive(live.id, "الخبر مكرر"); // archived، لا حذف
// await client.setVisibility(live.id, { isFeatured: true, newsType: "breaking", hideFromHomepage: false });
```

### تعليمات تشغيل بوت «نشر سبق»

1. اطلب من علي إضافة زوج `nashr-sabq:<token>` إلى `BOT_DRAFTS_API_TOKENS` على Railway، وضع التوكن نفسه في أسرار البوت باسم `SABQ_BOT_DRAFTS_TOKEN`.
2. في تعريف أداة البوت استورد `docs/systems/editorial/bot-drafts.openapi.yaml` أو عرّف الأدوات: إنشاء، تحديث، رفع صورة، `publish_sabq_draft` (`POST /publish` جسم `{}`)، `schedule_sabq_draft` (`POST /schedule` مع `publishAt`)، `reschedule_sabq_draft` (`PATCH /schedule`)، `unschedule_sabq_draft` (`DELETE /schedule`)، `archive_sabq_draft` (`POST /archive`)، `set_sabq_visibility` (`PATCH /visibility`)، و`mark_sabq_draft_ready` (`PATCH /ready`) للمسار الثانوي.
3. تعليمة النظام للبوت:
   - «لإنشاء مسودة في سبق: `POST /api/internal/bot-drafts` مع `title` و`content` و`categorySlug` و`clientReference`، واحفظ `id` و`editUrl`.»
   - «للنشر فوراً بعد اعتماد علي: `POST /api/internal/bot-drafts/{id}/publish` بجسم `{}`. أرسل له `publicUrl` من الرد.»
   - «للجدولة: `POST /api/internal/bot-drafts/{id}/schedule` مع `publishAt` مستقبلي. وقت الرياض بصيغة `2026-09-24T18:30:00+03:00` أو UTC المكافئ. لا ترسل وقتاً بلا إزاحة.»
   - «لتغيير موعد مادة مجدولة: `PATCH /schedule` بنفس `publishAt`. لإلغاء الجدولة: `DELETE /schedule` بجسم فارغ فتعود مسودة. لا تحذف الصف.»
   - «لسحب خبر منشور من الموقع: `POST /archive` وليس `DELETE`. الأرشفة قابلة للاستعادة من اللوحة.»
   - «لمميز أو عاجل أو إخفاء الرئيسية على خبر منشور: `PATCH /visibility`. تعليم العاجل لا يرسل إشعاراً للقرّاء.»
   - «لتحديث المحتوى: `PATCH` بالحقول المتغيرة فقط على مسودة `draft` أو على خبرك المنشور (`source=bot`). على المنشور لا ترسل `categorySlug` ولا `status`. الحالة تبقى `published` والرابط و`publishedAt` لا يتغيران. إن رجع 409 فالمادة ليست مسودة ولا خبراً منشوراً للبوت، أو يحررها محرر.»
   - «`PATCH /ready` يعلّم المادة للمناوب دون نشر. استخدمه فقط إذا طُلب تركها لغرفة الأخبار.»
   - «لرفع صورة: `POST /images` وحقل `file`. الغلاف = `imageUrl`. المتن = `imageUrls`.»
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
| 4 | `POST /:id/publish` بجسم `{}` على مسودة بوت بلا قفل | `200` و`status: "published"` و`updatable: true` و`publicUrl` يفتح الخبر |
| 4a | `PATCH /:id/publish` أو `POST /:id/submit-review` | `403 forbidden_action` |
| 4b | `PATCH /:id/ready` بجسم `{}` على مسودة بلا قفل | `200` و`status: "ready_to_publish"` و`updatable: false`؛ تظهر في لوحة «جاهز للنشر» |
| 4e | `POST /:id/schedule` بـ `publishAt` مستقبلي `+03:00` | `200` و`status: "scheduled"` و`scheduledAt`؛ تظهر في المجدول وتنشر عند الموعد |
| 4f | `POST /:id/schedule` بجسم `{}` أو وقت ماضٍ أو بلا إزاحة | `400 validation_error` |
| 4g | `POST /:id/publish` على مادة منشورة، أو أثناء قفل، أو على مسودة محرر | `409 not_a_draft` / `409 locked_by_editor` / `404 not_found` |
| 4h | `PATCH /:id/schedule` بوقت مستقبلي على مادة `scheduled` | `200` و`scheduledAt` الجديد والحالة تبقى `scheduled` |
| 4i | `DELETE /:id/schedule` على مادة مجدولة | `200` و`status: "draft"` و`updatable: true` والصف ما زال موجوداً |
| 4j | `POST /:id/archive` على مادة منشورة | `200` و`status: "archived"`. `DELETE /:id` يبقى `405` |
| 4k | `PATCH /:id/visibility` بـ `isFeatured` / `newsType` / `hideFromHomepage` على مادة منشورة | `200`. `newsType: "featured"` → `400`. لا إشعار قرّاء |
| 4c | `PATCH` محتوى بعد الجاهزية، أو `PATCH /ready` مرة ثانية | `409 not_a_draft` |
| 4d | من اللوحة: نشر المادة الجاهزة، أو «إرجاع لمسودة» | مسار المحرر ما زال يعمل؛ الإرجاع يعيد `draft` و`updatable: true` |
| 5 | بنفس التوكن: `PATCH /api/admin/articles/<id>` أو `POST /api/admin/articles` | `401` (لا جلسة) — التوكن لا يعمل على المسارات الإدارية |
| 6 | افتح المسودة في اللوحة (قفل تحرير نشط) ثم `PATCH` من البوت | `409 locked_by_editor` |
| 7 | `PATCH /:id` على خبر بوت `published` بحقل `title` (وبلا `categorySlug`) | `200` و`status: "published"` و`updatable: true` و`slug` و`publishedAt` كما كانا |
| 8 | توكن خاطئ / بدون توكن | `401` مع `Cache-Control: private, no-store` ولا يظهر أي توكن في الرد أو اللوج |
| 9 | `GET` بمعرّف مسودة أنشأها محرر (ليست من بوت) | `404` — لا كشف لمسودات المحررين |
| 10 | لوج Railway بعد الخطوات أعلاه | أسطر `[BotDrafts] created/updated/published/scheduled` و`marked ready` بلا توكنات |
| 11 | `POST` بمتن نصي و`imageUrls` من `deliveryUrl` | `201` و`bodyImageUrls` فيها الروابط بالترتيب؛ معاينة اللوحة تعرض صوراً أسفل المتن لا نص الرابط. الغلاف يبقى في `imageUrl` فقط |

آلياً: `npm run test:unit -- tests/unit/botDrafts.test.ts` (التوكنات، الحقول الممنوعة، نشر وجدولة، وقت ماضٍ وجسم فارغ، قفل ومصدر خاطئ ومادة منشورة، 401/403/405/409/422، رفع الصور، CSRF).

---

## الحدود المعروفة (v1)

- **صورة الغلاف:** ارفع ملفاً عبر `POST /api/internal/bot-drafts/images` (10MB، JPEG/PNG/WEBP/GIF) إلى R2 (`sabq-news-images`) ثم مرّر `deliveryUrl` (`https://media.sabq.org/news/…`) كـ `imageUrl`. لا نشر ولا جدول من مسار الرفع، ولا تخزين أساسي على Cloudflare Images. GIF مقبول هنا فقط لأن المسار مصادق للبوت ومحدود الحجم؛ مسار `/api/media/upload` العام ما زال يرفض GIF (تدقيق M8).
- **صور المتن:** نفس الرفع، والروابط في `imageUrls` (حتى 20) أو `<img src="https://…">` مغلق داخل HTML. تُخزَّن كعقدة صورة المحرر أسفل المتن أو في موضع الوسم. `GET` يعيد `bodyImageUrls` لا المتن. لا ألبوم منفصل ولا نسخ تلقائي للغلاف إلى الجسم.
- **أخبار عربية `news` فقط**. لا رأي/تحليل/EN/UR من هذا العقد.
- **لا idempotency على الإنشاء**: تكرار `POST` ينتج مسودتين؛ استخدم `clientReference` للمطابقة، ولا تعد المحاولة بعد `201`.
- **لا حذف نهائي من البوت**: `POST /archive` أرشفة ناعمة لمادة منشورة (`source=bot` فقط). الاستعادة من لوحة المحرر. `DELETE /:id` يبقى 405.
- المحدد `express-rate-limit` في الذاكرة لكل نسخة خادم؛ مع عدة نسخ Railway السقف الفعلي ≈ السقف × عدد النسخ.

## قرارات تحتاج موافقة علي الحازمي قبل الدمج

1. **نمط المصادقة**: توكن Bearer ثابت لكل بوت من متغير بيئة (لا جدول توكنات ولا OAuth). البديل الأثقل: جدول `api_tokens` مع صلاحيات وتدوير من اللوحة — يمكن الترقية لاحقاً دون تغيير عقد البوت.
2. **الإسناد الافتراضي** لحساب «صحيفة سبق». البديل: حساب خدمة مخصص عبر `BOT_DRAFTS_AUTHOR_USER_ID`.
3. **ضبط الأسرار على Railway** (`BOT_DRAFTS_API_TOKENS`) وإعادة النشر — بدونها المسار يرد `503` ولا أثر له على التحرير الحالي.

لا تغييرات schema ولا `db:push`: النشر والجدولة يستخدمان `published` و`scheduled` و`scheduledAt` و`publishedAt` و`publishType` القائمة. `sourceMetadata` يبقى jsonb بلا DDL.
