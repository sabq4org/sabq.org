# دليل واجهات برمجة التطبيقات للجوال
# Sabq Mobile App API Documentation

**الإصدار:** 1.0  
**Base URL:** `https://your-domain.com/api/v1`  
**التاريخ:** يناير 2026

---

## 📋 الفهرس

1. [المصادقة والعضوية](#المصادقة-والعضوية)
2. [الملف الشخصي](#الملف-الشخصي)
3. [الاهتمامات](#الاهتمامات)
4. [الإشعارات (FCM)](#الإشعارات-fcm)
5. [الأقسام والمحتوى](#الأقسام-والمحتوى)
6. [أكواد الاستجابة](#أكواد-الاستجابة)

---

## 🔐 المصادقة والعضوية

### 1. تسجيل حساب جديد
**POST** `/api/v1/auth/register`

```json
// Request Body
{
  "email": "user@example.com",        // مطلوب
  "password": "123456",               // مطلوب - 6 أحرف على الأقل
  "firstName": "أحمد",                // اختياري
  "lastName": "محمد",                 // اختياري
  "phone": "+966501234567",           // اختياري
  "gender": "male",                   // اختياري - male أو female
  "city": "الرياض",                   // اختياري
  "country": "SA",                    // اختياري - افتراضي SA
  "locale": "ar"                      // اختياري - ar أو en
}

// Response - Success (201)
{
  "success": true,
  "message": "تم إنشاء الحساب بنجاح. يرجى تفعيل الحساب",
  "userId": "uuid-here",
  "verificationCode": "123456"        // للاختبار فقط - يُرسل بالبريد في الإنتاج
}

// Response - Error (400/409)
{
  "success": false,
  "message": "البريد الإلكتروني مسجل مسبقاً"
}
```

---

### 2. تفعيل الحساب
**POST** `/api/v1/auth/activate`

```json
// Request Body
{
  "email": "user@example.com",        // أو userId
  "code": "123456"                    // رمز التفعيل المرسل
}

// Response - Success (200)
{
  "success": true,
  "message": "تم تفعيل الحساب بنجاح"
}

// Response - Error (400)
{
  "success": false,
  "message": "رمز التفعيل غير صحيح أو منتهي الصلاحية"
}
```

---

### 3. إعادة إرسال رمز التفعيل
**POST** `/api/v1/auth/resend-activation`

```json
// Request Body
{
  "email": "user@example.com"
}

// Response - Success (200)
{
  "success": true,
  "message": "تم إرسال رمز التفعيل",
  "verificationCode": "654321"        // للاختبار فقط
}
```

---

### 4. تسجيل الدخول
**POST** `/api/v1/auth/login`

```json
// Request Body
{
  "email": "user@example.com",        // أو phone
  "password": "123456",
  "deviceInfo": {                     // اختياري - معلومات الجهاز
    "platform": "ios",                // ios أو android
    "osVersion": "17.0",
    "appVersion": "1.0.0",
    "deviceName": "iPhone 15",
    "deviceId": "unique-device-id"
  }
}

// Response - Success (200)
{
  "success": true,
  "message": "تم تسجيل الدخول بنجاح",
  "token": "session-token-here",      // ⚠️ احفظه بشكل آمن
  "expiresAt": "2026-02-17T13:52:06.543Z",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "phone": "+966501234567",
    "firstName": "أحمد",
    "lastName": "محمد",
    "profileImageUrl": null,
    "gender": "male",
    "city": "الرياض",
    "country": "SA",
    "locale": "ar",
    "emailVerified": true,
    "phoneVerified": false
  }
}

// Response - Error (401)
{
  "success": false,
  "message": "البريد الإلكتروني أو كلمة المرور غير صحيحة"
}

// Response - Account Issues (403)
{
  "success": false,
  "message": "الحساب موقوف",          // أو "الحساب محظور" أو "الحساب غير مفعل"
  "reason": "سبب الإيقاف"             // إن وجد
}
```

---

### 5. تسجيل الخروج
**POST** `/api/v1/auth/logout`

```
Headers:
  Authorization: Bearer {token}
```

```json
// Response - Success (200)
{
  "success": true,
  "message": "تم تسجيل الخروج بنجاح"
}
```

---

### 6. تسجيل الخروج من جميع الأجهزة
**POST** `/api/v1/auth/logout-all`

```
Headers:
  Authorization: Bearer {token}
```

```json
// Response - Success (200)
{
  "success": true,
  "message": "تم تسجيل الخروج من جميع الأجهزة",
  "sessionsTerminated": 3
}
```

---

### 7. نسيت كلمة المرور
**POST** `/api/v1/auth/forgot-password`

```json
// Request Body
{
  "email": "user@example.com"
}

// Response - Success (200)
{
  "success": true,
  "message": "تم إرسال رابط استعادة كلمة المرور",
  "resetToken": "reset-token"         // للاختبار فقط
}
```

---

### 8. إعادة تعيين كلمة المرور
**POST** `/api/v1/auth/reset-password`

```json
// Request Body
{
  "token": "reset-token-from-email",
  "newPassword": "newPassword123"
}

// Response - Success (200)
{
  "success": true,
  "message": "تم تغيير كلمة المرور بنجاح"
}
```

---

## 👤 الملف الشخصي

### 1. الحصول على الملف الشخصي
**GET** `/api/v1/members/profile`

```
Headers:
  Authorization: Bearer {token}
```

```json
// Response - Success (200)
{
  "success": true,
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "phone": "+966501234567",
    "firstName": "أحمد",
    "lastName": "محمد",
    "profileImageUrl": "https://...",
    "gender": "male",
    "birthDate": "1990-01-15",
    "city": "الرياض",
    "country": "SA",
    "locale": "ar",
    "emailVerified": true,
    "phoneVerified": false,
    "createdAt": "2026-01-15T10:00:00Z"
  },
  "interests": [
    {
      "categoryId": "cat-uuid",
      "categoryName": "رياضة",
      "categorySlug": "sports"
    }
  ]
}
```

---

### 2. تحديث الملف الشخصي
**PUT** `/api/v1/members/profile`

```
Headers:
  Authorization: Bearer {token}
```

```json
// Request Body - أرسل الحقول المراد تحديثها فقط
{
  "firstName": "أحمد",
  "lastName": "محمد",
  "phone": "+966501234567",
  "gender": "male",
  "birthDate": "1990-01-15",
  "city": "الرياض",
  "country": "SA",
  "locale": "ar"
}

// Response - Success (200)
{
  "success": true,
  "message": "تم تحديث الملف الشخصي بنجاح"
}
```

---

### 2.1 رفع الصورة الشخصية
**POST** `/api/v1/members/profile/image`

```
Headers:
  Authorization: Bearer {token}
  Content-Type: application/json
```

```json
// Request Body - الصورة بصيغة base64
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ..."
}

// الصيغ المدعومة: jpeg, jpg, png, webp, gif
// الحد الأقصى للحجم: 5 ميجابايت

// Response - Success (200)
{
  "success": true,
  "message": "تم رفع الصورة الشخصية بنجاح",
  "imageUrl": "/public-objects/profile-images/user-uuid-1737200000000.jpeg"
}

// Response - Error (400)
{
  "success": false,
  "message": "صيغة الصورة غير صحيحة. يجب أن تكون data:image/[type];base64,..."
}

// Response - Error (400)
{
  "success": false,
  "message": "حجم الصورة يجب أن يكون أقل من 5 ميجابايت"
}
```

**Swift Example:**
```swift
func uploadProfileImage(_ image: UIImage) {
    guard let imageData = image.jpegData(compressionQuality: 0.8) else { return }
    let base64String = "data:image/jpeg;base64,\(imageData.base64EncodedString())"
    
    let body = ["image": base64String]
    // POST to /api/v1/members/profile/image
}
```

**Kotlin Example:**
```kotlin
fun uploadProfileImage(bitmap: Bitmap) {
    val outputStream = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.JPEG, 80, outputStream)
    val base64 = Base64.encodeToString(outputStream.toByteArray(), Base64.NO_WRAP)
    val imageString = "data:image/jpeg;base64,$base64"
    
    val body = mapOf("image" to imageString)
    // POST to /api/v1/members/profile/image
}
```

---

### 2.2 حذف الصورة الشخصية
**DELETE** `/api/v1/members/profile/image`

```
Headers:
  Authorization: Bearer {token}
```

```json
// Response - Success (200)
{
  "success": true,
  "message": "تم حذف الصورة الشخصية بنجاح"
}
```

---

### 3. تغيير كلمة المرور
**PUT** `/api/v1/members/change-password`

```
Headers:
  Authorization: Bearer {token}
```

```json
// Request Body
{
  "currentPassword": "oldPassword123",
  "newPassword": "newPassword456"
}

// Response - Success (200)
{
  "success": true,
  "message": "تم تغيير كلمة المرور بنجاح"
}
```

---

### 4. حذف الحساب
**DELETE** `/api/v1/members/account`

```
Headers:
  Authorization: Bearer {token}
```

```json
// Request Body
{
  "password": "currentPassword"       // للتأكيد
}

// Response - Success (200)
{
  "success": true,
  "message": "تم حذف الحساب بنجاح"
}
```

---

## ⭐ الاهتمامات

### 1. قائمة الاهتمامات المتاحة
**GET** `/api/v1/interests`

> لا يتطلب تسجيل دخول - يمكن عرضها عند التسجيل أو في الإعدادات

```json
// Response - Success (200)
{
  "success": true,
  "interests": [
    {
      "id": "cat-uuid-1",
      "name": "رياضة",
      "slug": "sports",
      "icon": "sports"
    },
    {
      "id": "cat-uuid-2",
      "name": "تقنية",
      "slug": "technology",
      "icon": "tech"
    },
    {
      "id": "cat-uuid-3",
      "name": "اقتصاد",
      "slug": "economy",
      "icon": "economy"
    },
    {
      "id": "cat-uuid-4",
      "name": "سياسة",
      "slug": "politics",
      "icon": "politics"
    }
  ]
}
```

---

### 2. الحصول على اهتمامات المستخدم
**GET** `/api/v1/members/interests`

```
Headers:
  Authorization: Bearer {token}
```

```json
// Response - Success (200)
{
  "success": true,
  "interests": [
    {
      "categoryId": "cat-uuid-1",
      "categoryName": "رياضة",
      "categorySlug": "sports"
    },
    {
      "categoryId": "cat-uuid-2",
      "categoryName": "تقنية",
      "categorySlug": "technology"
    }
  ]
}
```

---

### 3. تحديث الاهتمامات
**PUT** `/api/v1/members/interests` (أو **POST**)

```
Headers:
  Authorization: Bearer {token}
  Content-Type: application/json
```

```json
// Request Body - يمكن استخدام categoryIds أو interestIds
{
  "categoryIds": [
    "cat-uuid-1",
    "cat-uuid-2",
    "cat-uuid-3"
  ]
}

// أو
{
  "interestIds": [
    "cat-uuid-1",
    "cat-uuid-2",
    "cat-uuid-3"
  ]
}

// Response - Success (200)
{
  "success": true,
  "message": "تم تحديث الاهتمامات بنجاح",
  "count": 3
}

// Response - Error (401)
{
  "success": false,
  "message": "غير مصرح - تسجيل الدخول مطلوب"
}
```

---

## 🔔 الإشعارات (FCM)

### 1. تسجيل رمز FCM
**POST** `/api/v1/members/fcm-token`

```
Headers:
  Authorization: Bearer {token}
```

```json
// Request Body
{
  "fcmToken": "firebase-token-here",
  "topics": ["breaking_news", "sports"] // اختياري - المواضيع للاشتراك
}

// Response - Success (200)
{
  "success": true,
  "message": "تم تسجيل رمز الإشعارات بنجاح"
}
```

---

### 2. تسجيل جهاز للإشعارات (بدون تسجيل دخول)
**POST** `/api/v1/devices/register`

```json
// Request Body
{
  "deviceToken": "firebase-fcm-token",
  "platform": "ios",                  // ios أو android
  "appVersion": "1.0.0",
  "osVersion": "17.0",
  "language": "ar"
}

// Response - Success (200)
{
  "success": true,
  "deviceId": "device-uuid"
}
```

---

## 📰 الأقسام والمحتوى

### 1. قائمة الأقسام
**GET** `/api/v1/menu-groups`

```json
// Response - Success (200)
{
  "menu-groups": [
    {
      "id": 1,
      "title": "عاجل",
      "slug": "breaking",
      "collection-slug": "breaking"
    },
    {
      "id": 2,
      "title": "رياضة",
      "slug": "sports",
      "collection-slug": "sports"
    }
  ]
}
```

---

### 2. أخبار قسم معين
**GET** `/api/v1/collections/{slug}`

```json
// Response - Success (200)
{
  "collection": {
    "name": "رياضة",
    "slug": "sports"
  },
  "items": [
    {
      "id": "article-uuid",
      "headline": "عنوان الخبر",
      "subheadline": "العنوان الفرعي",
      "hero-image-s3-key": "https://...",
      "published-at": 1705320000,
      "author-name": "أحمد محمد"
    }
  ],
  "total-count": 50,
  "page": 1
}
```

---

### 3. تفاصيل مقال
**GET** `/api/v1/stories/{id}`

```json
// Response - Success (200)
{
  "story": {
    "id": "article-uuid",
    "headline": "عنوان الخبر الكامل",
    "subheadline": "العنوان الفرعي",
    "hero-image-s3-key": "https://...",
    "cards": [
      {
        "card-type": "text",
        "text": "<p>محتوى المقال...</p>"
      }
    ],
    "author-name": "أحمد محمد",
    "published-at": 1705320000,
    "sections": [
      {
        "name": "رياضة",
        "slug": "sports"
      }
    ]
  }
}
```

---

## 📊 أكواد الاستجابة

| الكود | الوصف |
|-------|-------|
| 200 | نجاح العملية |
| 201 | تم الإنشاء بنجاح |
| 400 | خطأ في البيانات المرسلة |
| 401 | غير مصرح - تسجيل الدخول مطلوب |
| 403 | محظور - الحساب موقوف أو محظور |
| 404 | غير موجود |
| 409 | تعارض - البيانات موجودة مسبقاً |
| 500 | خطأ في الخادم |

---

## 🔑 ملاحظات مهمة للمطور

### المصادقة
1. **Token Storage:** احفظ الـ `token` في Keychain (iOS) أو EncryptedSharedPreferences (Android)
2. **Token Expiry:** الجلسة صالحة لمدة 30 يوماً
3. **Auto-Refresh:** عند انتهاء الجلسة (401)، أعد توجيه المستخدم لتسجيل الدخول

### Headers المطلوبة
```
Content-Type: application/json
Authorization: Bearer {token}          // للـ APIs المحمية
```

### FCM Topics
- `breaking_news` - الأخبار العاجلة
- `daily_digest` - الملخص اليومي
- `{category-slug}` - أخبار قسم معين (مثل sports, technology)

### حالات الحساب
- `active` - نشط ويمكنه استخدام التطبيق
- `pending` - بانتظار التفعيل (بعد التسجيل مباشرة)
- `suspended` - موقوف مؤقتاً
- `banned` - محظور نهائياً
- `deleted` - محذوف

### Device Info (معلومات الجهاز)
يُفضل إرسال معلومات الجهاز عند تسجيل الدخول:
```json
{
  "platform": "ios",           // ios أو android
  "osVersion": "17.0",
  "appVersion": "1.0.0",
  "deviceName": "iPhone 15 Pro",
  "deviceId": "unique-identifier"
}
```

---

## 📱 مثال على التكامل (Swift)

```swift
// تسجيل الدخول
func login(email: String, password: String) async throws -> LoginResponse {
    let url = URL(string: "\(baseURL)/api/v1/auth/login")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let body: [String: Any] = [
        "email": email,
        "password": password,
        "deviceInfo": [
            "platform": "ios",
            "osVersion": UIDevice.current.systemVersion,
            "appVersion": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "",
            "deviceName": UIDevice.current.name
        ]
    ]
    
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    
    let (data, _) = try await URLSession.shared.data(for: request)
    return try JSONDecoder().decode(LoginResponse.self, from: data)
}
```

---

## 📱 مثال على التكامل (Kotlin)

```kotlin
// تسجيل الدخول
suspend fun login(email: String, password: String): LoginResponse {
    val client = HttpClient()
    return client.post("$baseURL/api/v1/auth/login") {
        contentType(ContentType.Application.Json)
        setBody(LoginRequest(
            email = email,
            password = password,
            deviceInfo = DeviceInfo(
                platform = "android",
                osVersion = Build.VERSION.RELEASE,
                appVersion = BuildConfig.VERSION_NAME,
                deviceName = Build.MODEL
            )
        ))
    }.body()
}
```

---

## 🆘 الدعم الفني

للاستفسارات التقنية:
- API Issues: راجع response body للحصول على رسالة الخطأ
- Status Code 500: أبلغ الفريق التقني مع تفاصيل الطلب

---

**آخر تحديث:** يناير 2026
