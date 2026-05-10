# إعداد Deployment Secrets - Replit Autoscale

## 🎯 المشكلة

عند النشر (Deployment)، السيرفر يحاول تشغيل Vite في development mode بدلاً من serving static files، مما يؤدي لـ crash.

**السبب:** متغير البيئة `NODE_ENV` غير مضبوط في deployment.

---

## ✅ الحل: إضافة Deployment Secrets

### الخطوات:

#### 1️⃣ فتح Publishing Tool

```
1. افتح مشروعك في Replit
2. اضغط على "Deploy" في الزاوية العلوية اليمنى
3. أو: Tools → Deployments
```

#### 2️⃣ فتح إعدادات Deployment

```
1. اختر "Autoscale Deployment"
2. اضغط على "Configure" أو "Settings" أو ⚙️
3. ابحث عن قسم "Environment Variables" أو "Secrets"
```

#### 3️⃣ إضافة NODE_ENV Secret

```
Variable Name: NODE_ENV
Value: production

اضغط "Add" أو "Save"
```

#### 4️⃣ إضافة ENABLE_BACKGROUND_WORKERS (اختياري)

```
Variable Name: ENABLE_BACKGROUND_WORKERS
Value: false

اضغط "Add" أو "Save"

ملاحظة: هذا مهم لـ Autoscale deployment لأنه لا يدعم background workers
```

---

## 📋 قائمة Secrets المطلوبة للـ Deployment

| Secret Name | القيمة | الأهمية | الوصف |
|-------------|-------|---------|-------|
| `NODE_ENV` | `production` | ⭐⭐⭐ ضروري | يُخبر السيرفر أنه في production mode |
| `ENABLE_BACKGROUND_WORKERS` | `false` | ⭐⭐ موصى به | يُعطّل background workers في Autoscale |
| `DATABASE_URL` | (موجود تلقائياً) | ⭐⭐⭐ ضروري | رابط قاعدة البيانات |
| `SENDGRID_API_KEY` | (موجود) | ⭐⭐⭐ ضروري | مفتاح SendGrid |
| `GOOGLE_CLIENT_ID` | (موجود) | ⭐⭐ للـ OAuth | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | (موجود) | ⭐⭐ للـ OAuth | Google OAuth |

---

## 🔄 بعد إضافة Secrets

### إعادة النشر (Redeploy):

```
1. في صفحة Deployments
2. اضغط "Redeploy" أو "Deploy Again"
3. انتظر اكتمال Build
4. انتظر اكتمال Deployment
```

### التحقق من النجاح:

#### اختبار 1: Health Check
```bash
curl https://sabq.replit.app/health

# المتوقع:
{"status":"healthy","timestamp":"..."}
```

#### اختبار 2: Webhook Test
```bash
curl -X POST https://sabq.replit.app/api/email-agent/webhook-test \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# المتوقع (JSON):
{"success": true, "message": "Webhook endpoint is working!", ...}

# ❌ إذا حصلت على HTML:
<!DOCTYPE html>... 
# → المشكلة الأصلية (routing) ما زالت موجودة
```

---

## 📊 Deployment Logs

### كيف تتحقق من Logs:

```
1. في صفحة Deployments
2. اختر Current Deployment
3. اضغط "Logs" أو "View Logs"
```

### Logs الصحيحة:

```
[Server] Environment: production ✅
[Server] Starting in PRODUCTION mode with static files ✅
[Server] ✅ Static files setup completed ✅
[Server] ✅ Successfully started on port 5000 ✅
```

### Logs الخاطئة:

```
[Server] Environment: development ❌
[Server] Starting in DEVELOPMENT mode with Vite ❌
[Vite] Error loading /src/main.tsx ❌
```

---

## ⚠️ ملاحظات مهمة

### 1. Workspace Secrets vs Deployment Secrets

```
- Workspace Secrets: تُستخدم في Development (localhost)
- Deployment Secrets: تُستخدم في Production (deployed app)
- Replit يُزامنهم تلقائياً (إلا لو عطّلت Sync)
```

### 2. Background Workers

```
Autoscale: لا يدعم background workers
→ استخدم ENABLE_BACKGROUND_WORKERS=false

Reserved VM: يدعم background workers
→ استخدم ENABLE_BACKGROUND_WORKERS=true
```

### 3. Build Process

```
عند Deployment، Replit يُشغّل:
1. npm run build
   → يبني Frontend (Vite) → dist/public/
   → يبني Backend (esbuild) → dist/index.js

2. npm run start (أو node dist/index.js)
   → يُشغّل السيرفر في production mode
```

---

## 🐛 Troubleshooting

### المشكلة: Deployment ما زال يفشل بعد إضافة NODE_ENV

**الحل 1: تأكد من Save**
```
- بعد إضافة Secret، اضغط "Save" أو "Apply"
- تأكد من ظهور Secret في القائمة
```

**الحل 2: Hard Redeploy**
```
1. احذف Current Deployment
2. اعمل Deploy جديد من الصفر
```

**الحل 3: تحقق من Build Logs**
```
1. افتح Deployment Logs
2. ابحث عن "npm run build"
3. تأكد من عدم وجود errors في build
```

### المشكلة: Health check يعمل لكن webhook ما زال يُعيد HTML

```
هذه المشكلة الأصلية (Replit Autoscale routing issue)
→ راجع docs/PROBLEM_DESCRIPTION_IMAGES.md
→ راجع docs/SENDGRID_ISSUE_SIMPLIFIED_AR.md
```

### المشكلة: Background workers errors في logs

```
[Server] ⚠️ Error starting notification worker...

الحل: أضف ENABLE_BACKGROUND_WORKERS=false في Deployment Secrets
```

---

## 📱 اختبار كامل بعد Deployment

### 1. Health Check ✅
```bash
curl https://sabq.replit.app/health
```

### 2. Frontend ✅
```
افتح: https://sabq.replit.app
المتوقع: الصفحة الرئيسية تظهر بشكل صحيح
```

### 3. Dashboard ✅
```
افتح: https://sabq.replit.app/dashboard
المتوقع: لوحة التحكم تعمل
```

### 4. API Endpoint ✅
```bash
curl https://sabq.replit.app/api/categories
```

### 5. Webhook (المشكلة الأصلية) ⚠️
```bash
curl -X POST https://sabq.replit.app/api/email-agent/webhook-test \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

ملاحظة: هذا قد لا يعمل بسبب المشكلة الأصلية (routing)
```

---

## 🎯 الخلاصة

### ما قمنا به:
1. ✅ أضفنا NODE_ENV=production في Deployment Secrets
2. ✅ (اختياري) أضفنا ENABLE_BACKGROUND_WORKERS=false
3. ✅ حسّنا server/index.ts للتحقق من البيئة بشكل أفضل

### النتيجة المتوقعة:
- ✅ Deployment يعمل بدون crash
- ✅ السيرفر يُشغّل static files بدلاً من Vite
- ✅ Frontend و API يعملان بشكل طبيعي
- ⚠️ Webhook قد لا يعمل (المشكلة الأصلية - routing issue)

### الخطوة التالية:
- اتبع الحلول في `docs/SENDGRID_ISSUE_SIMPLIFIED_AR.md` لحل مشكلة webhook routing

---

**تاريخ الإنشاء:** 17 نوفمبر 2025  
**الحالة:** جاهز للتطبيق  
**الأولوية:** عالية
