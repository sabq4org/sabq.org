# تقرير التقييم الأمني الشامل - منصة سبق الإخبارية
**تاريخ التقييم:** 15 ديسمبر 2025

---

## ملخص تنفيذي

تم إجراء تقييم أمني شامل لمنصة سبق الإخبارية الذكية. يغطي هذا التقرير تحليل البنية التحتية الأمنية، اختبار الثغرات البرمجية، مراجعة سياسات الأمان، وتحليل إدارة الهوية والصلاحيات.

### التقييم العام: ⚠️ يتطلب تحسينات

---

## 1. الثغرات الحرجة (Critical)

### 1.1 ثغرة حقن SQL (SQL Injection)
**الخطورة:** 🔴 حرجة  
**الملف:** `server/services/adsAnalytics.ts`  
**الأسطر:** 206, 214-218, 227, 235-239

**الوصف:**
يستخدم الكود `sql.raw(dateTrunc)` حيث يتم تمرير قيمة `dateTrunc` من مدخلات المستخدم (معامل `period`) دون تحقق كافٍ.

```typescript
// الكود المُعرَّض للخطر
dateBucket: sql<string>`date_trunc('${sql.raw(dateTrunc)}', ${impressions.timestamp})::date::text`,
```

**التأثير:**
- يمكن للمهاجم تنفيذ أوامر SQL عشوائية
- الوصول غير المصرح به إلى قاعدة البيانات
- تعديل أو حذف البيانات

**الحل المُقترح:**
```typescript
// استخدام قائمة بيضاء للقيم المسموحة
const ALLOWED_PERIODS = ['day', 'week', 'month'] as const;
type ValidPeriod = typeof ALLOWED_PERIODS[number];

function getDateTrunc(period: string): ValidPeriod {
  if (!ALLOWED_PERIODS.includes(period as ValidPeriod)) {
    return 'day'; // القيمة الافتراضية الآمنة
  }
  return period as ValidPeriod;
}
```

---

### 1.2 غياب حماية CSRF
**الخطورة:** 🔴 حرجة  
**النطاق:** جميع مسارات POST/PUT/DELETE

**الوصف:**
لا توجد آلية حماية من هجمات CSRF (Cross-Site Request Forgery) رغم استخدام المصادقة عبر الجلسات.

**التأثير:**
- يمكن للمهاجم تنفيذ إجراءات نيابة عن المستخدم المصادق
- تعديل بيانات المستخدم دون علمه
- نشر مقالات أو تعليقات باسم المستخدم

**الحل المُقترح:**
```typescript
// تثبيت حزمة csurf
import csrf from 'csurf';

const csrfProtection = csrf({ cookie: true });

// تطبيق على المسارات الحساسة
app.post('/api/articles', csrfProtection, (req, res) => {
  // ...
});

// إرسال الرمز للواجهة الأمامية
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});
```

---

## 2. الثغرات عالية الخطورة (High)

### 2.1 ثغرات XSS (Cross-Site Scripting)
**الخطورة:** 🟠 عالية  
**الملفات المتأثرة:**
- `client/src/examples/ArticleVoiceCommandsExample.tsx` (سطر 58)
- `client/src/components/AdSlot.tsx` (سطر 158)
- `client/src/components/lite/SwipeCard.tsx` (سطر 601)
- `client/src/pages/ai/AIArticleDetail.tsx` (سطر 419)
- `client/src/components/EmailDetailsModal.tsx` (سطر 123)

**الوصف:**
استخدام `dangerouslySetInnerHTML` بدون تعقيم المحتوى باستخدام DOMPurify.

```tsx
// كود غير آمن
dangerouslySetInnerHTML={{ __html: article.content }}

// كود آمن (مستخدم في بعض الملفات)
dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.content) }}
```

**التأثير:**
- حقن أكواد JavaScript خبيثة
- سرقة بيانات الجلسة
- تنفيذ إجراءات باسم المستخدم

**الحل المُقترح:**
توحيد استخدام DOMPurify في جميع الأماكن:
```tsx
import DOMPurify from 'isomorphic-dompurify';

// إنشاء مكون مساعد آمن
function SafeHTML({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />;
}
```

---

## 3. الثغرات متوسطة الخطورة (Medium)

### 3.1 تسجيل معلومات حساسة
**الخطورة:** 🟡 متوسطة  
**الملف:** `server/routes.ts`  
**السطر:** 442

**الوصف:**
```typescript
console.log("🔐 Login attempt:", { email: req.body?.email, hasPassword: !!req.body?.password });
```

**التأثير:**
- قد يُمكِّن من تحليل السجلات لاستنتاج وجود كلمة مرور
- مخاطر في حالة تسريب السجلات

**الحل المُقترح:**
```typescript
// في البيئة الإنتاجية فقط
if (process.env.NODE_ENV !== 'production') {
  console.log("🔐 Login attempt for:", req.body?.email);
}
```

### 3.2 رابط إعادة تعيين كلمة المرور في السجلات
**الخطورة:** 🟡 متوسطة  
**الملف:** `server/routes.ts.backup`  
**السطر:** 678

**الوصف:**
تسجيل رابط إعادة تعيين كلمة المرور في السجلات.

**الحل:** إزالة هذا التسجيل في البيئة الإنتاجية.

---

## 4. نقاط القوة الأمنية ✅

### 4.1 المصادقة وإدارة الجلسات
- ✅ استخدام bcrypt لتشفير كلمات المرور (salt rounds: 10)
- ✅ إعدادات الجلسة آمنة:
  - `httpOnly: true` - حماية من سرقة الجلسة عبر JavaScript
  - `secure: true` في الإنتاج - نقل عبر HTTPS فقط
  - `sameSite: 'strict'` - حماية جزئية من CSRF
  - مدة الجلسة: 7 أيام
- ✅ دعم المصادقة الثنائية (2FA) عبر TOTP
- ✅ أكواد احتياطية للمصادقة الثنائية

### 4.2 التحكم في الوصول (RBAC)
- ✅ نظام صلاحيات قائم على الأدوار
- ✅ فصل الصلاحيات (admin, editor, reporter, reader)
- ✅ التحقق من الصلاحيات قبل كل عملية حساسة
- ✅ تسجيل الأنشطة (Activity Logging)

### 4.3 رؤوس الأمان (Security Headers)
- ✅ استخدام Helmet.js مع إعدادات شاملة:
  - Content-Security-Policy
  - HSTS (max-age: 1 year, includeSubDomains, preload)
  - X-Content-Type-Options: nosniff
  - X-XSS-Protection
  - Referrer-Policy: strict-origin-when-cross-origin

### 4.4 تحديد معدل الطلبات (Rate Limiting)
- ✅ تحديد عام: 500 طلب / 15 دقيقة
- ✅ تحديد تسجيل الدخول: 5 محاولات / 15 دقيقة
- ✅ تحديد صارم للعمليات الحساسة: 10 طلبات / 15 دقيقة

### 4.5 CORS
- ✅ قائمة بيضاء للنطاقات المسموحة
- ✅ دعم credentials للمصادقة
- ✅ تحديد الطرق المسموحة

### 4.6 أمان قاعدة البيانات
- ✅ استخدام Drizzle ORM مع استعلامات مُعاملة (parameterized)
- ✅ اتصال آمن عبر SSL
- ✅ إعدادات pool محسّنة

---

## 5. التوصيات العاجلة

### الأولوية القصوى (خلال 24 ساعة):
1. **إصلاح ثغرة SQL Injection** في `adsAnalytics.ts`
2. **تطبيق حماية CSRF** على جميع المسارات الحساسة

### الأولوية العالية (خلال أسبوع):
3. **توحيد تعقيم XSS** باستخدام DOMPurify في جميع الأماكن
4. **إزالة تسجيل المعلومات الحساسة** في البيئة الإنتاجية

### الأولوية المتوسطة (خلال شهر):
5. إضافة Content-Security-Policy أكثر صرامة
6. تطبيق تشفير البيانات الحساسة في قاعدة البيانات
7. إعداد نظام مراقبة الأحداث الأمنية

---

## 6. ملخص الثغرات

| الخطورة | العدد | الحالة |
|---------|-------|--------|
| حرجة | 2 | ⚠️ يتطلب إصلاح فوري |
| عالية | 1 | ⚠️ يتطلب إصلاح قريب |
| متوسطة | 2 | 🔶 يتطلب مراجعة |
| منخفضة | 0 | - |

---

## 7. الخاتمة

المنصة تتمتع بأساس أمني قوي في مجالات المصادقة وإدارة الجلسات والتحكم في الوصول. ومع ذلك، هناك ثغرات حرجة تتطلب معالجة فورية، خاصة:

1. ثغرة حقن SQL في تحليلات الإعلانات
2. غياب حماية CSRF
3. عدم اتساق تعقيم محتوى HTML

يُنصح بمعالجة هذه الثغرات بأسرع وقت ممكن وإجراء مراجعة أمنية دورية.

---

**تم إعداد هذا التقرير بواسطة:** نظام التقييم الأمني الآلي  
**التاريخ:** 15 ديسمبر 2025

---

## 8. مخاطر تبعيات npm المقبولة (سجل القرار)

**تاريخ المراجعة:** 29 مايو 2026

`npm audit` يبلّغ عن **10 ثغرات moderate**، كلها عبر **تبعيات غير مباشرة (transitive)** ولا يوجد لها إصلاح غير كاسر (`npm audit fix` بلا أثر؛ `--force` يُنزِّل `exceljs` إلى 3.4.0 ويكسر تصدير Excel).

| السلسلة | المنشأ (الإصدار المثبّت) | النوع | القرار |
|---------|--------------------------|------|--------|
| `uuid <11.1.1` (GHSA-w5hq-g745-h8pq) | gaxios→9.0.1، teeny-request→9.0.1، `@google-cloud/storage`→8.3.2، exceljs→8.3.2 | إنتاج (transitive) | **مقبول/مؤجَّل** |
| `@esbuild-kit/*` | `drizzle-kit ^0.31.10` | devDependency فقط | **مقبول/مؤجَّل** |

**مبرّر القبول:**
- ثغرة `uuid` تصيب `v3/v5/v6` **فقط عند تمرير `buf`**؛ كل المستهلكين يستخدمون `uuid.v4()` بلا `buf` → **غير قابلة للاستغلال عملياً** في هذه الشجرة.
- سلسلة `@esbuild-kit` تأتي من `drizzle-kit` (أداة `db:push` للتطوير/البناء فقط، **لا تعمل في الإنتاج**) → ليست سطح هجوم.

**خطة المتابعة:** الانتظار حتى ترفع المكتبات الأم (`gaxios`/`exceljs`/`@google-cloud/storage`) اعتمادها إلى `uuid@^11.1.1`، أو فرض `overrides` لاحقاً **بعد** اختبار رفع GCS وتصدير Excel فعلياً. يُعاد التقييم عند ظهور إصدار غير كاسر أو ترقية ثغرة لأعلى من moderate.
