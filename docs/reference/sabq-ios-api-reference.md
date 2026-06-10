# Sabq iOS App — API Reference & Design Guide
## دليل تطبيق سبق الشامل لـ iOS

**Base URL:** `https://sabq.org/api/v1`  
**Content-Type:** `application/json`  
**Direction:** RTL (Arabic-first)

---

## جدول المحتويات

1. [الصفحة الرئيسية (Homepage)](#1-الصفحة-الرئيسية)
2. [المقالات والأخبار (Articles)](#2-المقالات-والأخبار)
3. [الأقسام (Sections)](#3-الأقسام)
4. [الأخبار العاجلة (Breaking News)](#4-الأخبار-العاجلة)
5. [البحث (Search)](#5-البحث)
6. [الأكثر تداولاً (Trending)](#6-الأكثر-تداولاً)
7. [البث الحي — التغطية الخليجية (Live Coverage)](#7-البث-الحي)
8. [العضوية والتسجيل (Auth)](#8-العضوية-والتسجيل)
9. [الملف الشخصي (Profile)](#9-الملف-الشخصي)
10. [الإشعارات (Push Notifications)](#10-الإشعارات)
11. [الاهتمامات (Interests)](#11-الاهتمامات)
12. [الأدوار (Roles)](#12-الأدوار)
13. [إرشادات التصميم والإخراج](#13-إرشادات-التصميم)

---

## 1. الصفحة الرئيسية

### `GET /api/v1/homepage`

يرجع بيانات الصفحة الرئيسية كاملة في طلب واحد: الكروسيل (المميزة)، آخر الأخبار، والعاجل.

**Response:**
```json
{
  "hero": [
    {
      "id": "uuid",
      "title": "عنوان الخبر",
      "subtitle": "عنوان فرعي أو null",
      "slug": "slug-الخبر",
      "body": "نص المقالة بدون HTML",
      "excerpt": "مقتطف قصير 200 حرف...",
      "section": "محليات",
      "section_id": "uuid",
      "author": "محمد أحمد",
      "published_at": "2026-03-23T06:24:37.910Z",
      "updated_at": "2026-03-23T07:00:00.000Z",
      "image_url": "https://sabq.org/...",
      "article_url": "https://sabq.org/article/slug",
      "is_breaking": false,
      "is_featured": true,
      "reading_minutes": 3,
      "views_count": 1250,
      "shares_count": 45
    }
  ],
  "latest": [ /* same article format, 20 items */ ],
  "breaking": [ /* same article format, 10 items, last 24 hours */ ]
}
```

**التصميم:**
- `hero` → Carousel أفقي أعلى الصفحة (5 مقالات مميزة). كل كارد يعرض الصورة كخلفية كاملة + عنوان أبيض بتأثير gradient أسفل + badge القسم + وقت النشر
- `latest` → قائمة عمودية (thumbnail يسار + عنوان + قسم + وقت)
- `breaking` → شريط عاجل أعلى الكروسيل بلون أحمر + أيقونة برق

---

## 2. المقالات والأخبار

### `GET /api/v1/articles` — قائمة المقالات

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | int | 20 | الحد الأقصى 50 |
| `offset` | int | 0 | للتصفح |
| `section` | string | - | فلتر حسب category ID |
| `breaking` | "true" | - | العاجل فقط |
| `featured` | "true" | - | المميزة فقط |
| `q` | string | - | بحث في العنوان |

**Response:**
```json
{
  "articles": [ /* article objects */ ],
  "total": 1500,
  "limit": 20,
  "offset": 0,
  "hasMore": true
}
```

### `GET /api/v1/articles/:id` — تفاصيل مقالة

يقبل UUID أو slug.

**Response:**
```json
{
  "id": "uuid",
  "title": "عنوان الخبر",
  "subtitle": "عنوان فرعي",
  "slug": "slug-name",
  "body": "نص المقالة كاملاً (plain text)",
  "excerpt": "مقتطف",
  "section": "محليات",
  "section_id": "uuid",
  "author": "محمد أحمد",
  "author_image": "https://... أو null",
  "published_at": "ISO 8601",
  "updated_at": "ISO 8601",
  "image_url": "https://...",
  "article_url": "https://sabq.org/article/slug",
  "is_breaking": false,
  "is_featured": true,
  "reading_minutes": 3,
  "views_count": 1250,
  "shares_count": 45,
  "tags": ["وزارة الداخلية", "الرياض"],
  "album_images": ["url1", "url2"],
  "related_articles": [
    {
      "id": "uuid",
      "title": "خبر مشابه",
      "image_url": "https://...",
      "section": "محليات",
      "slug": "slug",
      "published_at": "ISO 8601"
    }
  ]
}
```

**التصميم — صفحة التفاصيل:**
- صورة كاملة العرض أعلى الصفحة مع gradient أسفل
- اسم القسم كـ Badge ملون أعلى يسار الصورة
- العنوان بخط عريض كبير (22pt)
- صف المعلومات: اسم الكاتب + صورته + تاريخ النشر + وقت القراءة
- Tags كـ chips أسفل الخبر
- شريط المشاركة: مشاركة + حفظ + تكبير الخط
- album_images → معرض صور أفقي قابل للسحب
- related_articles → قائمة أفقية scrollable أسفل الخبر

### `POST /api/v1/articles/:id/view` — تسجيل مشاهدة

**Body:**
```json
{
  "deviceId": "UUID or device identifier",
  "source": "push" | "feed" | "search" | "related" | "share"
}
```

### `POST /api/v1/articles/batch-view` — تسجيل مشاهدات متعددة

**Body:**
```json
{
  "articleIds": ["uuid1", "uuid2"],
  "source": "feed"
}
```

---

## 3. الأقسام

### `GET /api/v1/sections`

**Response:**
```json
{
  "sections": [
    {
      "id": "uuid",
      "name": "محليات",
      "name_en": "Local",
      "slug": "local",
      "icon": "building.2",
      "articles_count": 450,
      "display_order": 1
    }
  ]
}
```

**ملاحظة:** حقل `icon` يحتوي اسم SF Symbol جاهز للاستخدام المباشر في SwiftUI:
| القسم | SF Symbol |
|-------|-----------|
| محليات | `building.2` |
| عالمية | `globe` |
| سياسة | `flag` |
| رياضة | `sportscourt` |
| اقتصاد | `chart.line.uptrend.xyaxis` |
| تقنية | `cpu` |
| حياتنا | `heart` |
| ثقافة | `book` |
| default | `newspaper` |

### `GET /api/v1/menu-groups` — (Legacy format)

نفس البيانات بصيغة التطبيق القديم.

---

## 4. الأخبار العاجلة

### `GET /api/v1/breaking`

**Parameters:**
| Parameter | Type | Default |
|-----------|------|---------|
| `limit` | int | 10 (max 30) |

يرجع الأخبار العاجلة في آخر 24 ساعة.

**Response:**
```json
{
  "articles": [ /* article format */ ],
  "count": 5
}
```

**التصميم:**
- شريط أحمر ثابت أعلى الشاشة مع أيقونة برق
- نص متحرك (marquee) أو swipeable cards
- عند الضغط → فتح صفحة التفاصيل

---

## 5. البحث

### `GET /api/v1/search`

**Parameters:**
| Parameter | Type | Default |
|-----------|------|---------|
| `q` | string | **مطلوب** |
| `limit` | int | 20 (max 50) |
| `offset` | int | 0 |

**Response:**
```json
{
  "query": "الرياض",
  "articles": [ /* article format */ ],
  "total": 120,
  "hasMore": true
}
```

---

## 6. الأكثر تداولاً

### `GET /api/v1/trending`

يرجع الأخبار الأكثر مشاهدة في آخر 48 ساعة + أكثر الوسوم تداولاً.

**Response:**
```json
{
  "articles": [ /* article format, 10 items */ ],
  "tags": ["وزارة الداخلية", "النفط", "دوري روشن"]
}
```

**التصميم:**
- ترقيم واضح (1, 2, 3...) بجانب كل خبر
- Tags كـ chips قابلة للضغط (تفتح نتائج بحث)
- أيقونة trending 🔥 (استخدم SF Symbol `flame.fill`)

---

## 7. البث الحي

### `GET /api/v1/live` — التغطية الكاملة

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `country` | string | all | فلتر: `saudi_arabia`, `uae`, `bahrain`, `kuwait`, `qatar`, `oman`, `yemen` |
| `limit` | int | 50 (max 200) | عدد الأحداث |
| `offset` | int | 0 | للتصفح |
| `since` | ISO date | - | أحداث بعد تاريخ معين (مفيد للـ pull-to-refresh) |

**Response:**
```json
{
  "title_ar": "البث الحي — الاعتداءات على دول الخليج",
  "title_en": "Live Coverage — Attacks on Gulf States",
  "is_live": true,
  "stats": {
    "total_events": 344,
    "intercepted": 243,
    "injuries": 14,
    "martyrdom": 0,
    "by_country": {
      "saudi_arabia": 224,
      "uae": 39,
      "kuwait": 36,
      "bahrain": 22,
      "qatar": 21,
      "oman": 2
    }
  },
  "countries": [
    {
      "key": "saudi_arabia",
      "name_ar": "السعودية",
      "name_en": "Saudi Arabia",
      "count": 224
    }
  ],
  "event_types": [
    {
      "key": "drone_intercepted",
      "label_ar": "صد مسيّرة",
      "label_en": "Drone Intercepted",
      "severity": "success"
    },
    {
      "key": "ballistic_intercepted",
      "label_ar": "صد صاروخ باليستي",
      "label_en": "Ballistic Intercepted",
      "severity": "success"
    },
    {
      "key": "cruise_intercepted",
      "label_ar": "صد صاروخ كروز",
      "label_en": "Cruise Intercepted",
      "severity": "success"
    },
    {
      "key": "ballistic_and_drone",
      "label_ar": "صد صاروخ باليستي ومسيّرة",
      "label_en": "Ballistic & Drone Intercepted",
      "severity": "success"
    },
    {
      "key": "debris_fallen",
      "label_ar": "سقوط شظايا",
      "label_en": "Debris Fallen",
      "severity": "warning"
    },
    {
      "key": "no_damage",
      "label_ar": "لا أضرار",
      "label_en": "No Damage",
      "severity": "info"
    },
    {
      "key": "injuries",
      "label_ar": "إصابات",
      "label_en": "Injuries",
      "severity": "danger"
    },
    {
      "key": "martyrdom",
      "label_ar": "استشهاد",
      "label_en": "Martyrdom",
      "severity": "critical"
    },
    {
      "key": "official_statement",
      "label_ar": "بيان رسمي",
      "label_en": "Official Statement",
      "severity": "info"
    },
    {
      "key": "official_comment",
      "label_ar": "تصريح مسؤول",
      "label_en": "Official Comment",
      "severity": "info"
    },
    {
      "key": "military_action",
      "label_ar": "تحرك عسكري",
      "label_en": "Military Action",
      "severity": "danger"
    },
    {
      "key": "international_condemnation",
      "label_ar": "إدانة دولية",
      "label_en": "International Condemnation",
      "severity": "info"
    }
  ],
  "timeline": [
    {
      "date": "2026-03-23",
      "events": [ /* event objects */ ]
    },
    {
      "date": "2026-03-22",
      "events": [ /* event objects */ ]
    }
  ],
  "events": [
    {
      "id": "uuid",
      "content": "الدفاع تعلن اعتراض وتدمير مسيَّرتين بالمنطقة الشرقية",
      "country": "saudi_arabia",
      "country_name_ar": "السعودية",
      "country_name_en": "Saudi Arabia",
      "event_type": "drone_intercepted",
      "event_type_label_ar": "صد مسيّرة",
      "event_type_label_en": "Drone Intercepted",
      "severity": "success",
      "priority": "urgent" | "important" | "normal",
      "source_type": "official_statement",
      "source_type_label_ar": "بيان رسمي",
      "source_type_label_en": "Official Statement",
      "source_name": "وزارة الدفاع",
      "is_pinned": false,
      "is_update": false,
      "parent_event_id": null,
      "published_at": "2026-03-23T06:24:37.910Z",
      "edited_at": null,
      "created_at": "2026-03-23T06:24:37.928Z"
    }
  ],
  "total": 344,
  "limit": 50,
  "offset": 0,
  "has_more": true
}
```

### `GET /api/v1/live/stats` — الإحصائيات فقط (خفيف)

للتحديث السريع بدون جلب كل الأحداث.

**Response:**
```json
{
  "total_events": 344,
  "intercepted": 243,
  "drone_intercepted": 219,
  "ballistic_intercepted": 55,
  "cruise_intercepted": 2,
  "debris": 11,
  "injuries": 14,
  "martyrdom": 0,
  "by_country": { "saudi_arabia": 224, "uae": 39, ... },
  "last_updated": "2026-03-23T06:24:37.910Z"
}
```

### `GET /api/v1/live/:id` — تفاصيل حدث مع التحديثات

**Response:**
```json
{
  "event": { /* event object */ },
  "updates": [ /* child event objects */ ],
  "updates_count": 3
}
```

### ألوان Severity لتصميم البث الحي

| severity | اللون | الاستخدام |
|----------|-------|-----------|
| `success` | أخضر `#22C55E` | اعتراض ناجح |
| `info` | أزرق `#3B82F6` | بيانات وتصريحات |
| `warning` | أصفر `#EAB308` | شظايا |
| `danger` | برتقالي/أحمر `#F97316` | إصابات، تحرك عسكري |
| `critical` | أحمر غامق `#DC2626` | استشهاد |

### التصميم — صفحة البث الحي

**الهيكل:**

```
┌─────────────────────────────────┐
│  ← الرئيسية   البث الحي        │  Breadcrumb
├─────────────────────────────────┤
│  🔴 البث الحي — الاعتداءات على  │  Header
│     دول الخليج                  │
│  ● مباشر  آخر تحديث: قبل 5 د   │
├─────────────────────────────────┤
│  ╔═══════════════════════════╗  │
│  ║  344     243    14    0   ║  │  Stats Bar
│  ║  حدث   اعتراض  إصابة شهيد║  │
│  ╚═══════════════════════════╝  │
├─────────────────────────────────┤
│  [الكل] [السعودية] [الإمارات]  │  Country Filter
│  [البحرين] [الكويت] [قطر]      │  (Horizontal scroll)
├─────────────────────────────────┤
│                                 │
│  ── الأحد 23 مارس 2026 ──────  │  Date Header
│                                 │
│  ⚡ 06:24  [عاجل] [صد مسيّرة]  │  Event Card (urgent)
│  │  🇸🇦 السعودية                │
│  │  الدفاع تعلن اعتراض وتدمير  │
│  │  مسيَّرتين بالمنطقة الشرقية  │
│  │              [شارك]          │
│  │                              │
│  ○ 05:15  [بيان رسمي]          │  Event Card (normal)
│  │  🇸🇦 السعودية                │
│  │  التحالف: تدمير 3 مسيّرات   │
│  │  مفخخة أطلقت باتجاه المملكة │
│  │              [شارك]          │
│  │                              │
│  ── السبت 22 مارس 2026 ──────  │  Date Header
│  │                              │
│  ...                            │
│                                 │
└─────────────────────────────────┘
```

**تفاصيل التصميم:**

1. **Header:** أيقونة Radio + عنوان + مؤشر "مباشر" أحمر نابض + آخر تحديث
2. **Stats Bar:** 4 أرقام كبيرة (total, intercepted, injuries, martyrdom) بخلفية card
3. **Country Filter:** أزرار pill أفقية scrollable. المحدد بلون primary، الباقي بلون muted
4. **Timeline:** خط عمودي رمادي يربط الأحداث. كل حدث له دائرة على الخط:
   - `urgent` → دائرة حمراء + أيقونة برق + حدود حمراء للكارد
   - `is_pinned` → أيقونة pin + خلفية primary خفيفة
   - `normal` → دائرة عادية مع علم الدولة
5. **Event Card:** يحتوي:
   - الوقت (HH:mm بتوقيت السعودية)
   - Badges: priority + event_type (ملون حسب severity)
   - علم الدولة + اسمها
   - نص الحدث
   - زر مشاركة
   - إذا `is_update` → badge "تحديث"
   - إذا `edited_at` → "تم التحديث قبل X"
6. **Pull-to-Refresh:** استخدم `since` parameter مع تاريخ آخر حدث لجلب الجديد فقط
7. **Load More:** استخدم `offset` للتحميل التدريجي

**صفحة تفاصيل الحدث (`/live/:id`):**
- نفس تصميم الكارد لكن بحجم أكبر
- أسفله قائمة التحديثات المرتبطة (updates) بتسلسل زمني
- كل update يظهر كـ sub-card متصل بخط زمني

---

## 8. العضوية والتسجيل

### `POST /api/v1/auth/register` — تسجيل عضو جديد

**Body:**
```json
{
  "email": "user@example.com",
  "password": "123456",
  "firstName": "محمد",
  "lastName": "أحمد",
  "phone": "+966501234567",
  "gender": "male",
  "city": "الرياض",
  "country": "SA",
  "locale": "ar"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "تم إنشاء الحساب بنجاح. تم إرسال رمز التفعيل إلى بريدك الإلكتروني",
  "userId": "uuid",
  "emailSent": true
}
```

**Errors:**
- `400` — كلمة مرور أقل من 6 أحرف
- `409` — البريد أو الجوال مسجل مسبقاً

### `POST /api/v1/auth/activate` — تفعيل الحساب

**Body:**
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

### `POST /api/v1/auth/resend-activation` — إعادة إرسال رمز التفعيل

**Body:**
```json
{
  "email": "user@example.com"
}
```

### `POST /api/v1/auth/login` — تسجيل الدخول

**Body:**
```json
{
  "email": "user@example.com",
  "password": "123456",
  "deviceToken": "apns-token",
  "deviceName": "iPhone 15 Pro",
  "osVersion": "18.3",
  "appVersion": "2.0.0"
}
```

**Response:**
```json
{
  "success": true,
  "message": "تم تسجيل الدخول بنجاح",
  "token": "session-token-uuid",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "محمد",
    "lastName": "أحمد",
    "role": "reader",
    "profileImageUrl": "https://... أو null",
    "phone": "+966501234567",
    "gender": "male",
    "city": "الرياض",
    "country": "SA",
    "locale": "ar"
  }
}
```

### `POST /api/v1/auth/logout`

**Headers:** `Authorization: Bearer {token}`

### `POST /api/v1/auth/logout-all` — تسجيل خروج من كل الأجهزة

**Headers:** `Authorization: Bearer {token}`

### `POST /api/v1/auth/forgot-password`

**Body:**
```json
{
  "email": "user@example.com"
}
```

### `POST /api/v1/auth/reset-password`

**Body:**
```json
{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "newpass123"
}
```

---

## 9. الملف الشخصي

### `GET /api/v1/members/profile`

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "firstName": "محمد",
  "lastName": "أحمد",
  "phone": "+966501234567",
  "gender": "male",
  "city": "الرياض",
  "country": "SA",
  "locale": "ar",
  "profileImageUrl": "https://...",
  "role": "reader",
  "createdAt": "ISO 8601"
}
```

### `PUT /api/v1/members/profile` — تحديث البيانات

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "firstName": "محمد",
  "lastName": "أحمد",
  "phone": "+966501234567",
  "gender": "male",
  "city": "جدة",
  "locale": "ar"
}
```

### `POST /api/v1/members/profile/image` — رفع صورة الملف الشخصي

**Headers:** `Authorization: Bearer {token}`  
**Content-Type:** `multipart/form-data`

**Body:** `image` field with image file

### `DELETE /api/v1/members/profile/image` — حذف صورة الملف الشخصي

### `POST /api/v1/members/change-password`

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "currentPassword": "old-pass",
  "newPassword": "new-pass"
}
```

### `DELETE /api/v1/members/account` — حذف الحساب

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "password": "current-password"
}
```

---

## 10. الإشعارات

### `POST /api/v1/devices/register` — تسجيل الجهاز

**Body:**
```json
{
  "token": "apns-device-token",
  "platform": "ios",
  "tokenProvider": "apns",
  "deviceName": "iPhone 15 Pro",
  "osVersion": "18.3",
  "appVersion": "2.0.0",
  "language": "ar",
  "timezone": "Asia/Riyadh",
  "userId": "uuid أو null"
}
```

**ملاحظات:**
- `token` أو `deviceToken` — كلاهما مقبول
- `language` أو `locale` — كلاهما مقبول
- Expo tokens مرفوضة — يجب استخدام APNs native token
- عند التسجيل بـ userId، يتم إلغاء التوكنات القديمة لنفس المستخدم تلقائياً

### `DELETE /api/v1/devices/unregister`

**Body:**
```json
{
  "deviceToken": "apns-device-token"
}
```

### `GET /api/v1/devices/status` — حالة الجهاز

**Query:** `?token=apns-device-token`

### `GET /api/v1/topics` — المواضيع المتاحة

**Response:**
```json
[
  { "id": "all_users", "name": "All Users", "nameAr": "جميع المستخدمين", "isDefault": true },
  { "id": "breaking_news", "name": "Breaking News", "nameAr": "الأخبار العاجلة", "isDefault": true },
  { "id": "sports", "name": "Sports", "nameAr": "الرياضة", "isDefault": false },
  { "id": "tech", "name": "Technology", "nameAr": "التقنية", "isDefault": false }
]
```

### `POST /api/v1/notifications/event` — تسجيل تفاعل مع إشعار

**Body:**
```json
{
  "deviceToken": "token",
  "campaignId": "uuid",
  "eventType": "delivered" | "opened" | "dismissed",
  "articleId": "uuid (optional)"
}
```

### `POST /api/v1/members/fcm-token` — ربط FCM token بالعضو

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "fcmToken": "fcm-token-string"
}
```

---

## 11. الاهتمامات

### `GET /api/v1/interests` — الأقسام المتاحة للاهتمام

**Response:**
```json
{
  "categories": [
    { "id": "uuid", "name": "محليات", "slug": "local" }
  ]
}
```

### `GET /api/v1/members/interests` — اهتمامات العضو

**Headers:** `Authorization: Bearer {token}`

### `PUT /api/v1/members/interests` — تحديث الاهتمامات

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "categoryIds": ["uuid1", "uuid2", "uuid3"]
}
```

### `POST /api/v1/members/interests/add` — إضافة اهتمام

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "categoryId": "uuid"
}
```

### `DELETE /api/v1/members/interests/:categoryId` — إزالة اهتمام

---

## 12. الأدوار

### `GET /api/v1/roles`

**Response:**
```json
{
  "roles": [
    { "key": "system_admin", "name_ar": "مدير النظام", "name_en": "System Admin", "description_ar": "صلاحيات كاملة على النظام" },
    { "key": "admin", "name_ar": "مسؤول", "name_en": "Admin", "description_ar": "إدارة المستخدمين والموافقات..." },
    { "key": "editor", "name_ar": "محرر", "name_en": "Editor", "description_ar": "إنشاء وتحرير ونشر المحتوى..." },
    { "key": "reporter", "name_ar": "مراسل", "name_en": "Reporter", "description_ar": "إنشاء وتحرير المقالات الخاصة..." },
    { "key": "opinion_author", "name_ar": "كاتب مقال رأي", "name_en": "Opinion Author", "description_ar": "كتابة مقالات الرأي..." },
    { "key": "comments_moderator", "name_ar": "مشرف تعليقات", "name_en": "Comments Moderator", "description_ar": "إدارة التعليقات..." },
    { "key": "media_manager", "name_ar": "مدير وسائط", "name_en": "Media Manager", "description_ar": "إدارة المكتبة الإعلامية..." },
    { "key": "reader", "name_ar": "قارئ", "name_en": "Reader", "description_ar": "مستخدم عادي بدون صلاحيات تحريرية" }
  ]
}
```

---

## 13. إرشادات التصميم والإخراج

### الألوان الأساسية

| الاسم | Light Mode | Dark Mode | الاستخدام |
|-------|-----------|-----------|-----------|
| Primary | `#1A73E8` | `#4A9AF5` | أزرار، روابط، badges |
| Background | `#FFFFFF` | `#111111` | خلفية الشاشات |
| Card | `#F8F9FA` | `#1A1A1A` | خلفية البطاقات |
| Text Primary | `#1A1A1A` | `#F5F5F5` | العناوين |
| Text Secondary | `#6B7280` | `#9CA3AF` | معلومات إضافية |
| Text Tertiary | `#9CA3AF` | `#6B7280` | تاريخ، وقت |
| Breaking | `#DC2626` | `#EF4444` | شريط العاجل |
| Success | `#22C55E` | `#4ADE80` | اعتراض ناجح |
| Warning | `#EAB308` | `#FACC15` | تنبيهات |

### الخطوط

- **العربية:** `SF Arabic` (system) — يدعم RTL بشكل أصلي
- **الأرقام:** `SF Mono` أو `Menlo` للأوقات في البث الحي
- **أحجام النصوص:**
  - عنوان كروسيل: 22pt bold
  - عنوان خبر في القائمة: 16pt semibold
  - عنوان قسم: 14pt semibold
  - نص المقالة: 17pt regular (line height 1.8)
  - معلومات ثانوية: 13pt regular
  - بيانات وقت: 11pt mono

### هيكل التنقل (Navigation)

```
TabBar (5 tabs):
├── 🏠 الرئيسية (Homepage)
│   ├── Breaking ticker
│   ├── Hero carousel
│   ├── Latest articles list
│   └── → Article detail
├── 📰 الأقسام (Sections)
│   ├── Section list
│   ├── Section articles
│   └── → Article detail
├── 🔴 البث الحي (Live)
│   ├── Stats bar
│   ├── Country filter
│   ├── Timeline
│   └── → Event detail
├── 🔍 البحث (Search)
│   ├── Search input
│   ├── Trending tags
│   └── Results list
└── 👤 حسابي (Profile)
    ├── Login / Register
    ├── Profile info
    ├── Interests
    ├── Notifications settings
    └── App settings
```

### Pull-to-Refresh

| الشاشة | الأسلوب |
|--------|---------|
| الرئيسية | إعادة طلب `/homepage` |
| البث الحي | إرسال `since` بتاريخ آخر حدث لجلب الجديد فقط |
| قائمة المقالات | إعادة طلب `/articles` مع reset offset |
| التفاصيل | إعادة طلب `/articles/:id` |

### Pagination Pattern

```swift
// Swift pseudo-code
func loadMore() {
    guard hasMore, !isLoading else { return }
    isLoading = true
    let url = "/api/v1/articles?limit=20&offset=\(articles.count)"
    // fetch and append...
}
```

### Caching Strategy

| Endpoint | TTL | ملاحظة |
|----------|-----|--------|
| `/homepage` | 15 ثانية | s-maxage=15 لضمان تحديث الأخبار |
| `/articles/:id` | 5 دقائق | نادراً ما يتغير بعد النشر |
| `/sections` | 5 دقائق | cached server-side |
| `/live` | لا cache | بيانات مباشرة |
| `/trending` | 10 دقائق | cached server-side |
| `/breaking` | 30 ثانية | بيانات حساسة للوقت |

### Error Handling

كل الـ endpoints ترجع أخطاء بنفس الصيغة:

```json
{
  "error": {
    "code": "NOT_FOUND" | "SERVER_ERROR" | "UNAUTHORIZED",
    "message": "رسالة عربية للعرض",
    "status": 404
  }
}
```

أو الصيغة البسيطة:
```json
{
  "success": false,
  "message": "رسالة الخطأ"
}
```

### Share Format

عند مشاركة خبر:
```
عنوان الخبر

رابط الخبر: https://sabq.org/article/slug

المصدر: صحيفة سبق الإلكترونية
```

عند مشاركة حدث بث حي:
```
🇸🇦 السعودية | صد مسيّرة
الدفاع تعلن اعتراض وتدمير مسيَّرتين بالمنطقة الشرقية

المصدر: صحيفة سبق
```
