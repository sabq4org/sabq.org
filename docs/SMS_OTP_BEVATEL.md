# رموز التحقق (OTP) الذاتية — Bevatel أساسًا وTwilio تراجعًا

**منذ 2026-08-25.** الرمز يُولَّد ويُتحقق منه داخل سبق؛ المزوّد مجرد موصل للرسالة.

## المكوّنات
| الملف | الدور |
|---|---|
| `server/services/otpService.ts` | توليد 6 أرقام، تخزين مهشّر (sha256+salt) في Redis (ذاكرة محليًا)، صلاحية 5 دقائق، 5 محاولات، 3 رسائل/15 دقيقة، فاصل 60 ثانية |
| `server/services/sms/bevatelProvider.ts` | `POST https://sms-api.bevatel.com/msgs/sms` بـ`Bearer BEVATEL_API_KEY`، اسم المرسل `BEVATEL_SENDER_ID` (SABQ)، الأرقام بلا `+` |
| `server/services/sms/twilioProvider.ts` | Twilio Messages API (لا Verify) — يلزم `TWILIO_MESSAGING_SERVICE_SID` أو `TWILIO_SMS_FROM` |
| `server/services/sms/smsRouter.ts` | الترتيب: Bevatel للأرقام السعودية (`SMS_BEVATEL_COUNTRY_CODES`)، وTwilio لغيرها وعند فشل Bevatel |

المستهلكون: `sendSMSOTP/verifySMSOTP` في `server/twilio.ts` (التحقق بخطوتين) و`varaSendOtp/varaVerifyOtp` في `server/services/varaPhoneOtp.ts` (دخول الجوال ويب + تطبيقات). كلاهما يعود لمسار **Twilio Verify القديم** تلقائيًا إن لم يكن أي موصل SMS مهيّأً — فلا انقطاع أثناء الانتقال.

## نص الرسالة
```
رمز التحقق من سبق: 123456
صالح لمدة 5 دقائق، ولا تشاركه مع أحد.

@sabq.org #123456
```
السطر الأخير يفعّل التعبئة التلقائية في iOS/Android (النطاق `sabq.org`).

## التفعيل على Railway
1. أنشئ مفتاحًا من لوحة Bevatel → API Keys، وتحقق: `curl -H "Authorization: Bearer KEY" https://sms-api.bevatel.com/users/me`
2. `BEVATEL_API_KEY=...` و`BEVATEL_SENDER_ID=SABQ` (بعد اعتماد الاسم؛ `GET /addresses/srcs` يعرض الأسماء المعتمدة).
3. لوحة التكاملات تعرض «بيفاتل» بفحص حي على `/users/me`.
4. للتراجع الفوري: احذف `BEVATEL_API_KEY` → يعود النظام لTwilio (أو Verify القديم).

## ملاحظة عن ردّ الإرسال
Bevatel لا يوثّق شكل ردّ `POST /msgs/sms`؛ الموصل يقرأ `msgId`/`jobId`/`id` بمرونة ويعتبر أي 2xx نجاحًا.
