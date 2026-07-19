> **مستند تاريخي (أُرشف 2026-07-01)** — يصف حالة التطبيق حتى ربيع 2026 ولا يعكس الكود الحالي.
> لا تتّبع تعليماته: الـ Base URL الصحيح اليوم `api.sabq.org` مباشرة (انظر `sabq app ios/sabq/Services/URLConstants.swift`)
> والحد الأدنى iOS 17.0. المرجع الحي: CLAUDE.md وذاكرة المشروع.

# متطلبات API لتطبيق سبق iOS
# هذا الملف من فريق تطوير تطبيق iOS → إلى فريق تطوير الباك إند / الموقع

---

## السياق
نطوّر تطبيق iOS أصلي (SwiftUI) لصحيفة سبق.
التطبيق يحتاج REST API يخدمه بالبيانات.
الموقع الحالي: https://sabq.org
وجدنا endpoint موجود: `GET /api/v1/articles` — لكن نحتاج endpoints إضافية وتحسينات.

---

## 1. قائمة المقالات (موجود - يحتاج تحسين)

### `GET /api/v1/articles`

**Query Parameters المطلوبة:**

| Parameter    | Type    | Required | Description                              |
|-------------|---------|----------|------------------------------------------|
| `limit`     | integer | no       | عدد المقالات (default: 20, max: 50)      |
| `offset`    | integer | no       | للتصفح (pagination)                       |
| `section`   | string  | no       | فلترة بالقسم: محليات، العالم، تقنية، إلخ  |
| `breaking`  | boolean | no       | الأخبار العاجلة فقط                       |
| `featured`  | boolean | no       | الأخبار المميزة فقط (اللي عليها صور)       |
| `q`         | string  | no       | بحث نصي في العنوان والمحتوى               |

**Response المطلوب:**
```json
{
  "total": 1250,
  "limit": 20,
  "offset": 0,
  "hasMore": true,
  "articles": [
    {
      "id": "uuid",
      "title": "عنوان الخبر",
      "excerpt": "ملخص قصير 150 حرف",
      "body": "النص الكامل (plain text بدون HTML)",
      "section": "محليات",
      "author_name": "اسم الكاتب",
      "published_at": "2026-03-22T10:30:00Z",
      "updated_at": "2026-03-22T12:00:00Z",
      "image_url": "https://cdn.sabq.org/images/article-123.jpg",
      "article_url": "https://sabq.org/article/slug",
      "is_breaking": false,
      "is_featured": true,
      "reading_minutes": 4,
      "tags": ["الرياض", "طقس", "أمطار"],
      "views_count": 15420
    }
  ]
}
```

**ملاحظات مهمة:**
- الحقل `body` يجب أن يكون **plain text** (بدون HTML tags) — حالياً `full_text` يرجع HTML
- الحقل `image_url` يجب أن يكون URL كامل وجاهز للاستخدام (حالياً بعض المقالات `image` فارغ)
- الحقل `excerpt` يجب أن يكون موجود دائماً (150-200 حرف) — حالياً أحياناً فارغ
- الحقل `reading_minutes` يُحسب من طول المقال (كلمات ÷ 200)

---

## 2. مقالة واحدة (مطلوب - جديد)

### `GET /api/v1/articles/{id}`

يرجع مقالة واحدة بكامل تفاصيلها.

**Response:** نفس شكل المقالة في القائمة أعلاه + الحقول التالية:

```json
{
  "...all article fields...",
  "related_articles": [
    { "id": "uuid", "title": "...", "image_url": "...", "section": "..." }
  ]
}
```

---

## 3. الأقسام (مطلوب - جديد)

### `GET /api/v1/sections`

يرجع قائمة الأقسام مع عدد المقالات في كل قسم.

```json
{
  "sections": [
    {
      "id": "uuid",
      "name": "محليات",
      "name_en": "Saudi",
      "articles_count": 450,
      "icon": "building.2.fill"
    },
    {
      "id": "uuid",
      "name": "العالم",
      "name_en": "World",
      "articles_count": 320,
      "icon": "globe.americas.fill"
    }
  ]
}
```

---

## 4. الأخبار العاجلة (مطلوب - مخصص)

### `GET /api/v1/breaking`

يرجع آخر الأخبار العاجلة فقط (آخر 24 ساعة).

```json
{
  "articles": [
    {
      "id": "uuid",
      "title": "...",
      "published_at": "...",
      "section": "..."
    }
  ]
}
```

---

## 5. البحث (مطلوب - تحسين)

### `GET /api/v1/search?q={query}`

| Parameter | Type    | Description              |
|-----------|---------|--------------------------|
| `q`       | string  | نص البحث                 |
| `limit`   | integer | عدد النتائج (default: 20)|
| `offset`  | integer | pagination               |
| `section` | string  | فلترة بالقسم (اختياري)    |

**Response:** نفس شكل قائمة المقالات.

---

## 6. المواضيع الرائجة (مطلوب - جديد)

### `GET /api/v1/trending`

يرجع المواضيع/الكلمات الأكثر بحثاً وتداولاً.

```json
{
  "tags": ["رؤية 2030", "نيوم", "كأس العالم", "أرامكو", "الهلال"],
  "articles": [
    { "id": "...", "title": "...", "views_count": 94500, "section": "..." }
  ]
}
```

---

## 7. الإشعارات (مطلوب - جديد)

### `POST /api/v1/devices/register`

تسجيل جهاز لاستقبال Push Notifications.

**Request:**
```json
{
  "device_token": "APNs token string",
  "platform": "ios",
  "preferences": {
    "breaking_news": true,
    "daily_summary": true
  }
}
```

### `PUT /api/v1/devices/{device_token}/preferences`

تحديث تفضيلات الإشعارات.

```json
{
  "breaking_news": true,
  "daily_summary": false
}
```

### متطلبات Push Notifications:
- إعداد Apple Push Notification service (APNs)
- نحتاج: **APNs Key (.p8)** + **Key ID** + **Team ID**
- إرسال إشعار عند نشر خبر عاجل (`is_breaking: true`)
- إرسال ملخص يومي الساعة 7 صباحاً (اختياري)
- الإشعار يجب أن يحتوي: `{ "article_id": "uuid", "title": "...", "body": "..." }`

---

## 8. التغطيات الحية (مطلوب - جديد)

### `GET /api/v1/live`

التغطيات الحية الجارية (مثل التغطية الموجودة حالياً في الموقع).

```json
{
  "coverages": [
    {
      "id": "uuid",
      "title": "الاعتداءات على دول الخليج",
      "is_active": true,
      "updates": [
        {
          "id": "uuid",
          "text": "الدفاع تعلن اعتراض وتدمير مسيّرة...",
          "timestamp": "2026-03-22T10:00:00Z",
          "country_flag": "🇸🇦"
        }
      ]
    }
  ]
}
```

---

## 9. WebSocket للتحديثات الفورية (مستقبلي)

### `wss://sabq.org/ws/live`

للتغطيات الحية والأخبار العاجلة الفورية بدون polling.

```json
{
  "type": "breaking_news",
  "article": { "id": "...", "title": "..." }
}
```

---

## المتطلبات التقنية العامة

### Headers
- كل الردود: `Content-Type: application/json; charset=utf-8`
- التطبيق يرسل: `User-Agent: SabqApp/1.0 iOS`
- التطبيق يرسل: `Accept-Language: ar`

### الأداء
- **Response time:** أقل من 500ms
- **CDN:** الصور يجب أن تكون على CDN مع دعم resize parameters
  - مثال: `https://cdn.sabq.org/image.jpg?w=800&q=80`
  - المطلوب: أحجام 400w (thumbnail), 800w (card), 1200w (full)
- **Gzip:** تفعيل ضغط الردود
- **Cache headers:** `Cache-Control: public, max-age=60` للقوائم، `max-age=300` للمقالات

### الأمان
- HTTPS إلزامي
- Rate limiting: 100 طلب/دقيقة لكل IP
- لا حاجة لـ authentication للقراءة (public API)

### CORS
- السماح لـ Origin: `*` (أو على الأقل تطبيقات الموبايل)

### Error Response
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "المقالة غير موجودة",
    "status": 404
  }
}
```

---

## الأولوية

| # | المتطلب | الأهمية | الحالة |
|---|---------|---------|--------|
| 1 | تحسين GET /articles (فلترة + plain text) | 🔴 عالية | موجود جزئياً |
| 2 | GET /articles/{id} | 🔴 عالية | مطلوب |
| 3 | GET /search | 🔴 عالية | مطلوب |
| 4 | GET /breaking | 🟡 متوسطة | مطلوب |
| 5 | GET /sections | 🟡 متوسطة | مطلوب |
| 6 | POST /devices/register (Push) | 🟡 متوسطة | مطلوب |
| 7 | GET /trending | 🟢 منخفضة | مطلوب |
| 8 | GET /live | 🟢 منخفضة | مطلوب |
| 9 | WebSocket | ⚪ مستقبلي | مطلوب |

---

## ملاحظة أخيرة
حالياً التطبيق يعمل مع `GET /api/v1/articles` الموجود بنجاح.
لكن نحتاج التحسينات المذكورة أعلاه لتحويله لتطبيق إنتاجي كامل.
كل endpoint جاهز من طرفكم → نربطه فوراً من طرف التطبيق.
