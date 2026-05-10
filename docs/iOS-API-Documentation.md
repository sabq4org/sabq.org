# توثيق API تطبيق سبق للـ iOS
# Sabq iOS App — Complete API Documentation

> **الإصدار:** 1.0  
> **التاريخ:** فبراير 2026  
> **الترميز:** UTF-8  
> **التنسيق:** JSON فقط  
> **اللغة الرئيسية:** العربية (RTL)

---

## فهرس المحتويات

1. [معلومات عامة — General Info](#1-معلومات-عامة)
2. [المصادقة — Authentication](#2-المصادقة)
3. [الأخبار — Articles & News](#3-الأخبار)
4. [التصنيفات — Categories](#4-التصنيفات)
5. [المستخدمون — User Auth & Profile](#5-المستخدمون)
6. [الاهتمامات — Interests](#6-الاهتمامات)
7. [الإشعارات وتسجيل الأجهزة — Push Notifications](#7-الإشعارات)
8. [التعليقات — Comments](#8-التعليقات)
9. [التفاعلات والمفضلة — Reactions & Bookmarks](#9-التفاعلات-والمفضلة)
10. [البحث — Search](#10-البحث)
11. [قائمة التنقل — Menu Groups](#11-قائمة-التنقل)
12. [تسجيل المشاهدات — View Tracking](#12-تسجيل-المشاهدات)
13. [الأخبار العاجلة — Breaking News](#13-الأخبار-العاجلة)
14. [الصوت — Audio Newsletters](#14-الصوت)
15. [نماذج البيانات — Data Models](#15-نماذج-البيانات)
16. [أكواد الخطأ — Error Codes](#16-أكواد-الخطأ)
17. [الروابط العميقة — Deep Links](#17-الروابط-العميقة)

---

## 1. معلومات عامة

### Base URLs

| البيئة | الرابط |
|--------|--------|
| **Production** | `https://sabq.org` |
| **API Prefix (Mobile)** | `https://sabq.org/api/v1` |
| **API Prefix (Web)** | `https://sabq.org/api` |

### تفاصيل تقنية

| الخاصية | القيمة |
|---------|--------|
| تنسيق البيانات | JSON |
| الترميز | UTF-8 |
| GraphQL | لا يوجد — REST فقط |
| WebSocket | لا يوجد (Breaking News عبر Polling) |
| Rate Limiting | غير محدد حالياً، يُنصح بـ 60 طلب/دقيقة |
| API Version | v1 |
| HTTP Methods المدعومة | GET, POST, PUT, PATCH, DELETE |

### Headers المطلوبة في كل طلب

```http
Content-Type: application/json
Accept: application/json
Authorization: Bearer {token}      ← مطلوب للـ endpoints الخاصة فقط
X-App-Version: 1.0.0              ← مُستحسن
X-Platform: ios                    ← مُستحسن
```

### CDN الصور

الصور مخزنة على Cloudflare Images وGoogle Cloud Storage. أي URL صورة مُرجَع من الـ API يكون جاهزاً للعرض المباشر. لا يوجد تحويل مطلوب.

---

## 2. المصادقة

### نوع المصادقة

**Bearer Token** — يُولَّد عند تسجيل الدخول من خلال `POST /api/v1/auth/login`.

- **مدة الصلاحية:** 30 يوماً
- **التجديد:** لا يوجد Refresh Token — يجب تسجيل الدخول مجدداً عند انتهاء الصلاحية
- **التخزين:** يجب تخزين التوكن بشكل آمن في iOS Keychain
- **الإلغاء:** `POST /api/v1/auth/logout` أو `POST /api/v1/auth/logout-all`

### إرسال التوكن

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### الـ Endpoints التي لا تحتاج Authentication

- جميع `GET /api/v1/*` لقراءة المحتوى
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/activate`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`
- `POST /api/v1/articles/:id/view`
- `POST /api/v1/devices/register`

### الـ Endpoints التي تحتاج Authentication

- `GET /api/v1/members/profile`
- `PUT /api/v1/members/profile`
- `POST /api/v1/members/profile/image`
- `DELETE /api/v1/members/profile/image`
- `POST /api/v1/members/change-password`
- `GET /api/v1/members/interests`
- `PUT /api/v1/members/interests`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `DELETE /api/v1/members/account`

---

## 3. الأخبار

### 3.1 قائمة المقالات

```
GET /api/v1/articles
```

**يحتاج Authentication:** لا

**Query Parameters:**

| الحقل | النوع | مطلوب | الوصف | القيمة الافتراضية |
|-------|-------|--------|-------|-------------------|
| `limit` | integer | لا | عدد النتائج (الحد الأقصى 200) | `50` |
| `offset` | integer | لا | تخطي عدد من النتائج | `0` |
| `category` | string | لا | معرف القسم (UUID) | — |
| `status` | string | لا | حالة المقال: `published` | `published` |
| `since` | string (ISO 8601) | لا | مقالات منذ تاريخ معين | — |
| `newsType` | string | لا | `breaking` أو `featured` أو `regular` | — |
| `featured` | boolean | لا | `true` للمقالات المميزة | — |

**مثال الطلب:**

```bash
curl "https://sabq.org/api/v1/articles?limit=20&offset=0" \
  -H "Accept: application/json"
```

**مثال الاستجابة الناجحة (200):**

```json
{
  "total": 20,
  "limit": 20,
  "offset": 0,
  "hasMore": true,
  "articles": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "url": "https://sabq.org/article/saudi-economy-growth-2026",
      "canonical_url": "https://sabq.org/article/saudi-economy-growth-2026",
      "title": "نمو الاقتصاد السعودي يتجاوز التوقعات في 2026",
      "subtitle": "تقرير صندوق النقد الدولي يُشير إلى ارتفاع بنسبة 4.2%",
      "section": "الاقتصاد",
      "section_en": "Economy",
      "category_id": "cat-uuid-here",
      "author": {
        "id": "user-uuid",
        "name": "محمد العمري",
        "email": "m.omari@sabq.org",
        "profile_image": "https://cdn.sabq.org/avatars/user-uuid.jpg"
      },
      "lang": "ar",
      "published_at": "2026-02-25T10:30:00.000Z",
      "updated_at": "2026-02-25T11:00:00.000Z",
      "summary": "ملخص ذكي للمقال يتضمن أبرز النقاط",
      "excerpt": "مقتطف من المقال للعرض في القوائم",
      "full_text": "<p>محتوى المقال كاملاً بصيغة HTML</p>",
      "image": "https://cdn.sabq.org/articles/article-uuid/main.jpg",
      "albumImages": [
        "https://cdn.sabq.org/articles/article-uuid/photo1.jpg"
      ],
      "contentImages": [
        {
          "url": "https://cdn.sabq.org/articles/article-uuid/content1.jpg",
          "alt": "وصف الصورة",
          "position": 0
        }
      ],
      "article_type": "news",
      "news_type": "regular",
      "is_featured": false,
      "views": 15240,
      "credibility_score": 92,
      "seo": {
        "title": "نمو الاقتصاد السعودي 2026",
        "description": "وصف SEO للمقال"
      }
    }
  ]
}
```

**Pagination:**
- استخدم `offset` لتحميل المزيد
- `hasMore: true` يعني هناك المزيد من النتائج
- مثال: الصفحة الثانية: `?limit=20&offset=20`

---

### 3.2 مقال واحد بالتفاصيل الكاملة

```
GET /api/v1/articles/:id
```

**يحتاج Authentication:** لا

**Path Parameters:**

| الحقل | النوع | الوصف |
|-------|-------|-------|
| `id` | string (UUID) | معرف المقال |

**مثال الطلب:**

```bash
curl "https://sabq.org/api/v1/articles/550e8400-e29b-41d4-a716-446655440000"
```

**مثال الاستجابة الناجحة (200):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "url": "https://sabq.org/article/saudi-economy-growth-2026",
  "canonical_url": "https://sabq.org/article/saudi-economy-growth-2026",
  "title": "نمو الاقتصاد السعودي يتجاوز التوقعات",
  "subtitle": "تقرير صندوق النقد الدولي",
  "section": "الاقتصاد",
  "section_en": "Economy",
  "tags": ["اقتصاد", "السعودية", "نمو"],
  "author": {
    "id": "user-uuid",
    "name": "محمد العمري",
    "email": "m.omari@sabq.org",
    "bio": "مراسل اقتصادي",
    "profile_image": "https://cdn.sabq.org/avatars/user-uuid.jpg",
    "profile_url": "https://sabq.org/reporter/user-uuid"
  },
  "lang": "ar",
  "published_at": "2026-02-25T10:30:00.000Z",
  "updated_at": "2026-02-25T11:00:00.000Z",
  "created_at": "2026-02-25T09:00:00.000Z",
  "summary": "ملخص ذكي بالذكاء الاصطناعي",
  "excerpt": "مقتطف قصير",
  "full_text": "<p>محتوى المقال الكامل...</p>",
  "images": [
    {
      "url": "https://cdn.sabq.org/articles/uuid/main.jpg",
      "caption": "عنوان المقال",
      "copyright": "© صحيفة سبق"
    }
  ],
  "albumImages": ["https://cdn.sabq.org/articles/uuid/photo1.jpg"],
  "contentImages": [
    { "url": "...", "alt": "...", "position": 0 }
  ],
  "article_type": "news",
  "news_type": "regular",
  "is_featured": false,
  "views": 15240,
  "credibility_score": 92,
  "credibility_analysis": { "details": "..." },
  "seo": {
    "title": "...",
    "description": "..."
  }
}
```

**استجابة الخطأ (404):**

```json
{ "message": "Article not found" }
```

---

### 3.3 المقالات حسب القسم

```
GET /api/v1/articles?category={categoryId}
```

يستخدم نفس الـ endpoint السابق مع تصفية حسب `category`.

---

### 3.4 البحث في المقالات

```
GET /api/v1/search
```

**يحتاج Authentication:** لا

**Query Parameters:**

| الحقل | النوع | مطلوب | الوصف |
|-------|-------|--------|-------|
| `q` | string | نعم | نص البحث |
| `limit` | integer | لا | عدد النتائج (الافتراضي: 10) |
| `offset` | integer | لا | للـ pagination |
| `categoryId` | string | لا | تصفية حسب القسم |

**مثال الطلب:**

```bash
curl "https://sabq.org/api/v1/search?q=الاقتصاد+السعودي&limit=10"
```

**مثال الاستجابة (200):**

```json
{
  "query": "الاقتصاد السعودي",
  "total": 45,
  "results": [
    {
      "id": "article-uuid",
      "title": "نمو الاقتصاد السعودي",
      "excerpt": "...",
      "url": "https://sabq.org/article/slug",
      "image": "https://cdn.sabq.org/...",
      "published_at": "2026-02-25T10:30:00.000Z",
      "section": "الاقتصاد"
    }
  ]
}
```

---

### 3.5 مقالات الصفحة الرئيسية

```
GET /api/homepage
```

**يحتاج Authentication:** لا

يُرجع مجموعة أقسام الصفحة الرئيسية بشكل كامل (Hero، أخبار حديثة، مميزة، إلخ).

**مثال الاستجابة (200):**

```json
{
  "hero": { "article": {...} },
  "breaking": [...],
  "featured": [...],
  "sections": [
    {
      "category": { "id": "...", "name": "الرياضة", "slug": "sports" },
      "articles": [...]
    }
  ],
  "opinion": [...],
  "mostRead": [...]
}
```

---

### 3.6 المقالات المُميزة

```
GET /api/v1/articles?featured=true&limit=10
```

---

### 3.7 المقالات المشابهة / ذات الصلة

```
GET /api/articles/:slug/related
```

**يحتاج Authentication:** لا

**مثال الاستجابة:**

```json
{
  "articles": [...]
}
```

---

### 3.8 الصور الأسبوعية (Photo Stories)

```
GET /api/v1/weekly-photos
```

**Query Parameters:**

| الحقل | النوع | الوصف |
|-------|-------|-------|
| `page` | integer | رقم الصفحة |
| `limit` | integer | عدد النتائج |

---

## 4. التصنيفات

### 4.1 قائمة التصنيفات

```
GET /api/v1/categories
```

**يحتاج Authentication:** لا

**مثال الاستجابة (200):**

```json
{
  "total": 15,
  "categories": [
    {
      "id": "cat-uuid",
      "name_ar": "السياسة",
      "name_en": "Politics",
      "slug": "politics",
      "description": "أخبار السياسة السعودية والدولية",
      "url": "https://sabq.org/category/politics"
    }
  ]
}
```

---

### 4.2 قائمة التنقل (Menu Groups) — للتطبيق

```
GET /api/v1/menu-groups
```

**يحتاج Authentication:** لا

هذا الـ endpoint مخصص للتطبيق ويُرجع الأقسام بتنسيق خاص يتوافق مع الهيكل القديم للتطبيق.

**مثال الاستجابة (200):**

```json
{
  "menu-groups": {
    "default": {
      "id": 2492,
      "slug": "default",
      "name": "default",
      "items": [
        {
          "tag-name": null,
          "entity-properties": null,
          "collection-id": 89382,
          "entity-slug": null,
          "item-id": 32078,
          "rank": 22545,
          "title": "السياسة",
          "item-type": "section",
          "section-slug": "politics",
          "tag-slug": null,
          "id": 22545,
          "parent-id": null,
          "url": "https://sabq.org/politics",
          "entity-name": null,
          "collection-slug": "politics",
          "section-name": "السياسة",
          "data": {
            "color": "#FF5733"
          }
        }
      ]
    }
  }
}
```

---

## 5. المستخدمون

### 5.1 تسجيل حساب جديد

```
POST /api/v1/auth/register
```

**يحتاج Authentication:** لا

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "123456",
  "firstName": "أحمد",
  "lastName": "الغامدي",
  "phone": "+966501234567",
  "gender": "male",
  "city": "الرياض",
  "country": "SA"
}
```

| الحقل | النوع | مطلوب | الوصف |
|-------|-------|--------|-------|
| `email` | string | نعم | البريد الإلكتروني |
| `password` | string | نعم | كلمة المرور (6 أحرف على الأقل) |
| `firstName` | string | نعم | الاسم الأول |
| `lastName` | string | لا | اسم العائلة |
| `phone` | string | لا | رقم الجوال |
| `gender` | string | لا | `male` أو `female` |
| `city` | string | لا | المدينة |
| `country` | string | لا | رمز الدولة (ISO 3166-1 alpha-2) |

**مثال الاستجابة الناجحة (201):**

```json
{
  "success": true,
  "message": "تم إنشاء الحساب بنجاح. يرجى تفعيل حسابك عبر البريد الإلكتروني",
  "userId": "user-uuid",
  "requiresActivation": true
}
```

**مثال استجابة الخطأ (409 - الحساب موجود):**

```json
{
  "success": false,
  "message": "البريد الإلكتروني مُسجَّل مسبقاً"
}
```

> **ملاحظة:** بعد التسجيل، يُرسَل رمز تفعيل مكون من 6 أرقام إلى البريد الإلكتروني. الحساب يكون بحالة `pending` حتى يُفعَّل.

---

### 5.2 تفعيل الحساب

```
POST /api/v1/auth/activate
```

**يحتاج Authentication:** لا

**Request Body:**

```json
{
  "userId": "user-uuid",
  "code": "123456"
}
```

| الحقل | النوع | مطلوب | الوصف |
|-------|-------|--------|-------|
| `userId` | string | نعم | معرف المستخدم |
| `code` | string | نعم | رمز التفعيل المُرسَل على البريد |

**مثال الاستجابة الناجحة (200):**

```json
{
  "success": true,
  "message": "تم تفعيل الحساب بنجاح"
}
```

---

### 5.3 إعادة إرسال رمز التفعيل

```
POST /api/v1/auth/resend-activation
```

**Request Body:**

```json
{
  "userId": "user-uuid"
}
```

أو:

```json
{
  "email": "user@example.com"
}
```

---

### 5.4 تسجيل الدخول

```
POST /api/v1/auth/login
```

**يحتاج Authentication:** لا

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "123456",
  "deviceInfo": {
    "platform": "ios",
    "model": "iPhone 16",
    "osVersion": "18.0",
    "appVersion": "1.0.0"
  }
}
```

| الحقل | النوع | مطلوب | الوصف |
|-------|-------|--------|-------|
| `email` | string | نعم* | البريد الإلكتروني (*أو الجوال) |
| `phone` | string | نعم* | رقم الجوال (*أو البريد) |
| `password` | string | نعم | كلمة المرور |
| `deviceInfo` | object | لا | معلومات الجهاز |

**مثال الاستجابة الناجحة (200):**

```json
{
  "success": true,
  "message": "تم تسجيل الدخول بنجاح",
  "token": "sabq_member_abc123xyz789...",
  "expiresAt": "2026-03-27T10:30:00.000Z",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "phone": "+966501234567",
    "firstName": "أحمد",
    "lastName": "الغامدي",
    "profileImageUrl": "https://cdn.sabq.org/avatars/user-uuid.jpg",
    "gender": "male",
    "city": "الرياض",
    "country": "SA",
    "locale": "ar",
    "emailVerified": true,
    "phoneVerified": false
  }
}
```

**استجابة الخطأ — حساب غير مفعَّل (403):**

```json
{
  "success": false,
  "message": "الحساب غير مفعل. يرجى تفعيل الحساب أولاً",
  "requiresActivation": true,
  "userId": "user-uuid"
}
```

**استجابة الخطأ — حساب محظور (403):**

```json
{
  "success": false,
  "message": "الحساب محظور",
  "reason": "سبب الحظر"
}
```

---

### 5.5 تسجيل الخروج

```
POST /api/v1/auth/logout
```

**يحتاج Authentication:** نعم

**مثال الاستجابة (200):**

```json
{
  "success": true,
  "message": "تم تسجيل الخروج بنجاح"
}
```

---

### 5.6 تسجيل الخروج من جميع الأجهزة

```
POST /api/v1/auth/logout-all
```

**يحتاج Authentication:** نعم

```json
{
  "success": true,
  "message": "تم تسجيل الخروج من جميع الأجهزة"
}
```

---

### 5.7 نسيان كلمة المرور

```
POST /api/v1/auth/forgot-password
```

**يحتاج Authentication:** لا

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

أو:

```json
{
  "phone": "+966501234567"
}
```

**مثال الاستجابة (200):**

```json
{
  "success": true,
  "message": "تم إرسال رمز استعادة كلمة المرور إلى بريدك الإلكتروني",
  "emailSent": true
}
```

> **ملاحظة أمنية:** الـ endpoint يُرجع `success: true` دائماً حتى لو لم يكن البريد مُسجَّلاً (لمنع User Enumeration).

> ⚠️ **تحذير بيئة التطوير فقط:** قد تحتوي الاستجابة على `resetCode` و `userId` — يجب حذفهما في الـ production.

---

### 5.8 إعادة تعيين كلمة المرور

```
POST /api/v1/auth/reset-password
```

**يحتاج Authentication:** لا

**Request Body:**

```json
{
  "userId": "user-uuid",
  "code": "123456",
  "newPassword": "newSecurePassword"
}
```

| الحقل | النوع | مطلوب | الوصف |
|-------|-------|--------|-------|
| `userId` | string | نعم* | معرف المستخدم |
| `email` | string | نعم* | *أو البريد الإلكتروني |
| `phone` | string | نعم* | *أو رقم الجوال |
| `code` | string | نعم | رمز الاستعادة (6 أرقام، صالح 30 دقيقة) |
| `newPassword` | string | نعم | كلمة المرور الجديدة (6 أحرف على الأقل) |

```json
{
  "success": true,
  "message": "تم تغيير كلمة المرور بنجاح. يرجى تسجيل الدخول"
}
```

---

### 5.9 عرض الملف الشخصي

```
GET /api/v1/members/profile
```

**يحتاج Authentication:** نعم

**مثال الاستجابة (200):**

```json
{
  "success": true,
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "phoneNumber": "+966501234567",
    "phone": "+966501234567",
    "firstName": "أحمد",
    "lastName": "الغامدي",
    "profileImageUrl": "https://cdn.sabq.org/avatars/user-uuid.jpg",
    "gender": "male",
    "birthDate": "1990-01-15T00:00:00.000Z",
    "city": "الرياض",
    "country": "SA",
    "locale": "ar",
    "emailVerified": true,
    "phoneVerified": false,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "interests": [
      {
        "id": "cat-uuid",
        "name": "الاقتصاد",
        "slug": "economy",
        "color": "#FF5733"
      }
    ]
  }
}
```

---

### 5.10 تحديث الملف الشخصي

```
PUT /api/v1/members/profile
```

**يحتاج Authentication:** نعم

**Request Body:**

```json
{
  "firstName": "أحمد",
  "lastName": "الغامدي",
  "gender": "male",
  "birthDate": "1990-01-15",
  "city": "جدة",
  "country": "SA",
  "locale": "ar"
}
```

| الحقل | النوع | مطلوب | الوصف |
|-------|-------|--------|-------|
| `firstName` | string | لا | الاسم الأول |
| `lastName` | string | لا | اسم العائلة |
| `profileImageUrl` | string | لا | URL الصورة الشخصية |
| `gender` | string | لا | `male` أو `female` |
| `birthDate` | string (ISO 8601) | لا | تاريخ الميلاد |
| `city` | string | لا | المدينة |
| `country` | string | لا | رمز الدولة |
| `locale` | string | لا | `ar` أو `en` |

```json
{
  "success": true,
  "message": "تم تحديث الملف الشخصي بنجاح"
}
```

---

### 5.11 رفع الصورة الشخصية

```
POST /api/v1/members/profile/image
```

**يحتاج Authentication:** نعم

**Request Body:**

```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD..."
}
```

| الحقل | النوع | مطلوب | الوصف |
|-------|-------|--------|-------|
| `image` | string (base64) | نعم | الصورة بصيغة data URL |

- **الحجم الأقصى:** 5 ميجابايت
- **الأنواع المدعومة:** JPEG, PNG, WebP, GIF

```json
{
  "success": true,
  "message": "تم رفع الصورة الشخصية بنجاح",
  "imageUrl": "/public-objects/profile-images/user-uuid-1234567890.jpeg"
}
```

---

### 5.12 حذف الصورة الشخصية

```
DELETE /api/v1/members/profile/image
```

**يحتاج Authentication:** نعم

```json
{
  "success": true,
  "message": "تم حذف الصورة الشخصية بنجاح"
}
```

---

### 5.13 تغيير كلمة المرور

```
POST /api/v1/members/change-password
```

**يحتاج Authentication:** نعم

**Request Body:**

```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "newPassword456"
}
```

```json
{
  "success": true,
  "message": "تم تغيير كلمة المرور بنجاح"
}
```

---

### 5.14 حذف الحساب

```
DELETE /api/v1/members/account
```

**يحتاج Authentication:** نعم

```json
{
  "success": true,
  "message": "تم حذف الحساب بنجاح"
}
```

---

### 5.15 تسجيل FCM Token للمستخدم

```
POST /api/v1/members/fcm-token
```

**يحتاج Authentication:** نعم

**Request Body:**

```json
{
  "fcmToken": "fcm-token-here"
}
```

---

## 6. الاهتمامات

### 6.1 جلب قائمة الاهتمامات المتاحة

```
GET /api/v1/interests
```

**يحتاج Authentication:** لا

**مثال الاستجابة (200):**

```json
{
  "success": true,
  "interests": [
    {
      "id": "cat-uuid",
      "name": "السياسة",
      "slug": "politics",
      "color": "#FF5733",
      "articleCount": 1250
    }
  ]
}
```

---

### 6.2 جلب اهتمامات المستخدم

```
GET /api/v1/members/interests
```

**يحتاج Authentication:** نعم

```json
{
  "success": true,
  "interests": [
    {
      "id": "cat-uuid",
      "name": "الاقتصاد",
      "slug": "economy",
      "color": "#4CAF50"
    }
  ]
}
```

---

### 6.3 تحديث الاهتمامات (استبدال الكل)

```
PUT /api/v1/members/interests
```

**يحتاج Authentication:** نعم

**Request Body:**

```json
{
  "categoryIds": ["cat-uuid-1", "cat-uuid-2", "cat-uuid-3"]
}
```

```json
{
  "success": true,
  "message": "تم تحديث اهتماماتك بنجاح"
}
```

---

### 6.4 إضافة اهتمام

```
POST /api/v1/members/interests/add
```

**يحتاج Authentication:** نعم

**Request Body:**

```json
{
  "categoryId": "cat-uuid"
}
```

---

### 6.5 حذف اهتمام

```
DELETE /api/v1/members/interests/:categoryId
```

**يحتاج Authentication:** نعم

---

## 7. الإشعارات

### 7.1 تسجيل جهاز للإشعارات

```
POST /api/v1/devices/register
```

**يحتاج Authentication:** لا (يمكن إرسال `userId` لربط الجهاز بالمستخدم)

> **مهم:** استخدم **APNs token** (native iOS) وليس Expo token. النظام يرفض Expo tokens تلقائياً.

**Request Body:**

```json
{
  "deviceToken": "apns-device-token-here",
  "token": "apns-device-token-here",
  "platform": "ios",
  "tokenProvider": "apns",
  "deviceName": "iPhone 16 Pro",
  "osVersion": "18.0",
  "appVersion": "1.0.0",
  "language": "ar",
  "timezone": "Asia/Riyadh",
  "userId": "user-uuid"
}
```

| الحقل | النوع | مطلوب | الوصف |
|-------|-------|--------|-------|
| `deviceToken` أو `token` | string | نعم | APNs Device Token |
| `platform` | string | لا | `ios` أو `android` — افتراضي: `ios` |
| `tokenProvider` | string | لا | `apns` للـ iOS، `fcm` للـ Android |
| `deviceName` | string | لا | اسم الجهاز |
| `osVersion` | string | لا | إصدار iOS |
| `appVersion` | string | لا | إصدار التطبيق |
| `language` أو `locale` | string | لا | اللغة — افتراضي: `ar` |
| `timezone` | string | لا | المنطقة الزمنية مثل `Asia/Riyadh` |
| `userId` | string | لا | معرف المستخدم المُسجَّل |

**مثال الاستجابة (200):**

```json
{
  "success": true,
  "message": "Device registered",
  "deviceId": "device-uuid"
}
```

**استجابة خطأ — Expo Token (400):**

```json
{
  "success": false,
  "message": "يجب استخدام FCM/APNs token وليس Expo token. الرجاء تحديث التطبيق."
}
```

---

### 7.2 إلغاء تسجيل الجهاز

```
DELETE /api/v1/devices/unregister
```

**Request Body:**

```json
{
  "deviceToken": "apns-device-token-here"
}
```

```json
{
  "success": true,
  "message": "Device unregistered"
}
```

---

### 7.3 التحقق من حالة تسجيل الجهاز

```
GET /api/v1/devices/status?deviceToken={token}
```

**Query Parameters:**

| الحقل | النوع | مطلوب | الوصف |
|-------|-------|--------|-------|
| `deviceToken` | string | نعم | APNs Device Token |

**مثال الاستجابة (200):**

```json
{
  "success": true,
  "registered": true,
  "device": {
    "id": "device-uuid",
    "platform": "ios",
    "isActive": true,
    "lastActiveAt": "2026-02-25T10:00:00.000Z"
  }
}
```

---

### 7.4 قائمة Topics للاشتراك

```
GET /api/v1/topics
```

> **ملاحظة:** الاشتراك/إلغاء الاشتراك في المواضيع يتم مباشرة عبر **Firebase SDK** في التطبيق، وليس عبر الـ API.

**مثال الاستجابة (200):**

```json
{
  "success": true,
  "topics": [
    { "id": "all_users", "name": "All Users", "nameAr": "جميع المستخدمين", "isDefault": true },
    { "id": "breaking_news", "name": "Breaking News", "nameAr": "الأخبار العاجلة", "isDefault": true },
    { "id": "sports", "name": "Sports", "nameAr": "الرياضة", "isDefault": false },
    { "id": "politics", "name": "Politics", "nameAr": "السياسة", "isDefault": false },
    { "id": "economy", "name": "Economy", "nameAr": "الاقتصاد", "isDefault": false },
    { "id": "technology", "name": "Technology", "nameAr": "التقنية", "isDefault": false }
  ],
  "note": "Subscribe/unsubscribe via Firebase SDK in the app"
}
```

**تسجيل الاشتراك عبر Firebase SDK (Swift):**

```swift
Messaging.messaging().subscribe(toTopic: "breaking_news") { error in
  print("Subscribed to breaking_news topic")
}
```

---

### 7.5 تتبع أحداث الإشعارات

```
POST /api/v1/notifications/event
```

يُستخدم لتسجيل تفاعل المستخدم مع الإشعار (فتح، نقر، تجاهل).

**Request Body:**

```json
{
  "campaignId": "campaign-uuid",
  "eventType": "opened",
  "deviceToken": "apns-device-token",
  "apnsId": "apns-id-from-notification",
  "metadata": {
    "articleId": "article-uuid"
  }
}
```

| الحقل | النوع | مطلوب | الوصف |
|-------|-------|--------|-------|
| `campaignId` | string | نعم | معرف حملة الإشعار |
| `eventType` | string | نعم | `delivered`, `opened`, `clicked`, `dismissed` |
| `deviceToken` | string | لا | رمز الجهاز |
| `apnsId` | string | لا | معرف APNs للإشعار |
| `metadata` | object | لا | بيانات إضافية |

```json
{
  "success": true
}
```

---

### 7.6 هيكل Payload الإشعار (APNs)

عند استلام الإشعار، ستكون البيانات بالشكل التالي:

```json
{
  "aps": {
    "alert": {
      "title": "عنوان الخبر العاجل",
      "body": "ملخص الخبر هنا"
    },
    "badge": 1,
    "sound": "default"
  },
  "articleId": "article-uuid",
  "articleUrl": "https://sabq.org/article/slug",
  "campaignId": "campaign-uuid",
  "category": "breaking_news"
}
```

---

## 8. التعليقات

### 8.1 جلب تعليقات مقال

```
GET /api/articles/:slug/comments
```

**يحتاج Authentication:** لا

**Query Parameters:**

| الحقل | النوع | الوصف |
|-------|-------|-------|
| `page` | integer | رقم الصفحة |
| `limit` | integer | عدد التعليقات |

**مثال الاستجابة (200):**

```json
{
  "comments": [
    {
      "id": "comment-uuid",
      "content": "تعليق المستخدم هنا",
      "createdAt": "2026-02-25T10:00:00.000Z",
      "author": {
        "id": "user-uuid",
        "name": "أحمد الغامدي",
        "profileImageUrl": "https://cdn.sabq.org/avatars/user-uuid.jpg"
      },
      "likesCount": 5,
      "replies": []
    }
  ],
  "total": 42,
  "page": 1
}
```

---

### 8.2 إضافة تعليق

```
POST /api/articles/:slug/comments
```

**يحتاج Authentication:** نعم

**Request Body:**

```json
{
  "content": "تعليقي على هذا الخبر",
  "parentId": null
}
```

| الحقل | النوع | مطلوب | الوصف |
|-------|-------|--------|-------|
| `content` | string | نعم | نص التعليق |
| `parentId` | string | لا | معرف التعليق الأب (للردود) |

**مثال الاستجابة (201):**

```json
{
  "success": true,
  "comment": {
    "id": "comment-uuid",
    "content": "تعليقي على هذا الخبر",
    "createdAt": "2026-02-25T10:00:00.000Z"
  }
}
```

---

## 9. التفاعلات والمفضلة

### 9.1 تفاعل مع مقال (إعجاب)

```
POST /api/articles/:id/react
```

**يحتاج Authentication:** نعم

**Request Body:**

```json
{
  "type": "like"
}
```

| القيمة | الوصف |
|--------|-------|
| `like` | إعجاب |
| `love` | حب |
| `sad` | حزن |
| `angry` | غضب |

---

### 9.2 إضافة/إزالة من المفضلة

```
POST /api/articles/:id/bookmark
```

**يحتاج Authentication:** نعم

يُضيف إذا لم يكن موجوداً، ويُزيل إذا كان موجوداً (Toggle).

```json
{
  "success": true,
  "bookmarked": true
}
```

---

### 9.3 جلب المقالات المحفوظة

```
GET /api/en/user/bookmarks
```

**يحتاج Authentication:** نعم

**ملاحظة:** استخدم `/api/en/user/bookmarks` للـ Web session، أو جلبها ضمن بيانات الملف الشخصي.

---

## 10. البحث

### 10.1 البحث العام

```
GET /api/v1/search?q={query}
```

### 10.2 البحث الموسَّع (Web)

```
GET /api/search?q={query}&type={type}&categoryId={id}&from={date}&to={date}
```

| الحقل | النوع | الوصف |
|-------|-------|-------|
| `q` | string | نص البحث |
| `type` | string | `articles`, `comments` |
| `categoryId` | string | تصفية حسب القسم |
| `from` | string (ISO 8601) | من تاريخ |
| `to` | string (ISO 8601) | حتى تاريخ |
| `page` | integer | رقم الصفحة |
| `limit` | integer | عدد النتائج |

---

## 11. قائمة التنقل

```
GET /api/v1/menu-groups
```

مُوضَّح في [القسم 4.2](#42-قائمة-التنقل-menu-groups--للتطبيق).

---

## 12. تسجيل المشاهدات

### 12.1 تسجيل مشاهدة مقال واحد

```
POST /api/v1/articles/:id/view
```

**يحتاج Authentication:** لا

**Path Parameters:**

| الحقل | النوع | الوصف |
|-------|-------|-------|
| `id` | string (UUID) | معرف المقال |

**Request Body:**

```json
{
  "deviceId": "unique-device-identifier",
  "platform": "ios",
  "appVersion": "1.0.0"
}
```

```json
{
  "success": true,
  "message": "تم تسجيل المشاهدة"
}
```

---

### 12.2 تسجيل مشاهدات متعددة (للـ Offline Sync)

```
POST /api/v1/articles/batch-view
```

**يحتاج Authentication:** لا

**Request Body:**

```json
{
  "views": [
    { "articleId": "article-uuid-1" },
    { "articleId": "article-uuid-2" },
    { "article_id": "article-uuid-3" }
  ],
  "deviceId": "unique-device-identifier",
  "platform": "ios",
  "appVersion": "1.0.0"
}
```

> **الحد الأقصى:** 50 مشاهدة في طلب واحد

```json
{
  "success": true,
  "processed": 3,
  "failed": 0,
  "message": "تم تسجيل 3 مشاهدة"
}
```

---

## 13. الأخبار العاجلة

### 13.1 قائمة الأخبار العاجلة

```
GET /api/v1/breaking
```

**يحتاج Authentication:** لا

**Query Parameters:**

| الحقل | النوع | الوصف |
|-------|-------|-------|
| `limit` | integer | عدد الأخبار (الحد الأقصى 50، الافتراضي 10) |

**مثال الاستجابة (200):**

```json
{
  "total": 3,
  "breaking_news": [
    {
      "id": "article-uuid",
      "url": "https://sabq.org/article/breaking-news-slug",
      "title": "خبر عاجل: حدث مهم في الرياض",
      "summary": "ملخص الخبر العاجل",
      "section": "السياسة",
      "author": "محمد العمري",
      "published_at": "2026-02-25T14:30:00.000Z",
      "image": "https://cdn.sabq.org/articles/uuid/main.jpg",
      "priority": "urgent"
    }
  ]
}
```

---

### 13.2 شريط الأخبار العاجلة (Breaking Ticker)

```
GET /api/breaking-ticker/active
```

**مثال الاستجابة (200):**

```json
{
  "topics": [
    {
      "id": "topic-uuid",
      "title": "موضوع الخبر العاجل",
      "headlines": [
        {
          "id": "headline-uuid",
          "text": "نص العنوان العاجل",
          "articleId": "article-uuid"
        }
      ]
    }
  ]
}
```

---

## 14. الصوت

### 14.1 قائمة النشرات الصوتية

```
GET /api/audio-newsletters/public
```

**يحتاج Authentication:** لا

**مثال الاستجابة (200):**

```json
{
  "newsletters": [
    {
      "id": "newsletter-uuid",
      "title": "النشرة الصوتية الصباحية",
      "audioUrl": "https://cdn.sabq.org/audio/newsletter-uuid.mp3",
      "duration": 180,
      "publishedAt": "2026-02-25T07:00:00.000Z",
      "summary": "ملخص النشرة"
    }
  ]
}
```

---

### 14.2 نشرة صوتية واحدة

```
GET /api/audio-newsletters/public/:id
```

---

### 14.3 الصوت الملخص للمقال

```
GET /api/articles/:slug/summary-audio
```

يُرجع رابط الصوت الملخَّص للمقال إن كان متاحاً.

---

## 15. نماذج البيانات

### 15.1 Article (المقال)

```json
{
  "id": "string (UUID)",
  "title": "string — عنوان المقال",
  "subtitle": "string | null — العنوان الفرعي",
  "slug": "string — المعرف النصي للـ URL",
  "excerpt": "string — مقتطف قصير",
  "content": "string (HTML) — المحتوى الكامل",
  "aiSummary": "string | null — ملخص بالذكاء الاصطناعي",
  "imageUrl": "string — URL الصورة الرئيسية",
  "albumImages": "string[] — مصفوفة URLs صور الألبوم",
  "categoryId": "string (UUID) — معرف القسم",
  "authorId": "string (UUID) — معرف الكاتب",
  "status": "published | draft | archived",
  "newsType": "breaking | featured | regular",
  "articleType": "news | opinion | analysis | interview | report",
  "isFeatured": "boolean",
  "isBreaking": "boolean",
  "views": "integer",
  "credibilityScore": "integer (0-100)",
  "publishedAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)",
  "createdAt": "string (ISO 8601)",
  "seo": {
    "title": "string",
    "description": "string",
    "keywords": "string"
  }
}
```

---

### 15.2 Category (القسم)

```json
{
  "id": "string (UUID)",
  "nameAr": "string — الاسم بالعربية",
  "nameEn": "string — الاسم بالإنجليزية",
  "slug": "string — معرف URL",
  "description": "string | null",
  "color": "string (hex color) — لون القسم",
  "displayOrder": "integer — ترتيب العرض",
  "status": "visible | hidden",
  "parentId": "string | null — للأقسام الفرعية"
}
```

---

### 15.3 User (المستخدم)

```json
{
  "id": "string (UUID)",
  "email": "string",
  "phoneNumber": "string | null",
  "firstName": "string | null",
  "lastName": "string | null",
  "profileImageUrl": "string | null",
  "gender": "male | female | null",
  "birthDate": "string (ISO 8601) | null",
  "city": "string | null",
  "country": "string | null — ISO 3166-1 alpha-2",
  "locale": "ar | en | null",
  "status": "active | pending | banned | suspended | deleted",
  "emailVerified": "boolean",
  "phoneVerified": "boolean",
  "createdAt": "string (ISO 8601)"
}
```

---

### 15.4 Comment (التعليق)

```json
{
  "id": "string (UUID)",
  "content": "string",
  "articleId": "string (UUID)",
  "authorId": "string (UUID)",
  "parentId": "string | null — للردود",
  "status": "pending | approved | rejected | spam",
  "likesCount": "integer",
  "createdAt": "string (ISO 8601)",
  "author": {
    "id": "string",
    "name": "string",
    "profileImageUrl": "string | null"
  }
}
```

---

### 15.5 PushDevice (جهاز الإشعارات)

```json
{
  "id": "string (UUID)",
  "deviceToken": "string — APNs Token",
  "tokenProvider": "apns | fcm",
  "platform": "ios | android | web",
  "userId": "string | null",
  "deviceName": "string | null",
  "osVersion": "string | null",
  "appVersion": "string | null",
  "locale": "string — ar",
  "timezone": "string | null",
  "isActive": "boolean",
  "lastActiveAt": "string (ISO 8601)"
}
```

---

### 15.6 AudioNewsletter (النشرة الصوتية)

```json
{
  "id": "string (UUID)",
  "title": "string",
  "audioUrl": "string — رابط ملف الصوت",
  "duration": "integer — المدة بالثواني",
  "summary": "string | null",
  "publishedAt": "string (ISO 8601)",
  "listensCount": "integer"
}
```

---

## 16. أكواد الخطأ

### HTTP Status Codes

| الكود | المعنى | الحالة |
|-------|--------|--------|
| `200` | OK | الطلب ناجح |
| `201` | Created | تم إنشاء المورد |
| `400` | Bad Request | بيانات مفقودة أو خاطئة |
| `401` | Unauthorized | التوكن مفقود أو منتهي الصلاحية |
| `403` | Forbidden | الحساب محظور أو غير مُفعَّل |
| `404` | Not Found | المورد غير موجود |
| `409` | Conflict | البريد/الجوال مُسجَّل مسبقاً |
| `500` | Internal Server Error | خطأ في الخادم |

### هيكل رسائل الخطأ

```json
{
  "success": false,
  "message": "رسالة الخطأ بالعربية",
  "error": "Error details in English (optional)"
}
```

### حالات الحساب الخاصة

| الحالة | الكود | الرسالة |
|--------|-------|---------|
| حساب غير مُفعَّل | 403 | `requiresActivation: true` |
| حساب محظور | 403 | `message: "الحساب محظور"` |
| حساب موقوف | 403 | `suspendedUntil: "ISO date"` |
| حساب محذوف | 403 | `message: "هذا الحساب محذوف"` |

---

## 17. الروابط العميقة

### هيكل Deep Links

```
sabq://article/{slug}          — مقال بالعربية
sabq://category/{slug}         — قسم
sabq://search?q={query}        — بحث
sabq://profile                 — الملف الشخصي
sabq://settings                — الإعدادات
sabq://breaking                — الأخبار العاجلة
```

### Universal Links

يجب ربط النطاق `sabq.org` مع التطبيق عبر `apple-app-site-association`:

```
https://sabq.org/article/{slug}  →  sabq://article/{slug}
https://sabq.org/category/{slug} →  sabq://category/{slug}
```

---

## ملاحظات تقنية للمطورين

### 1. التعامل مع الصور

- جميع URLs الصور مكتملة (absolute URLs) وجاهزة للعرض المباشر
- لا يوجد image resizing API — الصور تأتي بحجمها الأصلي
- يُنصح بتطبيق Image Caching في التطبيق (مثل SDWebImage أو Kingfisher)
- الصور في `full_text` (HTML content) قد تحتاج parsing لاستخراجها — استخدم `contentImages[]` المُرجَعة مباشرة

### 2. المحتوى HTML

- حقل `full_text` / `content` يحتوي HTML
- يُنصح باستخدام WKWebView لعرضه مع تطبيق CSS مناسب للـ RTL
- أو استخدام HTML Parser لتحويله إلى NSAttributedString

### 3. Offline Support

- استخدم `POST /api/v1/articles/batch-view` لمزامنة المشاهدات عند استعادة الاتصال
- حد أقصى 50 مشاهدة في طلب واحد

### 4. Polling للأخبار العاجلة

- لا يوجد WebSocket — استخدم Polling كل 60 ثانية على `GET /api/v1/breaking`
- أو كل 2 دقيقة على `GET /api/breaking-ticker/active`

### 5. تحديث Session Token

- مدة التوكن 30 يوماً
- لا يوجد Refresh Token
- عند الحصول على `401`، أعِد توجيه المستخدم لشاشة تسجيل الدخول
- يُنصح بتخزين التوكن في **iOS Keychain**

### 6. تسجيل الجهاز للإشعارات

اتبع هذا الترتيب:
1. اطلب إذن الإشعارات من المستخدم
2. احصل على APNs Device Token
3. سجِّل الجهاز عبر `POST /api/v1/devices/register`
4. إذا كان المستخدم مُسجَّل الدخول، أرسل `userId` في نفس الطلب
5. اشترك في Firebase Topics المطلوبة عبر Firebase SDK

### 7. Bundle ID والـ APNs

```
Bundle ID: com.sabq.sabqorg
APNs Environment: Production
APNs Team ID: CBU7MJEC5R
APNs Key ID: 99U87TQZ65
```

---

## مثال تكامل متكامل (iOS Swift)

```swift
// 1. تسجيل الدخول
struct LoginRequest: Encodable {
    let email: String
    let password: String
    let deviceInfo: DeviceInfo?
}

func login(email: String, password: String) async throws -> LoginResponse {
    let url = URL(string: "https://sabq.org/api/v1/auth/login")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let body = LoginRequest(email: email, password: password, deviceInfo: nil)
    request.httpBody = try JSONEncoder().encode(body)
    
    let (data, _) = try await URLSession.shared.data(for: request)
    return try JSONDecoder().decode(LoginResponse.self, from: data)
}

// 2. طلب مع Authentication
func fetchProfile(token: String) async throws -> ProfileResponse {
    let url = URL(string: "https://sabq.org/api/v1/members/profile")!
    var request = URLRequest(url: url)
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    
    let (data, _) = try await URLSession.shared.data(for: request)
    return try JSONDecoder().decode(ProfileResponse.self, from: data)
}

// 3. تسجيل جهاز الإشعارات
func registerDevice(apnsToken: Data, userId: String?) async throws {
    let tokenString = apnsToken.map { String(format: "%02.2hhx", $0) }.joined()
    
    let url = URL(string: "https://sabq.org/api/v1/devices/register")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    var body: [String: Any] = [
        "deviceToken": tokenString,
        "platform": "ios",
        "tokenProvider": "apns",
        "language": Locale.current.languageCode ?? "ar",
        "timezone": TimeZone.current.identifier,
        "appVersion": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    ]
    
    if let userId = userId {
        body["userId"] = userId
    }
    
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    let (_, _) = try await URLSession.shared.data(for: request)
}

// 4. جلب الأخبار مع Pagination
func fetchArticles(limit: Int = 20, offset: Int = 0) async throws -> ArticlesResponse {
    var components = URLComponents(string: "https://sabq.org/api/v1/articles")!
    components.queryItems = [
        URLQueryItem(name: "limit", value: "\(limit)"),
        URLQueryItem(name: "offset", value: "\(offset)")
    ]
    
    let request = URLRequest(url: components.url!)
    let (data, _) = try await URLSession.shared.data(for: request)
    return try JSONDecoder().decode(ArticlesResponse.self, from: data)
}
```

---

*هذا التوثيق مُعِدّ خصيصاً لفريق تطوير تطبيق iOS — سبق الذكية.*  
*للاستفسارات التقنية، تواصل مع فريق الـ Backend عبر القنوات الرسمية.*
