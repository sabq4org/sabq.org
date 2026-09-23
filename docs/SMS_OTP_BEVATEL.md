# رموز التحقق (OTP) الذاتية — Bevatel أساسًا وTwilio تراجعًا

**منذ 2026-08-25.** الرمز يُولَّد ويُتحقق منه داخل سبق؛ المزوّد مجرد موصل للرسالة.

## المكوّنات
| الملف | الدور |
|---|---|
| `server/services/otpService.ts` | توليد 6 أرقام، تخزين مهشّر (sha256+salt) في Redis (ذاكرة محليًا)، صلاحية 5 دقائق، 5 محاولات، 3 رسائل/15 دقيقة، فاصل 60 ثانية |
| `server/services/sms/bevatelProvider.ts` | `POST https://sms-api.bevatel.com/msgs/sms` بـ`Bearer BEVATEL_API_KEY`، اسم المرسل `BEVATEL_SENDER_ID` (افتراضيًا `SABQ News`)، الأرقام بلا `+` |
| `server/services/sms/twilioProvider.ts` | Twilio Messages API (لا Verify) — يلزم `TWILIO_MESSAGING_SERVICE_SID` أو `TWILIO_SMS_FROM` |
| `server/services/sms/smsRouter.ts` | الترتيب: Bevatel للأرقام السعودية (`SMS_BEVATEL_COUNTRY_CODES`)، وTwilio لغيرها وعند فشل Bevatel |

المستهلكون: `sendSMSOTP/verifySMSOTP` في `server/twilio.ts` (التحقق بخطوتين) و`varaSendOtp/varaVerifyOtp` في `server/services/varaPhoneOtp.ts` (دخول الجوال ويب + تطبيقات). كلاهما يعود لمسار **Twilio Verify القديم** تلقائيًا إن لم يكن أي موصل SMS مهيّأً — فلا انقطاع أثناء الانتقال.

## نص الرسالة
```
رمز التحقق من سبق: 123456
صالح 5 دقائق. لا تشاركه.
@sabq.org #123456
```
السطر الأخير يفعّل التعبئة التلقائية في iOS/Android (النطاق `sabq.org`).

القالب 68 وحدة UTF-16 للدخول وتوثيق الجوال و67 للتحقق بخطوتين (بادئته «تحقق سبق بخطوتين»). كلاهما يلائم رسالة Unicode واحدة بحد 70؛ الموصل يطلب `maxParts: 1` و`validity: 5`. وفق [توثيق Bevatel الرسمي](https://sms.bevatel.com/api-docs/index.html)، تجاوز `maxParts` يلغي الرسالة. لذلك يجب أن يمر اختبار طول جميع القوالب عند تعديل النص.

## التفعيل على Railway
1. أنشئ مفتاحًا من لوحة Bevatel → API Keys، وتحقق: `curl -H "Authorization: Bearer KEY" https://sms-api.bevatel.com/users/me`
2. اضبط `BEVATEL_API_KEY` في متغيرات خدمة API على Railway و`BEVATEL_SENDER_ID=SABQ News` (تم تأكيد الاسم عبر `GET /addresses/srcs` في 2026-09-13). إعداد التشغيل يتقدم على الافتراضي؛ تغيير الكود لا يصحح اسمًا مخالفًا محفوظًا في Railway.
3. لوحة التكاملات تعرض «بيفاتل» بفحص حي على `/users/me`.
4. للتراجع الفوري: احذف `BEVATEL_API_KEY` → يعود النظام لTwilio (أو Verify القديم).

## ملاحظة عن ردّ الإرسال
لا نرسل `msgClass` حتى يختار Bevatel نوع الحساب الافتراضي. بعد التفعيل أعاد المزود `6208 — Prefix not supported` لطلبات تحمل `transactional`؛ توجيه الدعم المرسل في 2026-09-13 طلب حذف هذا الاختيار ثم إعادة التجربة (Issue #1665). التعديل لا يثبت التسليم قبل اختبار حي، ولا يغيّر `secure` أو اسم المرسل أو صلاحية OTP.

Bevatel لا يوثّق شكل ردّ `POST /msgs/sms`؛ الموصل يقرأ `msgId`/`jobId`/`id` بمرونة ويعتبر أي 2xx نجاحًا.

هذا نجاح قبول طلب الإرسال فقط، ولا يثبت وصوله للهاتف. الاختبار الحي يحتاج رقمًا يحدده صاحبه للإرسال، ثم تأكيد وصوله أو تقرير تسليم مطابق. اختبار التحقق من الرمز عبر حساب إنتاج قد ينشئ جلسة أو يستكمل عضوية؛ يجب أن يكون ضمن اختبار مصرح به.

## التحقق قبل التفعيل — Issue #1663
- شغّل `npm run test:unit -- tests/unit/otpService.test.ts tests/unit/bevatelProvider.test.ts tests/unit/smsRouter.test.ts tests/unit/phoneAuth.test.ts`.
- المفاتيح تبقى خارج Git والواجهة والوثائق؛ لا تسجل نص الرسالة أو OTP في أدلة الاختبار.
- إعداد المفتاح واسم المرسل في الإنتاج يتطلب إذن تعديل أسرار التشغيل. لا تُفعّل الخدمة قبل نشر إصلاح طول الرسالة.
