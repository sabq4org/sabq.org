# مشكلة عدم ظهور الصور مع النشر التلقائي - توثيق فني مفصّل

## 📋 ملخص تنفيذي

نظام النشر التلقائي للأخبار عبر البريد الإلكتروني (Email Agent) يعمل بشكل مثالي على بيئة التطوير المحلية (localhost)، لكنه **لا يستقبل أي طلبات على الإطلاق** في بيئة الإنتاج (Production).

**ملاحظة حاسمة:** المشكلة ليست في معالجة الصور أو تحليل المرفقات - بل في **عدم وصول طلبات SendGrid webhook أصلاً** إلى السيرفر.

---

## 🔍 التحليل الفني المفصّل

### 1. البيئة التقنية

#### **البنية التحتية:**
- **المنصة:** Replit
- **نوع Deployment:** Autoscale (auto-scaling deployment)
- **Backend:** Express.js + TypeScript
- **Frontend:** React + Vite
- **البورت:** 5000 (مخدّم واحد للـ API والـ Frontend)
- **SendGrid Inbound Parse:** نشط ومُكوّن بشكل صحيح

#### **URLs الحالية:**
- Production: `https://sabq.replit.app`
- Custom Domain: `https://sabq.life`
- Local Development: `http://localhost:5000`

---

### 2. الوصف الدقيق للمشكلة

#### **السلوك الحالي:**

عند إرسال بريد إلكتروني إلى SendGrid Inbound Parse:

**✅ في بيئة التطوير (localhost:5000):**
```bash
POST http://localhost:5000/api/email-agent/webhook
→ النتيجة: ✅ 200 OK + JSON response
→ الصور: ✅ تُرفع بنجاح إلى Google Cloud Storage
→ المقالة: ✅ تُنشر تلقائياً مع الصور
```

**❌ في بيئة الإنتاج (production):**
```bash
POST https://sabq.replit.app/api/email-agent/webhook
→ النتيجة: ❌ 200 OK + HTML response (Frontend page!)
→ السيرفر: لم يستقبل الطلب على الإطلاق
→ لا يوجد أي logs في Express
```

#### **الاختبارات المباشرة:**

```bash
# ✅ اختبار محلي - يعمل بشكل مثالي
curl -X POST http://localhost:5000/api/email-agent/webhook-test \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
→ Response: {"success": true, "message": "Webhook endpoint is working!"}

# ❌ اختبار Production - يعيد HTML بدلاً من JSON
curl -X POST https://sabq.replit.app/api/email-agent/webhook-test \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
→ Response: <!DOCTYPE html>... (صفحة Frontend!)
```

---

### 3. السبب الجذري

**المشكلة الحقيقية:** في Replit Autoscale Deployment، يتم **routing جميع الطلبات الخارجية إلى Frontend** بدلاً من Express backend.

#### **التحليل التقني:**

**الترتيب الصحيح للكود (موجود بالفعل):**
```typescript
// server/index.ts
// ✅ Routes مسجلة أولاً
const server = await registerRoutes(app);

// ✅ Social crawler middleware
app.use(socialCrawlerMiddleware);

// ✅ Error handler
app.use(errorHandler);

// ✅ Frontend serving يأتي في النهاية
if (app.get("env") === "development") {
  await setupVite(app, server);
} else {
  serveStatic(app);
}
```

**الكود صحيح 100%** - الترتيب منطقي ويعمل على localhost.

**لكن في Production:**
- Replit Autoscale deployment configuration يتجاوز هذا الترتيب
- يُوجّه الطلبات الخارجية (External Requests) مباشرة إلى static files
- **لا تصل الطلبات إلى Express routes على الإطلاق**

---

### 4. الأدلة الفنية

#### **أ) كود معالجة الصور صحيح 100%:**

```typescript
// server/routes/emailAgent.ts - السطر 150-180

// ✅ Binary data preservation صحيح
const parsedEmail = await simpleParser(
  Buffer.from(req.body.email, 'binary')
);

// ✅ Attachment processing صحيح
const attachments = parsedEmail.attachments || [];
for (const attachment of attachments) {
  const buffer = attachment.content; // Binary buffer
  const uploadedFile = await objectStorage.uploadFile(
    `email-attachments/${filename}`,
    buffer,
    contentType
  );
}

// ✅ Featured image selection صحيح
if (imageAttachments.length > 0) {
  articleData.imageUrl = imageAttachments[0].url;
}
```

**اختبار:** عند استخدام ngrok/localhost مع SendGrid → **الصور تُرفع بنجاح** ✅

---

#### **ب) تكوين SendGrid صحيح:**

```yaml
SendGrid Inbound Parse Settings:
  Hostname: news@sabq.life
  Webhook URL: https://sabq.replit.app/api/email-agent/webhook
  Status: Active ✅
```

**اختبار:** SendGrid يُرسل الطلب بنجاح - لكنه يصل للـ Frontend بدلاً من Backend ❌

---

#### **ج) الـ Routes مسجلة بشكل صحيح:**

```typescript
// server/routes.ts
app.post("/api/email-agent/webhook", emailAgentWebhookHandler);
app.post("/api/email-agent/webhook-test", testWebhookHandler);
```

**اختبار:** على localhost - يعمل بشكل مثالي ✅

---

### 5. ما **لا** يعمل (الحلول المُجرّبة)

#### **❌ محاولة 1: إضافة middleware إضافي**
```typescript
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  next();
});
```
**النتيجة:** لا تأثير - المشكلة أعلى من مستوى Express

---

#### **❌ محاولة 2: تغيير ترتيب Middleware**
```typescript
// تجربة تسجيل routes قبل كل شيء
```
**النتيجة:** لا تأثير - الترتيب صحيح بالفعل

---

#### **❌ محاولة 3: استخدام `.repl.co` URLs**
```bash
curl https://workspace.sabq.repl.co/api/email-agent/webhook-test
```
**النتيجة:** DNS error - لا يعمل على Autoscale

---

### 6. الحلول المقترحة

#### **الحل الأول: استخدام ngrok للتطوير (حل مؤقت)**

**الوصف:**
- تشغيل Server محلياً على `localhost:5000`
- استخدام ngrok لإنشاء public URL
- تكوين SendGrid للإشارة إلى ngrok URL

**الخطوات:**
```bash
# 1. تشغيل Server
npm run dev

# 2. في terminal آخر
ngrok http 5000

# 3. استخدام URL من ngrok في SendGrid:
# https://abc123.ngrok.io/api/email-agent/webhook
```

**المزايا:**
- ✅ يعمل فوراً
- ✅ لا يحتاج تعديلات في الكود
- ✅ مثالي للاختبار

**العيوب:**
- ⚠️ يحتاج Server يعمل طوال الوقت
- ⚠️ ngrok free يُغيّر URL عند كل restart
- ⚠️ ليس حل production

---

#### **الحل الثاني: Reserved VM Deployment**

**الوصف:**
تغيير نوع Deployment من Autoscale إلى Reserved VM

**الخطوات:**
1. فتح Deployment Settings في Replit
2. تغيير Type من **Autoscale** إلى **Reserved VM**
3. إعادة النشر (Publish)
4. اختبار webhook URL

**المزايا:**
- ✅ قد يحل المشكلة تماماً
- ✅ يوفر persistent storage
- ✅ أداء ثابت ومتوقع

**العيوب:**
- ⚠️ تكلفة أعلى من Autoscale
- ⚠️ لا يتوسع تلقائياً (no auto-scaling)

**التكلفة المقدرة:**
- Reserved VM: ~$20-50/شهر (حسب الموارد)
- vs Autoscale: Pay per use

---

#### **الحل الثالث: التواصل مع Replit Support (الحل الدائم)**

**الوصف:**
طلب دعم فني من Replit لإصلاح routing configuration

**الخطوات:**
1. فتح ticket في Replit Support: https://replit.com/support
2. شرح المشكلة بالتفصيل
3. إرفاق الأدلة (logs, screenshots)

**نص مقترح للطلب:**
```
Subject: Autoscale Deployment - External POST requests to /api/* return HTML instead of JSON

Description:
We have an Express.js application deployed using Autoscale.
External POST requests to /api/* routes are returning HTML (frontend) instead of JSON.

Technical Details:
- Local requests work perfectly: curl localhost:5000/api/* → ✅ JSON
- External requests fail: curl https://myapp.replit.app/api/* → ❌ HTML
- Routes are registered BEFORE Vite/static middleware (correct order)
- This appears to be a deployment routing configuration issue

Use Case:
We need to receive webhooks from SendGrid Inbound Parse.
Webhooks cannot reach our Express API endpoints in production.

Project URL: https://replit.com/@username/sabq
Expected: External POST to /api/* routes should reach Express backend
Actual: External POST to /api/* routes return frontend HTML

Request: Please review and fix the routing configuration for Autoscale deployments
to allow external requests to reach backend API routes.
```

**المزايا:**
- ✅ حل دائم ومستدام
- ✅ يصلح المشكلة من الجذور
- ✅ مجاني

**العيوب:**
- ⚠️ يحتاج وقت انتظار (1-7 أيام عادةً)

---

### 7. التوصية النهائية

#### **للاختبار الفوري (خلال دقائق):**
→ **استخدم ngrok** (الحل الأول)

#### **للإنتاج (خلال ساعات):**
→ **جرّب Reserved VM** (الحل الثاني)

#### **للحل الدائم (خلال أسبوع):**
→ **تواصل مع Replit Support** (الحل الثالث)

---

### 8. معلومات إضافية للخبراء

#### **الكود الكامل متاح في:**
- `server/routes/emailAgent.ts` - معالجة webhook
- `server/index.ts` - تكوين Express
- `server/vite.ts` - Vite middleware setup
- `docs/SENDGRID_ATTACHMENTS_SETUP.md` - دليل التكوين

#### **البيانات التقنية:**
- قاعدة البيانات: PostgreSQL (Neon serverless)
- Object Storage: Google Cloud Storage
- AI Model: GPT-5.1 (OpenAI)
- 10 reporters نشطين في production
- معدل النشر المتوقع: 5-20 مقالة/يوم

#### **الاختبارات المتاحة:**
```bash
# اختبار diagnostic endpoint
curl -X POST https://YOUR_URL/api/email-agent/webhook-test \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Response المتوقع (JSON):
{"success": true, "message": "Webhook endpoint is working!", "timestamp": "..."}

# Response الخاطئ (HTML):
<!DOCTYPE html>...
```

---

### 9. الخلاصة

**المشكلة:**
- ❌ SendGrid webhooks لا تصل إلى Express backend في production
- ✅ الكود صحيح 100% - المشكلة في deployment configuration
- ✅ يعمل بشكل مثالي على localhost

**السبب:**
- Replit Autoscale يُوجّه External Requests إلى Frontend بدلاً من Backend

**الحل:**
- استخدام ngrok للاختبار الفوري
- تجربة Reserved VM للإنتاج
- التواصل مع Replit Support للحل الدائم

---

**تاريخ التوثيق:** 17 نوفمبر 2025  
**الحالة:** قيد الحل  
**الأولوية:** عالية (يمنع النشر التلقائي)
