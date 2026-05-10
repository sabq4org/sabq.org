# دليل تكامل تطبيقات الموبايل مع منصة سبق

## معلومات الخادم

```
Base URL: https://sabq.org/api
```

---

## 1. تتبع مشاهدات المقالات

### Endpoint

```
POST /api/articles/{articleId}/view
```

### Headers

```json
{
  "Content-Type": "application/json",
  "User-Agent": "SabqApp/1.0 (iOS|Android)"
}
```

### Request Body (اختياري)

```json
{
  "platform": "ios" | "android",
  "userId": "uuid (اختياري - إذا كان المستخدم مسجل)"
}
```

### Response

```json
{
  "success": true,
  "deduplicated": false
}
```

### ملاحظات هامة

- **Rate Limiting**: 30 مشاهدة كحد أقصى في الدقيقة من نفس IP
- **Deduplication**: نفس المستخدم + نفس المقال = مشاهدة واحدة خلال 5 دقائق
- **Anti-Bot**: حد 100 مشاهدة في الساعة لنفس المقال

---

## 2. تكامل Google Analytics 4

### للتكامل مع نفس Property الموجود في الويب:

1. **Measurement ID**:
   ```
   G-EEB5593GY7
   ```
   
2. **API Secret** (مطلوب للـ Measurement Protocol):
   - اذهب إلى: Google Analytics → Admin → Data Streams → Web
   - اختر: Measurement Protocol API secrets → Create

3. **إعداد في التطبيق (React Native/Expo)**:

```bash
# تثبيت المكتبة
expo install expo-firebase-analytics
# أو
npm install @react-native-firebase/analytics
```

3. **التهيئة**:

```typescript
// analytics.ts
import analytics from '@react-native-firebase/analytics';

// أو باستخدام Measurement Protocol مباشرة
const GA_MEASUREMENT_ID = 'G-EEB5593GY7';
const GA_API_SECRET = 'bQ0kFYHbRYelCTjeT3iVmg';

export async function trackEvent(name: string, params: Record<string, any>) {
  // الطريقة 1: Firebase Analytics (موصى بها)
  await analytics().logEvent(name, params);
  
  // الطريقة 2: Measurement Protocol (للتحكم الكامل)
  await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`, {
    method: 'POST',
    body: JSON.stringify({
      client_id: 'mobile_' + deviceId,
      events: [{
        name,
        params: {
          ...params,
          platform: Platform.OS,
          engagement_time_msec: 100
        }
      }]
    })
  });
}
```

---

## 3. الأحداث المطلوب تتبعها

| الحدث | الاسم | المعاملات |
|-------|-------|-----------|
| فتح خبر | `article_view` | `article_id`, `category`, `author` |
| تصفح قسم | `category_view` | `category_id`, `category_name` |
| البحث | `search` | `search_term`, `results_count` |
| مشاركة خبر | `share` | `article_id`, `method` (whatsapp/twitter/copy) |
| فتح إشعار | `notification_open` | `campaign_id`, `article_id` |
| تسجيل دخول | `login` | `method` (email/apple/google) |
| تسجيل جديد | `sign_up` | `method` |

### مثال التتبع:

```typescript
// عند فتح مقال
trackEvent('article_view', {
  article_id: article.id,
  article_title: article.title,
  category: article.categorySlug,
  platform: 'ios'
});

// عند المشاركة
trackEvent('share', {
  article_id: article.id,
  content_type: 'article',
  method: 'whatsapp'
});
```

---

## 4. APIs للتطبيقات الموبايل

### 4.1 قائمة الأقسام

```
GET /api/v1/menu
```

Response:
```json
{
  "categories": [
    {
      "id": "uuid",
      "name": "محلي",
      "slug": "local",
      "icon": "url",
      "order": 1
    }
  ]
}
```

### 4.2 قائمة المقالات

```
GET /api/v1/articles?page=1&limit=20&category=local
```

### 4.3 مقال واحد

```
GET /api/v1/articles/{id}
```

### 4.4 البحث

```
GET /api/v1/search?q=query&page=1&limit=20
```

### 4.5 الأخبار العاجلة

```
GET /api/v1/breaking
```

---

## 5. نظام العضوية (للتطبيقات)

### 5.1 تسجيل جديد

```
POST /api/v1/auth/register
```

Body:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "firstName": "أحمد",
  "lastName": "محمد",
  "locale": "ar",
  "city": "الرياض",
  "country": "SA",
  "gender": "male",
  "birthDate": "1990-01-15"
}
```

### 5.2 تفعيل الحساب

```
POST /api/v1/auth/activate
```

Body:
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

### 5.3 تسجيل الدخول

```
POST /api/v1/auth/login
```

Body:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "deviceInfo": {
    "platform": "ios",
    "model": "iPhone 15",
    "osVersion": "17.0"
  }
}
```

Response:
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "أحمد",
    "lastName": "محمد",
    "avatar": "url"
  },
  "sessionToken": "xxxxxxxx"
}
```

### 5.4 الملف الشخصي

```
GET /api/v1/members/profile
Authorization: Bearer {sessionToken}
```

### 5.5 تحديث الملف الشخصي

```
PUT /api/v1/members/profile
Authorization: Bearer {sessionToken}
```

### 5.6 اهتمامات المستخدم

```
GET /api/v1/members/interests
PUT /api/v1/members/interests
POST /api/v1/members/interests/add
DELETE /api/v1/members/interests/{categoryId}
```

---

## 6. Push Notifications (FCM Token)

### تسجيل Token

```
POST /api/v1/members/fcm-token
Authorization: Bearer {sessionToken}
```

Body:
```json
{
  "token": "fcm_device_token_here",
  "platform": "ios" | "android"
}
```

### بدون تسجيل دخول (للزوار)

```
POST /api/admin/push/register-device
```

Body:
```json
{
  "deviceToken": "token",
  "platform": "ios" | "android",
  "locale": "ar"
}
```

---

## 7. إعدادات Google Analytics

| المعلومة | القيمة |
|----------|--------|
| **Measurement ID** | `G-EEB5593GY7` |
| **API Secret** | `bQ0kFYHbRYelCTjeT3iVmg` |

✅ جاهز للاستخدام في التطبيق!

---

## 8. Real-time Users (المتواجدون حالياً)

لإظهار مستخدمي التطبيق مع مستخدمي الويب في Google Analytics Realtime:

1. استخدام **نفس Measurement ID** للويب والتطبيقات
2. إرسال `engagement_time_msec` مع كل حدث
3. إرسال `session_id` فريد لكل جلسة

```typescript
// إرسال heartbeat كل 30 ثانية لإظهار المستخدم كـ "متواجد"
setInterval(() => {
  trackEvent('user_engagement', {
    engagement_time_msec: 30000,
    session_id: sessionId
  });
}, 30000);
```

---

## 9. ملخص الـ Endpoints

| الوظيفة | Method | Endpoint |
|---------|--------|----------|
| مشاهدة مقال | POST | `/api/articles/{id}/view` |
| قائمة المقالات | GET | `/api/v1/articles` |
| مقال واحد | GET | `/api/v1/articles/{id}` |
| الأقسام | GET | `/api/v1/menu` أو `/api/v1/categories` |
| البحث | GET | `/api/v1/search` |
| الأخبار العاجلة | GET | `/api/v1/breaking` |
| تسجيل جديد | POST | `/api/v1/auth/register` |
| تفعيل | POST | `/api/v1/auth/activate` |
| دخول | POST | `/api/v1/auth/login` |
| خروج | POST | `/api/v1/auth/logout` |
| الملف الشخصي | GET/PUT | `/api/v1/members/profile` |
| الاهتمامات | GET/PUT | `/api/v1/members/interests` |
| FCM Token | POST | `/api/v1/members/fcm-token` |
| تسجيل جهاز (زائر) | POST | `/api/admin/push/register-device` |

---

## 10. تواصل

للحصول على Measurement ID و API Secret:
- تواصل مع مسؤول Google Analytics في الفريق
- أو اطلب الوصول إلى Google Analytics Property

---

*آخر تحديث: يناير 2026*
