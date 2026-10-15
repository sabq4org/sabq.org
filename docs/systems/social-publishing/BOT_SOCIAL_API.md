# واجهة بوت النشر على X

بوت خارجي (مثل «نشر إكس») ينشر تغريدات أخبار سبق **المنشورة** عبر نفس خط النشر الموجود في اللوحة: مطالبة exactly-once، ثم X API أو Publer، ثم العامل للمنشورات المجدولة. لا يوجد منطق نشر ثانٍ.

المسار الأساسي: `https://api.sabq.org/api/internal/bot-social`

## المصادقة

```
Authorization: Bearer <SABQ_BOT_SOCIAL_TOKEN>
```

- المتغير `SABQ_BOT_SOCIAL_TOKEN` توكن واحد (32 حرفاً على الأقل). اسم البوت في السجل `nashr-x` إلا إذا ضُبط `SABQ_BOT_SOCIAL_NAME`.
- أو عدة بوتات: `BOT_SOCIAL_API_TOKENS=name:token,name:token` (نفس شكل مسودات البوت).
- `BOT_DRAFTS_API_TOKENS` **لا يُقرأ هنا**. توكن المسودات يرجع `401`، وغياب توكن النشر يرجع `503 not_configured`.
- المسار تحت `/api/internal/` فهو معفى من CSRF ومن محدد الكتابة العام. المحدد هنا بمفتاح اسم البوت.

## جدول مطلوب قبل التشغيل

`social_post_bot_keys` جدول جديد (إضافة فقط، بلا تعديل أعمدة `social_posts`). بدونه تفشل الكتابة في هذه الواجهة. ادفعه بـ `./push-to-production.sh` **قبل** الاعتماد على البوت. النشر من لوحة التحكم لا يعتمد على هذا الجدول.

## القواعد

- تغريدة الخبر: عربي من جدول `articles` وحالته `published` و`publishedAt` ليس في المستقبل. غير ذلك: `422 article_not_published`. هذا المسار لم يتغير.
- منشور بلا خبر (`kind: "original"`): لا `articleId` ولا `articleUrl`. النص والصورة والرابط الاختياري يكفي. التفاصيل تحت «منشور بلا خبر».
- `suggest` و`preview` و`publish` و`schedule` تقبل `articleId` (قيمة `articles.id`) **أو** `articleUrl`. يلزم أحدهما. إن وُجدا معاً يجب أن يشيرا إلى الخبر نفسه، وإلا `400 validation_error`. الرابط يُفك ترميزه ثم يُبحث بالترتيب: `english_slug` (الرمز القصير في `/article/{code}`)، ثم `slug` العربي، ثم `legacy_slug`، ثم `articles.id` إن كان المقطع UUID. هذا ترتيب الصفحة العامة: الرمز الظاهر هو `english_slug`، والرابط الطويل يطابق `slug`، ومفتاح عدم التكرار يبقى على المعرّف المحلول: إعادة `clientReference` مع رابط لخبر آخر ترجع `409 reference_article_mismatch`.
- أشكال الرابط المقبولة: `https://sabq.org/article/...` و`https://www.sabq.org/article/...` (و`http`)، مع شرطة مائلة أخيرة أو بدونها، ومع استعلام أو هاش. المقطع قد يكون الرمز القصير (`english_slug` مثل `jrdic6y`) أو `slug` العربي مرمّزاً بالمئة أو `legacy_slug`. أي مضيف آخر: `400 validation_error`. رابط لا يطابق خبراً: `404 not_found`. `/en/article/` و`/ur/article/`: `422 unsupported_language`.
- `clientReference` (1–120، حروف وأرقام و`.` `_` `:` `-`) مع اسم البوت مفتاح فريد. إعادة نفس المرجع لا تنشئ تغريدة ثانية.
- إذا كان المرجع منشوراً، `publish` و`schedule` يرجعان `200` مع `idempotentReplay: true` ونفس `externalPostUrl`.
- إذا كان `processing`: `409 in_progress` — اقرأ الحالة ولا تعد الإرسال حتى تستقر.
- إذا كان `canceled`: يلزم `clientReference` جديد.
- أول طلب يكتب المحتوى. إعادة المحاولة التي تحذف `text` تُبقي النص المخزّن. السباق المتوازي: أول مفتاح يفوز، والخاسر يحذف مسودته اليتيمة ولا ينشر مرة ثانية.
- تغريدة الخبر: الرابط يُركَّب في سطر جديد ويُحسب 23 (اختصار t.co). العربي = 1. الإيموجي = 2. الحد القياسي 280 (`overStandard`) وحد الرفض 25000. لا تُضاف وسوم قياس إلى رابط الخبر.
- منشور `original`: نفس أوزان الحروف، و`overStandard` بعد 280، لكن حد الرفض 2000 موزوناً للنص مع الرابط إن وُجد. من 281 إلى 2000 مقبول.
- X لا يعرض Markdown: الخادم يزيل `**نص**` و`__نص__` من نص البوت قبل الحفظ والعد. عبر Publer يُرسل كل نص فوق 280 بـ`long_post` حتى لا يُقص ويضيع الرابط.
- الصورة الافتراضية صورة الخبر. `imageSource: "upload"|"library"` يحتاج `imageUrl` على مضيف مسموح (SSRF). لا رفع ملف من هذه الواجهة؛ ارفع عبر مسار صور المسودات أو مرّر رابط `media.sabq.org`.
- الحساب المنفِّذ: `SABQ_BOT_SOCIAL_USER_ID` ثم `BOT_DRAFTS_AUTHOR_USER_ID` ثم حساب «صحيفة سبق». يجب أن يكون `active`.
- التدقيق: `activity_logs` بقناة `bot-social-api` (اسم البوت، المرجع، IP، دون التوكن).

## منشور بلا خبر (`kind: "original"`)

للصور المصممة والشرح والخدمات والأسئلة التي لا ترتبط بخبر في `articles`. نفس التوكن ونفس `clientReference` ونفس المطالبة والعامل ومزوّد X/Publer. المعاينة لا تنشر. لا حذف لتغريدة صدرت.

لا يلزم ترحيل إنتاج: `social_posts.article_id` قابل للفراغ، و`media_urls` يخزّن حتى 4 صور. هذا المسار لا يضيف عموداً.

### الطلب

`preview` و`publish` و`schedule` تقبل:

```json
{
  "kind": "original",
  "clientReference": "nashr-2026-10-03-card-1",
  "text": "شرح رسوم المياه لهذا الأسبوع",
  "linkUrl": "https://sabq.org/services/water",
  "imageUrls": [
    "https://media.sabq.org/news/2026/10/card-a.png",
    "https://media.sabq.org/news/2026/10/card-b.jpg"
  ],
  "campaign": "water-fees"
}
```

| الحقل | القاعدة |
|--------|---------|
| `kind` | `"original"` إلزامي. غيابه يُبقي مسار الخبر الذي يلزم فيه `articleId` أو `articleUrl`. |
| `text` | مطلوب في أول طلب. فارغ: `400 validation_error`. فوق 2000 موزوناً (مع الرابط): `400`. إعادة المحاولة التي تحذف `text` تُبقي المخزّن. |
| `linkUrl` | اختياري. غيابه منشور نص/صورة فقط. إن وُجد يجب أن يكون `http` أو `https` على `sabq.org` أو `www.sabq.org`. المضيفات الأخرى: `400`. |
| `imageUrl` | صورة واحدة. ما زال يعمل. |
| `imageUrls` | من 1 إلى 4. لا يُرسل مع `imageUrl` في نفس الطلب. |
| `campaign` | اختياري. حروف إنجليزية وأرقام و`_` و`-` حتى 41 خانة. يكتبه الخادم في `utm_campaign`. غيابه = `sabqorg`. |
| `articleId` / `articleUrl` | مرفوضان مع `kind: "original"`. |

`schedule` يضيف `scheduledAt` كما في تغريدة الخبر.

### وسوم القياس

الخادم يضعها على الرابط الصادر. البوت لا يُعتمد عليه لتذكّرها، وأي `utm_*` يرسله يُستبدل. الأسماء هي أعمدة الروابط القصيرة في سبق (`utm_source` / `utm_medium` / `utm_campaign` / `utm_content`) وهي ما تُبقيه تحليلات الموقع (`utm_*` في `sanitizeAnalyticsUrl`). لا توجد قيمة ثابتة سابقة لحساب X، فالقيم:

| الوسم | القيمة |
|--------|--------|
| `utm_source` | `x` |
| `utm_medium` | `social` |
| `utm_campaign` | `campaign` إن أُرسل، وإلا `sabqorg` |
| `utm_content` | `social_posts.id` بعد الإنشاء. في المعاينة فقط: `preview` |

يُحفظ `page` الرقمي إن وُجد. بقية الاستعلام تُسقط حتى لا تدخل بيانات شخصية. تحويل السلاق 301 في الخادم يُبقي الاستعلام، وحافة Pages كانت تُبقي `url.search` أصلاً. الصفحة القانونية تبقى بلا هذه الوسوم؛ التحليلات تقرأ رابط الوصول.

### الصور المحلية

`POST /api/internal/bot-social/images` بنفس توكن Bearer، حقل multipart اسمه `file` (JPEG/PNG/WEBP/GIF، 10MB). ليس مساراً عاماً. التخزين هو رفع صور المسودات نفسه (`newsImageStorageService` مع `forceR2`) والغرض `bot-article-image` حتى يصل الملف إلى `https://media.sabq.org/...`. ضع `deliveryUrl` في `imageUrl` أو `imageUrls`. رابط `https` على مضيف مسموح (مثل `media.sabq.org`) ما زال مقبولاً بلا رفع.

### الرد

نفس شكل تغريدة الخبر، مع:

- `post.articleId = null` و`post.kind = "original"`
- `post.imageUrls` بكل الصور، و`post.imageUrl` أول صورة
- `post.linkUrl` بعد الوسوم إن وُجد رابط
- `post.externalPostUrl` عند معرفته، بما فيه `/status/{id}`. مع Publer قد يتأخر الرابط حتى قراءة لاحقة، كما في تغريدة الخبر
- المعاينة تضيف `hardMaxWeightedLength: 2000` ولا تكتب صفاً

مثال رابط صادر:

```text
https://sabq.org/services/water?utm_source=x&utm_medium=social&utm_campaign=water-fees&utm_content=POST_ID
```

## نقاط النهاية

كل الأخطاء: `{ "code", "message", "details"?, "post"? }`. النجاح يضبط `Cache-Control: private, no-store`.

### توليد النص

`POST /api/internal/bot-social/suggest`

```json
{ "articleId": "ART_ID" }
```

أو برابط الخبر بدل المعرّف:

```json
{ "articleUrl": "https://sabq.org/article/jrdic6y" }
```

`https://www.sabq.org/article/jrdic6y/?utm=1#top` و`https://sabq.org/article/%D8%AE%D8%A8%D8%B1-%D8%B9%D8%A7%D8%AC%D9%84` يُحلّان بالطريقة نفسها.

```json
{
  "articleId": "ART_ID",
  "post": "نص مقترح بلا رابط",
  "hashtags": ["سبق"],
  "suggestedText": "نص مقترح بلا رابط\n#سبق",
  "title": "عنوان الخبر",
  "linkUrl": "https://sabq.org/article/english-slug",
  "imageUrl": "https://media.sabq.org/....jpg"
}
```

لا يحفظ منشوراً. النموذج الافتراضي `gpt-4o-mini` عبر مفتاح `social-post-suggest`، والرد JSON، و`maxTokens` 400. الهدف حوالي 240 حرفاً موزوناً ليبقى مكان الرابط.

### معاينة

`POST /api/internal/bot-social/preview`

```json
{
  "articleUrl": "https://www.sabq.org/article/jrdic6y/",
  "text": "نص التغريدة",
  "textSource": "ai",
  "includeLink": true,
  "imageSource": "article"
}
```

`articleId` يبقى مقبولاً مكان `articleUrl`.

`textSource`: `title | title_link | custom | ai`. غيابه `custom`. `textSource: "title"` بلا `includeLink` يُسقط الرابط. `imageSource: "none"` بلا صورة.

```json
{
  "articleId": "ART_ID",
  "title": "عنوان الخبر",
  "excerpt": "موجز",
  "status": "published",
  "text": "نص التغريدة",
  "textSource": "ai",
  "includeLink": true,
  "linkUrl": "https://sabq.org/article/english-slug",
  "imageSource": "article",
  "imageUrl": "https://media.sabq.org/....jpg",
  "composedText": "نص التغريدة\nhttps://sabq.org/article/english-slug",
  "weightedLength": 48,
  "remaining": 232,
  "valid": true,
  "overStandard": false,
  "empty": false,
  "maxWeightedLength": 280,
  "maxPremiumWeightedLength": 25000
}
```

### نشر فوري

`POST /api/internal/bot-social/publish`

```json
{
  "articleUrl": "https://sabq.org/article/jrdic6y?utm_source=desk",
  "clientReference": "nashr-2026-09-28-art-1",
  "text": "نص التغريدة",
  "textSource": "ai",
  "includeLink": true,
  "imageSource": "article"
}
```

إن أُرسل `articleId` مع `articleUrl` فيجب أن يحل الرابط إلى ذلك المعرّف.

رد تغريدة الخبر يضيف حقلين لا يغيران السلوك: `kind: "article"` و`imageUrls` (صورة واحدة إن وُجدت، وإلا مصفوفة فارغة). الرابط يبقى رابط الخبر بلا وسوم قياس.

```json
{
  "idempotentReplay": false,
  "post": {
    "id": "POST_ID",
    "articleId": "ART_ID",
    "platform": "x",
    "status": "published",
    "text": "نص التغريدة",
    "textSource": "ai",
    "includeLink": true,
    "linkUrl": "https://sabq.org/article/english-slug",
    "imageSource": "article",
    "imageUrl": "https://media.sabq.org/....jpg",
    "composedText": "نص التغريدة\nhttps://sabq.org/article/english-slug",
    "weightedLength": 48,
    "remaining": 232,
    "valid": true,
    "overStandard": false,
    "scheduledAt": null,
    "publishedAt": "2026-09-28T17:00:00.000Z",
    "externalPostId": "1234567890",
    "externalPostUrl": "https://x.com/HANDLE/status/1234567890",
    "clientReference": "nashr-2026-09-28-art-1",
    "botName": "nashr-x",
    "attempts": 1,
    "lastError": null,
    "createdAt": "2026-09-28T17:00:00.000Z",
    "updatedAt": "2026-09-28T17:00:00.000Z"
  }
}
```

فشل المزوّد: `502 publish_failed` مع `post.status = "failed"` و`lastError`. أعد نفس `clientReference` بعد التصحيح؛ لا يُنشأ صف ثانٍ. النشر الفوري الفاشل لا يُعاد تلقائياً (نفس سلوك اللوحة). إذا كان `lastError` «انتهت مهلة تأكيد مهمة Publer» فالحالة مجهولة وقد تكون التغريدة صدرت — تحقق من الحساب قبل إعادة المحاولة، لأن الإعادة تستدعي المزوّد من جديد.

مع Publer قد يتأخر `externalPostUrl` حتى يظهر `post_link`. `job_status` لا يعيد رابط التغريدة ولا معرف المنشور، و`publer:<jobId>` لا يُستخدم لجلب `GET /posts/{id}`. الإكمال يبحث `GET /posts?state=published&account_ids[]=…&from=&to=` حول وقت النشر، ويطابق الحساب ثم نص التغريدة أو رابط الخبر، ويقبل أي `post_link` على x.com أو twitter.com فيه `/status/{id}`. قبل ذلك يكون `externalPostId` = `publer:<jobId>` و`externalPostUrl` إما `https://x.com/{handle}` إن كان handle معرفاً صالحاً مخزناً (مثل `sabqorg`) أو `null`. اسم العرض لا يُستخدم في الرابط، والحقل معلّق. عند ظهور الرابط تُخزَّن القيمة `https://x.com/{handle}/status/{tweetId}` ويصبح `externalPostId` معرف التغريدة.

### جدولة

`POST /api/internal/bot-social/schedule`

```json
{
  "articleUrl": "https://sabq.org/article/jrdic6y",
  "clientReference": "nashr-2026-09-28-art-1",
  "text": "نص التغريدة",
  "scheduledAt": "2026-09-28T21:00:00+03:00"
}
```

الوقت ISO مع إزاحة (`Z` مقبول). بعد أكثر من دقيقة وأقل من سنة. الرد `post.status = "scheduled"` و`scheduledAt`. العامل (`socialPublishWorker`) ينشر كل دقيقة عبر نفس `createPost`، فيُستطلع `post_link` بعد النشر مثل الفوري. إذا كان المرجع قد نُشر: `idempotentReplay: true` بلا تغريدة جديدة، وتُستكمل قراءة الرابط إن كان ما زال معلّقاً. إعادة الجدولة لنفس المرجع المجدول تحدّث الموعد. بعد فشل استُنفدت محاولاته تُصفَّر `attempts` حتى يلتقطه العامل.

### إلغاء الجدولة

`POST /api/internal/bot-social/cancel`

```json
{ "clientReference": "nashr-2026-09-28-art-1", "reason": "تأجيل" }
```

أو `{ "id": "POST_ID" }`. المجدول فقط. المنشور: `409 not_cancelable`. الملغى مسبقاً: `idempotentReplay: true`. السبب يُحفظ في `lastError`.

### حل الرابط قبل النشر

`GET /api/internal/bot-social/resolve?url=`

نفس توكن Bearer. `url` مرمّز كمُعامل استعلام (`encodeURIComponent`). لا يشترط أن يكون الخبر منشوراً؛ الكتابة لاحقاً ما زالت ترفض غير المنشور بـ `422 article_not_published`.

```http
GET /api/internal/bot-social/resolve?url=https%3A%2F%2Fsabq.org%2Farticle%2Fjrdic6y%2F%3Futm%3D1 HTTP/1.1
Authorization: Bearer <SABQ_BOT_SOCIAL_TOKEN>
```

```json
{
  "articleId": "ART_ID",
  "title": "عنوان الخبر",
  "status": "published",
  "publishedAt": "2026-09-01T00:00:00.000Z",
  "linkUrl": "https://sabq.org/article/jrdic6y",
  "lang": "ar"
}
```

`publishedAt` يكون `null` إن لم يُنشر بعد. `linkUrl` هو الرابط العام (`english_slug` وإلا `slug`). `lang` دائماً `"ar"` لأن الإنجليزية والأردية تُرفضان قبل البحث.

### قراءة الحالة والقائمة

`GET /api/internal/bot-social/posts/:id` → `{ "post": { ... } }`

`GET /api/internal/bot-social/posts?clientReference=REF` → `{ "post": { ... } }` أو `404`

`GET /api/internal/bot-social/posts?limit=20&articleId=ART_ID&status=scheduled` → `{ "posts": [ ... ] }`

`limit` من 1 إلى 50، والافتراضي 20. القائمة لمنشورات هذا البوت فقط.

منشور Publer بحالة `published` ومعرف `publer:…` بلا رابط `/status/` يُعاد فحصه عند هذه القراءة (التفاصيل، أو `clientReference`، أو القائمة حتى 8 صفوف معلّقة). إن وُجد `post_link` يُخزَّن رابط الحالة ومعرف التغريدة على الصف نفسه. إن لم يُوجد يُستبدل أي رابط مبني من اسم العرض برابط الملف أو `null`، ويبقى المعرف `publer:<jobId>` حتى قراءة لاحقة. المنشور المجدول لا يُفحص قبل أن يصبح `published`.

حالات `status`: `draft | scheduled | processing | published | failed | canceled`.

## أكواد الأخطاء

| HTTP | code | متى |
|------|------|-----|
| 400 | `validation_error` | جسم أو وقت أو صورة أو طول غير صالح، أو مضيف الرابط ليس sabq.org، أو غاب `articleId` و`articleUrl` في مسار الخبر، أو اجتمعا على خبرين مختلفين، أو `original` بلا نص أو فوق 2000 موزوناً أو برابط خارج سبق أو بـ `articleId` |
| 401 | `unauthorized` | توكن مفقود أو توكن المسودات |
| 404 | `not_found` | خبر أو منشور هذا البوت غير موجود، أو رابط `/article/` لا يطابق صفاً |
| 409 | `account_not_connected` | لا حساب X مرتبط |
| 409 | `in_progress` | الحالة `processing` |
| 409 | `canceled` | المرجع أُلغي |
| 409 | `not_cancelable` | الإلغاء ليس لمجدول |
| 409 | `conflict` | حالة لا تسمح |
| 409 | `reference_article_mismatch` | المرجع مستخدم لخبر آخر |
| 422 | `article_not_published` | الخبر ليس منشوراً الآن |
| 422 | `unsupported_language` | الرابط إنجليزي `/en/article/` أو أردي `/ur/article/` |
| 429 | `rate_limited` | حد الكتابة أو النشر أو التوليد |
| 502 | `suggest_failed` | فشل نموذج الاقتراح |
| 502 | `publish_failed` | المزوّد رفض النشر؛ `post` مرفق |
| 503 | `not_configured` | لا توكن نشر على الخادم |
| 503 | `author_not_configured` | حساب الإسناد غير نشط |
| 500 | `server_error` | خطأ غير مصنّف |

## ما يضبطه المالك قبل الإطلاق

1. دفع جدول `social_post_bot_keys`.
2. `SABQ_BOT_SOCIAL_TOKEN` سر جديد على Railway (ليس توكن المسودات).
3. حساب X مرتبط من `/dashboard/social-publishing` (OAuth: `tweet.read tweet.write users.read media.write offline.access`) **أو** `SOCIAL_PUBLISH_TRANSPORT=publer` مع `PUBLER_API_KEY` و`PUBLER_WORKSPACE_ID` ثم مزامنة الحساب. خطة X المدفوعة أو Publer Business مطلوبة للنشر البرمجي.
4. مفتاح الذكاء `OPENAI_API_KEY` (أو سلسلة الاحتياط) إن استُخدم `suggest`.
