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

- الخبر عربي من جدول `articles` وحالته `published` و`publishedAt` ليس في المستقبل. غير ذلك: `422 article_not_published`.
- `clientReference` (1–120، حروف وأرقام و`.` `_` `:` `-`) مع اسم البوت مفتاح فريد. إعادة نفس المرجع لا تنشئ تغريدة ثانية.
- إذا كان المرجع منشوراً، `publish` و`schedule` يرجعان `200` مع `idempotentReplay: true` ونفس `externalPostUrl`.
- إذا كان `processing`: `409 in_progress` — اقرأ الحالة ولا تعد الإرسال حتى تستقر.
- إذا كان `canceled`: يلزم `clientReference` جديد.
- أول طلب يكتب المحتوى. إعادة المحاولة التي تحذف `text` تُبقي النص المخزّن. السباق المتوازي: أول مفتاح يفوز، والخاسر يحذف مسودته اليتيمة ولا ينشر مرة ثانية.
- الرابط يُركَّب في سطر جديد ويُحسب 23 (اختصار t.co). العربي = 1. الإيموجي = 2. الحد القياسي 280 (`overStandard`) وحد الرفض 25000.
- الصورة الافتراضية صورة الخبر. `imageSource: "upload"|"library"` يحتاج `imageUrl` على مضيف مسموح (SSRF). لا رفع ملف من هذه الواجهة؛ ارفع عبر مسار صور المسودات أو مرّر رابط `media.sabq.org`.
- الحساب المنفِّذ: `SABQ_BOT_SOCIAL_USER_ID` ثم `BOT_DRAFTS_AUTHOR_USER_ID` ثم حساب «صحيفة سبق». يجب أن يكون `active`.
- التدقيق: `activity_logs` بقناة `bot-social-api` (اسم البوت، المرجع، IP، دون التوكن).

## نقاط النهاية

كل الأخطاء: `{ "code", "message", "details"?, "post"? }`. النجاح يضبط `Cache-Control: private, no-store`.

### توليد النص

`POST /api/internal/bot-social/suggest`

```json
{ "articleId": "ART_ID" }
```

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
  "articleId": "ART_ID",
  "text": "نص التغريدة",
  "textSource": "ai",
  "includeLink": true,
  "imageSource": "article"
}
```

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
  "articleId": "ART_ID",
  "clientReference": "nashr-2026-09-28-art-1",
  "text": "نص التغريدة",
  "textSource": "ai",
  "includeLink": true,
  "imageSource": "article"
}
```

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

مع Publer قد يتأخر `externalPostUrl` أو يكون رابط الحساب إذا تعذر حل `post_link`. المعرف عندها `publer:<jobId>`.

### جدولة

`POST /api/internal/bot-social/schedule`

```json
{
  "articleId": "ART_ID",
  "clientReference": "nashr-2026-09-28-art-1",
  "text": "نص التغريدة",
  "scheduledAt": "2026-09-28T21:00:00+03:00"
}
```

الوقت ISO مع إزاحة (`Z` مقبول). بعد أكثر من دقيقة وأقل من سنة. الرد `post.status = "scheduled"` و`scheduledAt`. العامل (`socialPublishWorker`) ينشر كل دقيقة. إذا كان المرجع قد نُشر: `idempotentReplay: true` بلا تغريدة جديدة. إعادة الجدولة لنفس المرجع المجدول تحدّث الموعد. بعد فشل استُنفدت محاولاته تُصفَّر `attempts` حتى يلتقطه العامل.

### إلغاء الجدولة

`POST /api/internal/bot-social/cancel`

```json
{ "clientReference": "nashr-2026-09-28-art-1", "reason": "تأجيل" }
```

أو `{ "id": "POST_ID" }`. المجدول فقط. المنشور: `409 not_cancelable`. الملغى مسبقاً: `idempotentReplay: true`. السبب يُحفظ في `lastError`.

### قراءة الحالة والقائمة

`GET /api/internal/bot-social/posts/:id` → `{ "post": { ... } }`

`GET /api/internal/bot-social/posts?clientReference=REF` → `{ "post": { ... } }` أو `404`

`GET /api/internal/bot-social/posts?limit=20&articleId=ART_ID&status=scheduled` → `{ "posts": [ ... ] }`

`limit` من 1 إلى 50، والافتراضي 20. القائمة لمنشورات هذا البوت فقط.

حالات `status`: `draft | scheduled | processing | published | failed | canceled`.

## أكواد الأخطاء

| HTTP | code | متى |
|------|------|-----|
| 400 | `validation_error` | جسم أو وقت أو صورة أو طول غير صالح |
| 401 | `unauthorized` | توكن مفقود أو توكن المسودات |
| 404 | `not_found` | خبر أو منشور هذا البوت غير موجود |
| 409 | `account_not_connected` | لا حساب X مرتبط |
| 409 | `in_progress` | الحالة `processing` |
| 409 | `canceled` | المرجع أُلغي |
| 409 | `not_cancelable` | الإلغاء ليس لمجدول |
| 409 | `conflict` | حالة لا تسمح |
| 409 | `reference_article_mismatch` | المرجع مستخدم لخبر آخر |
| 422 | `article_not_published` | الخبر ليس منشوراً الآن |
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
