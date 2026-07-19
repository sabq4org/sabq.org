# تشغيل النشرة المجدولة وتسليم البريد

> آخر تحديث: 2026-07-19

## الحالة التشغيلية الحالية

النشرة متوقفة حتى إشعار آخر. يجب أن تبقى القيمتان الآتيتان `false` في الإنتاج:

```env
ENABLE_NEWSLETTER_SCHEDULER=false
ENABLE_NEWSLETTER_DELIVERY_WORKER=false
```

الأولى تمنع إنشاء نشرة مجدولة جديدة، والثانية تمنع إرسال أي مهمة موجودة مسبقًا في الطابور. لا يكفي إيقاف واحدة منهما.

## المعمارية

```text
newsletter-worker
  ├─ scheduler: ينشئ النشرة ويسجل delivery job فقط
  └─ delivery worker: يسحب المستلمين على دفعات ويثبت النتيجة بعد كل مستلم

API / web process
  └─ لا يشغل scheduler ولا يرسل البريد
```

الجدول `newsletter_delivery_jobs` يحفظ حالة المهمة والإجماليات، والجدول
`newsletter_delivery_recipients` يحفظ checkpoint لكل اشتراك. عند restart أو deploy، لا يعاد إرسال المستلمين ذوي الحالة `sent`.

## إعداد Railway Worker

بعد تطبيق schema ونشر الكود:

1. أنشئ خدمة Railway مستقلة من المستودع نفسه، واضبط Config File على
   `/railway.newsletter-worker.json` حتى لا ترث أمر تشغيل الـAPI.
2. الملف يشغّل `node dist/newsletter-worker.js` ويستخدم health path `/health`.
3. انسخ متغيرات قاعدة البيانات والبريد والذكاء الاصطناعي المطلوبة من خدمة API دون كشف قيمها في السجلات.
4. اترك علمي الجدولة والتسليم `false` حتى قرار إعادة التشغيل.
5. أبقِ `RUN_NEWSLETTER_SCHEDULER_IN_WEB=false` في خدمة API.

القيم الافتراضية الآمنة:

```env
RUN_NEWSLETTER_SCHEDULER_IN_WEB=false
NEWSLETTER_DELIVERY_BATCH_SIZE=40
NEWSLETTER_DELIVERY_CONCURRENCY=3
```

## ترتيب إعادة التشغيل لاحقًا

1. تأكد أن الطابور لا يحتوي مهمة قديمة لا يراد إرسالها.
2. فعّل `ENABLE_NEWSLETTER_DELIVERY_WORKER=true` أولًا وراقب `/health` والسجلات.
3. شغّل مهمة اختبار صغيرة يدويًا وتحقق من counts في جدولي الطابور.
4. بعد نجاح الاختبار، فعّل `ENABLE_NEWSLETTER_SCHEDULER=true`.

للتوقف الطارئ: أعد العلمين إلى `false`. المهام غير المكتملة تبقى محفوظة ولا تبدأ من الصفر عند الاستئناف.

## قاعدة البيانات

تغيير schema إضافي فقط. لا تشغّل `npm run db:push` مباشرة على production؛ استخدم
`./push-to-production.sh` حسب `docs/DEPLOYMENT_STATUS.md` بعد مراجعة SQL المقترح.

## ما نراقبه

- health لخدمتي API وnewsletter-worker.
- `sent_count`, `failed_count`, `skipped_count` وحالة أقدم job.
- ظهور تحذير OpenAI quota واحد فقط لكل job، ثم استخدام البدائل المحلية.
- عدم وجود سطر نجاح لكل بريد وعدم ظهور عناوين المشتركين في السجلات.
