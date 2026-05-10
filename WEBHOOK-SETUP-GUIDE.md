# 📡 دليل إعداد Webhooks بعد النقل إلى Reserved VM

## 🎯 الهدف
بعد النقل من Autoscale إلى Reserved VM، تغير الدومين من `sabq.life` إلى `sabqorg.replit.app`.
يجب تحديث webhooks في SendGrid و Twilio لضمان عمل النشر التلقائي.

---

## 📧 **1. تحديث SendGrid Inbound Parse Webhook**

### الخطوات:

1. **سجّل دخول إلى SendGrid:**
   - اذهب إلى: https://app.sendgrid.com

2. **افتح إعدادات Inbound Parse:**
   - من القائمة اليسرى: **Settings** → **Inbound Parse**
   - أو: https://app.sendgrid.com/settings/parse

3. **ابحث عن webhook القديم:**
   - ستجد webhook يشير إلى:
     ```
     ❌ https://sabq.life/api/email/webhook
     ```

4. **عدّل الـ webhook:**
   - اضغط على **Edit** (أو القلم ✏️)
   - في حقل **Destination URL**، ضع:
     ```
     ✅ https://sabqorg.replit.app/api/email/webhook
     ```

5. **تأكد من الإعدادات:**
   - ✅ **Post the raw, full MIME message** (يجب تفعيله)
   - ✅ **Method: POST**

6. **احفظ التغييرات:**
   - اضغط **Save** أو **Update**

---

## 📱 **2. تحديث Twilio WhatsApp Webhook**

### الخطوات:

1. **سجّل دخول إلى Twilio Console:**
   - اذهب إلى: https://console.twilio.com

2. **افتح إعدادات WhatsApp:**
   - من القائمة: **Messaging** → **Try it out** → **Send a WhatsApp message**
   - أو: **Phone Numbers** → **Manage** → **Active numbers**

3. **اختر رقم الواتساب:**
   - اضغط على الرقم الذي تستخدمه للواتساب

4. **ابحث عن قسم "Messaging":**
   - ستجد: **"When a message comes in"**

5. **عدّل الـ webhook:**
   - احذف القيمة القديمة:
     ```
     ❌ https://sabq.life/api/whatsapp/webhook
     ```
   - ضع القيمة الجديدة:
     ```
     ✅ https://sabqorg.replit.app/api/whatsapp/webhook
     ```

6. **تأكد من الإعدادات:**
   - ✅ **HTTP POST** (يجب أن يكون POST)

7. **احفظ:**
   - اضغط **Save** في أسفل الصفحة

---

## 🔑 **3. إضافة Twilio Credentials (إذا لم تكن موجودة)**

### في **Secrets** (Replit):

أضف المتغيرات التالية:

```bash
TWILIO_ACCOUNT_SID=AC.........................
TWILIO_AUTH_TOKEN=.............................
TWILIO_PHONE_NUMBER=whatsapp:+14155238886
```

### كيفية الحصول على القيم:

1. **TWILIO_ACCOUNT_SID:**
   - من Twilio Console → Account Info
   - انسخ "Account SID"

2. **TWILIO_AUTH_TOKEN:**
   - من نفس المكان
   - انسخ "Auth Token" (اضغط Show)

3. **TWILIO_PHONE_NUMBER:**
   - من Phone Numbers → Active numbers
   - انسخ الرقم بصيغة: `whatsapp:+14155238886`

---

## ⚙️ **4. تفعيل Background Workers**

### في **Secrets** (Replit):

أضف المتغير:

```bash
ENABLE_BACKGROUND_WORKERS=true
```

**ملاحظة:** هذا المتغير يفعّل:
- ✅ Email Agent (فحص الإيميلات تلقائياً)
- ✅ WhatsApp Agent (فحص الواتساب تلقائياً)

---

## 🧪 **5. اختبار النشر التلقائي**

### اختبار Email Agent:

1. أرسل إيميل إلى عنوان SendGrid المربوط
2. يجب أن يحتوي على:
   - **Subject:** عنوان الخبر
   - **Body:** نص الخبر
   - **Attachment:** صورة (اختياري)
   - **Token:** الـ token من لوحة التحكم (إذا لزم)

3. تحقق من:
   - ✅ وصول الإيميل إلى `/api/email/webhook`
   - ✅ معالجة المحتوى بنجاح
   - ✅ نشر المقال تلقائياً
   - ✅ رفع الصور بنجاح

### اختبار WhatsApp Agent:

1. أرسل رسالة واتساب إلى رقم Twilio
2. يجب أن تحتوي على:
   - **Text:** نص الخبر
   - **Image:** صورة (اختياري)
   - **Token:** الـ token من لوحة التحكم (إذا لزم)

3. تحقق من:
   - ✅ وصول الرسالة إلى `/api/whatsapp/webhook`
   - ✅ معالجة المحتوى بنجاح
   - ✅ نشر المقال تلقائياً
   - ✅ رفع الصور بنجاح

---

## ✅ **6. التحقق من النجاح**

### في لوحة التحكم (Admin Panel):

1. اذهب إلى **Communications** → **Email Agent**
2. تحقق من:
   - Webhook Logs تظهر الطلبات الجديدة
   - Status: `processed` أو `published`
   - لا توجد أخطاء

3. اذهب إلى **Communications** → **WhatsApp**
4. تحقق من نفس الأشياء

### في Logs (Production):

```bash
✅ [Email Agent] ============ WEBHOOK START ============
✅ [Email Agent] Processing email...
✅ [Email Agent] Article published successfully
✅ [Email Agent] Uploaded PUBLIC attachment: ...
```

```bash
✅ [WhatsApp Agent] ============ WEBHOOK START ============
✅ [WhatsApp Agent] Twilio signature validated successfully
✅ [WhatsApp Agent] Article published successfully
```

---

## ⚠️ **استكشاف الأخطاء**

### إذا لم يصل webhook:

1. تأكد من الـ URL صحيح:
   ```
   https://sabqorg.replit.app/api/email/webhook
   https://sabqorg.replit.app/api/whatsapp/webhook
   ```

2. تأكد من أن السيرفر يعمل:
   ```bash
   curl https://sabqorg.replit.app/health
   ```

3. تحقق من Logs في SendGrid/Twilio:
   - SendGrid: Activity → Event Webhook
   - Twilio: Monitor → Logs

### إذا وصل webhook لكن فشل:

1. تحقق من Secrets:
   - ✅ `ENABLE_BACKGROUND_WORKERS=true`
   - ✅ Twilio credentials (إذا كنت تستخدم WhatsApp)

2. تحقق من Object Storage:
   - ✅ Bucket متصل بالمشروع
   - ✅ المتغيرات صحيحة

3. راجع Production Logs لمعرفة الخطأ بالتفصيل

---

## 📞 **الدعم**

إذا واجهت مشاكل بعد تنفيذ كل الخطوات:

1. التقط screenshot من:
   - SendGrid webhook settings
   - Twilio webhook settings
   - Production logs (الخطأ)

2. أرسلها لي للمساعدة في استكشاف المشكلة

---

## 🎉 **ملخص سريع**

```bash
# 1. SendGrid
https://sabqorg.replit.app/api/email/webhook

# 2. Twilio WhatsApp
https://sabqorg.replit.app/api/whatsapp/webhook

# 3. Secrets (إضافة)
ENABLE_BACKGROUND_WORKERS=true
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=whatsapp:+1415...

# 4. Republish
اضغط Republish في Deployments
```

✅ بعد ذلك، النشر التلقائي سيعمل بنجاح!
