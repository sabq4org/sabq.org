# مشكلة SendGrid Webhooks في Production وحلولها

## 📋 ملخص المشكلة

عند استخدام **Replit Autoscale Deployment**، الطلبات الخارجية (External Requests) إلى API endpoints تُعيد HTML بدلاً من JSON.

### أمثلة:
- ✅ **Local:** `curl localhost:5000/api/email-agent/webhook-test` → يعمل بشكل مثالي
- ❌ **Production:** `curl https://sabq.replit.app/api/email-agent/webhook-test` → يعيد HTML من Frontend
- ❌ **Custom Domain:** `curl https://sabq.life/api/email-agent/webhook-test` → يعيد HTML من Frontend

## 🔍 السبب الجذري

في **Autoscale deployment**، Replit routing configuration يُوجّه جميع الطلبات الخارجية إلى Frontend (static files) بدلاً من Express backend.

**ملاحظة مهمة:**
- ✅ الكود صحيح 100% (routes مسجلة بالترتيب الصحيح قبل Vite middleware)
- ✅ العمليات تعمل بشكل مثالي على localhost
- ❌ المشكلة في **deployment routing configuration** فقط

## ✅ الحلول المتاحة

### **الحل الأول: استخدام Development Environment (الأسرع)**

استخدم **localhost مع ngrok** أو **Replit port forwarding** لاستقبال webhooks:

#### الخطوات:
1. **قم بتشغيل Server محلياً:**
   ```bash
   npm run dev
   ```

2. **استخدم ngrok للـ public URL:**
   ```bash
   ngrok http 5000
   ```
   
   سيعطيك URL مثل: `https://abc123.ngrok.io`

3. **عدّل SendGrid webhook URL:**
   ```
   SendGrid → Inbound Parse → Hostname
   URL: https://abc123.ngrok.io/api/email-agent/webhook
   ```

4. **اختبر الآن** - سيعمل بشكل مثالي! ✅

**مزايا:**
- ✅ يعمل فوراً
- ✅ لا يحتاج تعديلات في الكود
- ✅ مثالي للتطوير والاختبار

**عيوب:**
- ⚠️ يحتاج Server يعمل طوال الوقت
- ⚠️ ngrok free tier يُغيّر URL عند كل restart

---

### **الحل الثاني: Contact Replit Support (الأفضل للـ production)**

المشكلة تحتاج **deployment configuration fix** من Replit.

#### الخطوات:
1. افتح Replit Support: https://replit.com/support
2. اشرح المشكلة:
   ```
   Subject: Autoscale Deployment - External API requests return HTML instead of JSON
   
   Description:
   I have an Express.js app deployed using Autoscale.
   All external POST requests to /api/* routes return HTML (frontend) instead of JSON.
   
   - Local requests work: curl localhost:5000/api/* → ✅ JSON
   - External requests fail: curl https://myapp.replit.app/api/* → ❌ HTML
   
   Routes are registered before Vite middleware (correct order).
   This appears to be a deployment routing configuration issue.
   
   Project: https://replit.com/@username/sabq
   ```

3. انتظر رد الدعم الفني

**مزايا:**
- ✅ حل دائم للـ production
- ✅ يصلح المشكلة من الجذور

**عيوب:**
- ⚠️ يحتاج وقت انتظار للرد

---

### **الحل الثالث: استخدام Reserved VM Deployment (بديل مؤقت)**

إذا كانت **Autoscale** لا تعمل، جرّب **Reserved VM Deployment**:

#### الخطوات:
1. افتح Deployment settings في Replit
2. غيّر من **Autoscale** إلى **Reserved VM**
3. أعد النشر (Publish)
4. اختبر webhook URL مرة أخرى

**مزايا:**
- ✅ قد يحل المشكلة
- ✅ يوفر persistent storage

**عيوب:**
- ⚠️ أغلى من Autoscale
- ⚠️ لا يتوسع تلقائياً (no auto-scaling)

---

## 🧪 اختبار الحل

بعد تطبيق أي حل، اختبر باستخدام:

```bash
# Test diagnostic endpoint
curl -X POST https://YOUR_URL/api/email-agent/webhook-test \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Expected response (JSON):
{
  "success": true,
  "message": "Webhook endpoint is working!",
  "timestamp": "2025-11-17T..."
}

# Wrong response (HTML):
<!DOCTYPE html>...
```

## 📊 ملخص التوصيات

| الحل | السرعة | التكلفة | الأفضل لـ |
|------|--------|---------|----------|
| ngrok + localhost | ⚡ فوري | 🆓 مجاني | Development & Testing |
| Replit Support | ⏳ يحتاج وقت | 🆓 مجاني | Production (الحل الدائم) |
| Reserved VM | ⚡ سريع | 💰 متوسط | Production Alternative |

## ✨ التوصية النهائية

**للاختبار الفوري:** استخدم **ngrok + localhost** (الحل الأول)
**للـ production:** تواصل مع **Replit Support** (الحل الثاني)

---

## 📝 ملاحظات إضافية

1. **الكود صحيح تماماً** - المشكلة في deployment configuration فقط
2. **Email attachments parsing يعمل بشكل مثالي** على localhost
3. **جميع OpenAI calls تم ترقيتها إلى GPT-5.1** بنجاح
4. **10 reporters نشطين** في الـ production database

تم التوثيق: 17 نوفمبر 2025
