# خطوات تنفيذية لحل مشكلة النشر التلقائي

## 🎯 دليل التنفيذ العملي - خطوة بخطوة

---

## الحل الأول: ngrok (للاختبار الفوري)

### المتطلبات:
- جهاز كمبيوتر متصل بالإنترنت
- إمكانية تشغيل السيرفر محلياً
- حساب ngrok (مجاني)

### الخطوات التفصيلية:

#### 1. تحميل وتثبيت ngrok

**للويندوز:**
```powershell
# تحميل من الموقع
https://ngrok.com/download

# فك الضغط
# تشغيل ngrok.exe
```

**للماك:**
```bash
# تثبيت عبر Homebrew
brew install ngrok/ngrok/ngrok
```

**للينكس:**
```bash
# تحميل
wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz

# فك الضغط
tar xvzf ngrok-v3-stable-linux-amd64.tgz

# نقل للـ PATH
sudo mv ngrok /usr/local/bin
```

#### 2. تسجيل حساب ngrok

```bash
# التسجيل في https://dashboard.ngrok.com/signup

# نسخ Auth Token من Dashboard

# ربط الحساب
ngrok config add-authtoken YOUR_AUTH_TOKEN_HERE
```

#### 3. تشغيل السيرفر المحلي

**Terminal 1 - تشغيل السيرفر:**
```bash
# الانتقال لمجلد المشروع
cd /path/to/sabq-project

# تثبيت Dependencies
npm install

# تشغيل السيرفر
npm run dev

# ✅ انتظر حتى ترى:
# [Server] ✅ Successfully started on port 5000
```

#### 4. تشغيل ngrok

**Terminal 2 - تشغيل ngrok:**
```bash
ngrok http 5000
```

**ستظهر لك شاشة مثل:**
```
ngrok                                                                                    
Session Status    online
Account           Your Name (Plan: Free)
Version           3.x.x
Region            United States (us)
Web Interface     http://127.0.0.1:4040
Forwarding        https://abc123xyz.ngrok-free.app -> http://localhost:5000

Connections       ttl     opn     rt1     rt5     p50     p90
                  0       0       0.00    0.00    0.00    0.00
```

**❗ المهم:** انسخ الـ URL الذي يبدأ بـ `https://` (مثلاً: `https://abc123xyz.ngrok-free.app`)

#### 5. تكوين SendGrid

**أ) تسجيل الدخول لـ SendGrid:**
```
https://app.sendgrid.com
```

**ب) الانتقال لـ Inbound Parse:**
```
Settings → Inbound Parse → Click on your domain
```

**ج) تعديل Webhook URL:**
```
الـ URL القديم:
https://sabq.replit.app/api/email-agent/webhook

الـ URL الجديد:
https://abc123xyz.ngrok-free.app/api/email-agent/webhook
                  ↑
           (استبدل بـ URL الخاص بك من ngrok)
```

**د) حفظ التغييرات**

#### 6. اختبار النظام

**إرسال بريد تجريبي:**
```
To: news@sabq.life
Subject: [TOKEN:your-trusted-sender-token]
Body: اختبار النشر التلقائي
Attachment: صورة.jpg
```

**مراقبة Logs:**

في Terminal 1 (السيرفر)، ستشاهد:
```
[EmailAgent] ✅ Webhook received
[EmailAgent] Processing email from: sender@example.com
[EmailAgent] Found 1 image attachments
[ObjectStorage] Uploading: email-attachments/image.jpg
[EmailAgent] ✅ Article published successfully
```

في Terminal 2 (ngrok)، ستشاهد:
```
POST /api/email-agent/webhook    200 OK
```

**✅ النجاح:** افتح الموقع وتحقق من نشر المقالة مع الصورة

---

### ملاحظات مهمة لـ ngrok:

#### ✅ المزايا:
- يعمل فوراً (خلال 5 دقائق)
- مجاني تماماً (Free plan)
- لا يحتاج تعديلات في الكود

#### ⚠️ نقاط الانتباه:
1. **الـ URL يتغير كل مرة:**
   - عند إعادة تشغيل ngrok، ستحصل على URL جديد
   - يجب تحديث SendGrid في كل مرة
   - **الحل:** ngrok paid plan ($8/شهر) يعطيك URL ثابت

2. **السيرفر يجب أن يعمل دائماً:**
   - إذا أطفأت الجهاز، النشر التلقائي لن يعمل
   - **الحل:** تشغيل على server دائم أو VM

3. **Free plan limitations:**
   - 40 connections/دقيقة
   - 60 requests/دقيقة
   - كافٍ للاختبار والاستخدام الخفيف

#### 💡 نصيحة:
للاستخدام الطويل، احصل على **ngrok Pro** ($8/شهر):
```bash
# بعد الترقية
ngrok http 5000 --domain=your-custom-domain.ngrok-free.app

# الآن الـ URL ثابت ولن يتغير!
```

---

## الحل الثاني: Reserved VM (للإنتاج)

### المتطلبات:
- حساب Replit نشط
- صلاحيات تعديل Deployment
- ميزانية $20-50/شهر

### الخطوات التفصيلية:

#### 1. النسخ الاحتياطي (مهم!)

```bash
# تأكد من commit آخر التغييرات
git add .
git commit -m "Backup before deployment change"
git push
```

#### 2. تسجيل الدخول لـ Replit

```
https://replit.com
```

#### 3. فتح المشروع

```
Projects → sabq → Open
```

#### 4. فتح إعدادات Deployment

```
طريقة 1:
Click على "Deploy" في الزاوية العلوية

طريقة 2:
Tools → Deployments → Manage
```

#### 5. تغيير نوع Deployment

**الخطوات:**
```
1. Current deployment: Autoscale (active)
   
2. Click "Change deployment type"

3. اختر "Reserved VM"

4. اختر الحجم:
   - Small: $20/month (1 vCPU, 2GB RAM) - مناسب للبداية
   - Medium: $30/month (2 vCPU, 4GB RAM) - موصى به
   - Large: $50/month (4 vCPU, 8GB RAM) - للاستخدام الثقيل

5. Review cost estimate

6. Click "Deploy"
```

#### 6. انتظار Deploy

```
⏳ Building...
⏳ Deploying...
✅ Deployment successful!

URL: https://sabq.replit.app (نفس الـ URL)
```

#### 7. اختبار Webhook

**بعد Deploy الناجح:**

```bash
# اختبار من Terminal
curl -X POST https://sabq.replit.app/api/email-agent/webhook-test \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# المتوقع:
{
  "success": true,
  "message": "Webhook endpoint is working!",
  "timestamp": "2025-11-17T..."
}
```

**✅ إذا حصلت على JSON response:**
- المشكلة مُحلّة!
- SendGrid سيعمل تلقائياً (الـ URL لم يتغير)

**❌ إذا ما زلت تحصل على HTML:**
- Reserved VM لم يحل المشكلة
- انتقل للحل الثالث (Replit Support)

#### 8. مراقبة الأداء

**Dashboard Metrics:**
```
Deployments → Current Deployment → Metrics

راقب:
- CPU Usage
- Memory Usage
- Request Rate
- Error Rate
```

---

### ملاحظات مهمة لـ Reserved VM:

#### ✅ المزايا:
- أداء ثابت ومتوقع
- لا يوجد cold starts
- موارد مخصصة
- persistent filesystem (إذا احتجت)

#### ⚠️ التكلفة:
```
Small VM: $20/month
= $0.67/day
= $0.028/hour

Medium VM: $30/month (موصى به)
= $1/day
= $0.042/hour

Large VM: $50/month
= $1.67/day
= $0.069/hour
```

#### 💡 تحسين التكلفة:
- ابدأ بـ Small
- راقب الأداء لمدة أسبوع
- إذا احتجت أكثر، upgrade لـ Medium

---

## الحل الثالث: Replit Support (الحل الدائم)

### المتطلبات:
- حساب Replit
- بريد إلكتروني للتواصل
- صبر (1-7 أيام response time)

### الخطوات التفصيلية:

#### 1. التحضير

**جمع المعلومات:**
```
✓ Project URL
✓ Current deployment type (Autoscale)
✓ Production URL (https://sabq.replit.app)
✓ Screenshot of the issue
✓ Logs (إذا متوفرة)
```

#### 2. فتح Support Ticket

**طريقة 1: من Dashboard**
```
replit.com → Help (?) → Contact Support
```

**طريقة 2: مباشرة**
```
https://replit.com/support
```

#### 3. ملء النموذج

**Subject:**
```
Autoscale Deployment: External POST requests to /api/* return HTML instead of JSON
```

**Category:**
```
اختر: Deployments
```

**Priority:**
```
اختر: High (Production Issue)
```

**Description:**
```
استخدم النص من الملف:
docs/REPLIT_SUPPORT_TICKET.md

أو اكتب:

We have an Express.js + React application deployed using Autoscale.
External POST requests to our API endpoints (/api/*) are returning 
HTML (the frontend page) instead of JSON responses.

Technical Details:
- Local development: Works perfectly ✅
- Production deployment: Returns HTML instead of JSON ❌
- Routes are registered before static serving ✅
- Same code, different behavior in production

Use Case:
We need to receive webhooks from SendGrid Inbound Parse for 
automated article publishing. Webhooks cannot reach our API 
in production.

Request:
Please review the routing configuration for Autoscale deployments
to ensure external requests to /api/* reach the Express backend.

Project: https://replit.com/@username/sabq
Production URL: https://sabq.replit.app

Thank you!
```

#### 4. إرفاق المعلومات

**Screenshot 1: curl test showing HTML:**
```bash
# قبل الإرسال، خذ screenshot من:
curl -X POST https://sabq.replit.app/api/email-agent/webhook-test \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

**Screenshot 2: Working localhost:**
```bash
# وكذلك screenshot من:
curl -X POST http://localhost:5000/api/email-agent/webhook-test \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

#### 5. الإرسال والمتابعة

**بعد الإرسال:**
```
✅ ستحصل على Ticket Number
✅ ستصلك رسالة تأكيد على البريد

متوقع Response Time:
- Standard: 1-3 أيام
- High Priority: 12-24 ساعة
```

**المتابعة:**
```
- تحقق من بريدك يومياً
- رد على أي أسئلة من Support فوراً
- كن محترماً ومهنياً في الردود
```

#### 6. بعد الحل

**عندما يُحل:**
```
1. ✅ اختبر webhook فوراً
2. ✅ تأكد من عمل SendGrid
3. ✅ أرسل شكر لـ Support team
4. ✅ وثّق الحل في documentation
```

---

## 📊 خطة العمل الموصى بها

### الأسبوع الأول: الاختبار
```
اليوم 1-2: تجهيز ngrok
  └─ تثبيت وتكوين
  └─ ربط مع SendGrid
  └─ اختبار شامل
  
اليوم 3-4: مراقبة الأداء
  └─ اختبار مع صحفيين حقيقيين
  └─ قياس معدل النجاح
  └─ جمع feedback
```

### الأسبوع الثاني: الإنتاج
```
اليوم 1: فتح Support Ticket
  └─ إرسال طلب مفصّل
  └─ إرفاق جميع الأدلة
  
اليوم 2-3: تجربة Reserved VM (اختياري)
  └─ Deploy على Reserved VM
  └─ اختبار شامل
  └─ قياس التكلفة vs الفائدة
  
اليوم 4-7: انتظار Replit Response
  └─ متابعة Support ticket
  └─ الاستمرار مع ngrok مؤقتاً
```

### بعد الحل:
```
✅ إيقاف ngrok (إذا استخدمت)
✅ العودة لـ Autoscale (إذا كنت على Reserved VM)
✅ توثيق الحل النهائي
✅ تدريب الفريق على النظام
```

---

## ❓ الأسئلة الشائعة

### س: ماذا لو لم يُحل Reserved VM المشكلة؟
**ج:** العودة لـ Autoscale والاعتماد على ngrok حتى يرد Replit Support.

### س: هل يمكن استخدام الحلول الثلاثة معاً؟
**ج:** نعم، يمكن البدء بـ ngrok للاختبار، ثم Reserved VM للإنتاج، ثم Replit Support للحل الدائم.

### س: كم تكلفة ngrok Pro؟
**ج:** $8/شهر للحصول على domain ثابت.

### س: ماذا عن Heroku أو AWS؟
**ج:** ممكن، لكنها أغلى وأكثر تعقيداً. Reserved VM على Replit أبسط وأرخص.

---

## 📞 الدعم الفني

إذا احتجت مساعدة في التنفيذ:

**للمشاكل التقنية:**
- راجع `docs/SENDGRID_IMAGES_PRODUCTION_ISSUE.md`

**للشرح المبسط:**
- راجع `docs/SENDGRID_ISSUE_SIMPLIFIED_AR.md`

**لـ Replit Support:**
- استخدم `docs/REPLIT_SUPPORT_TICKET.md`

---

**آخر تحديث:** 17 نوفمبر 2025  
**الإصدار:** 1.0  
**الحالة:** جاهز للتنفيذ
