# التحقق من إصلاح قياس التطبيقات

التاريخ: 2026-09-13 · الفرع `codex/native-firebase-analytics` · Issue #1652 · المتابعة #1655.

**الإصلاح البرمجي مبني ومختبر، والربط الإداري مع Firebase/GA4 مؤكد.** استقبال الأحداث في GA4 ما زال غير مثبت؛ لا اعتماد لإصدار المتاجر قبل إكمال DebugView واختبارات الأجهزة.

| الفحص | النتيجة | حدود الدليل |
|---|---|---|
| iOS Debug build + Swift Testing | ناجح؛ 12 اختبارًا في SabqAnalyticsCoreTests | يشمل الموافقة/Debug، الخصوصية، مالك الشاشة، وقت القراءة وعمق الجسم؛ لا يثبت التسجيل لدى Google |
| Android testDebugUnitTest + assembleDebug | ناجح؛ 26 اختبارًا، صفر فشل | منها 9 لاختبارات سياسة القياس والقراءة |
| فحص إعدادات Firebase | 6 اختبارات ناجحة | الهوية/المنصة/المشروع، رفض OAuth-only، ومفاتيح default deny |
| حاجز Android Release | preReleaseBuild يتوقف في validateReleaseFirebase عند غياب config | منع الإصدار غير المهيأ مقصود؛ لم يُنتج إصدار متجر |
| iOS config verifier | رفض ملف OAuth-only السابق؛ نجح مع ملف Firebase الرسمي المدمج | لم يُنفذ signed archive أو TestFlight |
| فحص أسرار MP بالحزم | صفر تطابق للسرّين القديمين في حزمة iOS وAPK Debug | لم تُلغَ أسرار النسخ القديمة في Google |
| iOS UI على محاكي مستقل | الرفض/القبول/السحب، فتح خبر، المشاركة وإلغاؤها، الرجوع، نتائج البحث ناجحة | اختبارات الموافقة الأولى سبقت إعداد Firebase؛ أُعيد تشغيل iOS بالإعداد الحقيقي لاحقًا، ولا توجد شهادة بتسجيل الأحداث |
| Android UI | الرفض/القبول/السحب، إعادة التشغيل دون إعادة طلب الموافقة، فتح chooser وإلغاؤه ناجحة | تحقق مقابل حزمة QA .dev؛ آخر قيمة محفوظة DENIED. فحص دلالة الأحداث لدى Google ما زال معلقًا |
| تحقق نظام المشروع | systems-inventory وgit diff --check ناجحان | لا تغييرات API/Schema أو موقع الويب |

## حالة Firebase وGA4

| العنصر | النتيجة | الدليل والحد |
|---|---|---|
| مشروع Firebase | مؤكد: `sabq-ga3-ga4`، رقم `534820013195` | حساب الوصول `sabq4u@gmail.com`، والربط الإداري مع GA4 property `369420309` |
| تطبيق iOS | مؤكد: `com.sabq.sabqorg`، App ID `1:534820013195:ios:d516ed2e146f209abdc08e` | ملف `GoogleService-Info.plist` مدمج مع الحفاظ على OAuth؛ البناء السابق ناجح |
| تطبيق Android الإنتاجي | مؤكد في Firebase: `com.sabqorg.sabq`، App ID `1:534820013195:android:22935774c3725e53bdc08e` | إعداد Release غير مدمج لأن مشروع FCM الإنتاجي مختلف؛ حاجز Release يبقى فعالًا |
| تطبيق Android QA | مؤكد: `com.sabqorg.sabq.dev`، App ID `1:534820013195:android:5287c6c9eacf65d0bdc08e` | `src/debug/google-services.json` مُزوّد محليًا ومستبعد من Git؛ البناء الصريح نجح، مع 26 اختبارًا دون فشل |
| استقبال GA4 | غير متحقق | DebugView عند 10:40 بتوقيت الرياض أظهر 0 أجهزة و0 أحداث؛ لا يُستنتج التسجيل من config أو build فقط |

تدفقات التطبيقات الأصلية المسجلة في GA4 property `369420309`: iOS `15768236568`، Android الإنتاجي `15768279887`، وAndroid QA `15768280630`. التسجيل والربط الإداريان لا يثبتان استقبال الأحداث. قيمة `IS_ANALYTICS_ENABLED=false` موجودة في الملف الرسمي؛ لم يُثبت أنها سبب غياب الأحداث، ولم تُغيّر بالتخمين.

ظهرت ANR على محاكي أندرويد عند 10:13:03 قبل اكتمال إعادة التشغيل. أُغلق حوار النظام القديم وأُعيد تشغيل حزمة QA؛ استجابت الواجهة وأُكملت مسارات الموافقة والمشاركة، ولم يتغير وقت آخر ANR. السبب الجذري للحادثة القديمة غير مثبت؛ لا تُنسب إلى Firebase ولا يُدّعى إصلاح عطل من دون دليل.

أصبح حدث فتح الإشعار اليدوي `push_open`؛ `notification_open` محجوز للـSDK. اختبارات المنصتين ترفض الاسم المحجوز في واجهة الإرسال اليدوي، ويجب مراجعة التقارير/الحدث الرئيسي بالاسم الصحيح عند اكتمال إثبات الاستقبال.

## ما يلزم لإتمام التحقق التشغيلي

تم حل عائق الوصول وتسجيل التطبيقات وربط المشروع بالخاصية. المتبقي هو تشغيل نسخة QA بتهيئة Firebase، منح الموافقة، تفعيل خيارات Firebase DebugView المطلوبة، ثم تنفيذ المسارات والتحقق من ظهورها في تدفق التطبيق الصحيح. يجب حل اختلاف مشروع FCM قبل إعداد Release النهائي.

حسابات الاختبار والإشعارات الباردة/الدافئة، offline/retry، والأجهزة الفعلية وملفات المتاجر لم تُختبر. واجه اختبار iOS unsigned خطأ Keychain `-34018`؛ نجح بناء المحاكي البديل ولم يتكرر الخطأ أثناء التشغيل. لا ادعاء بأن النسخة المحلية تطابق حزم App Store/Play المنشورة، ولا يوجد نشر للمتاجر ضمن هذا العمل.

## أدلة محلية لهذه الجولة

- `/tmp/sabq-native-analytics-ios-configured.log` و`/tmp/sabq-native-analytics-ios-signed.log` للبناء والاختبار بعد إعداد Firebase.
- `/tmp/sabq-native-analytics-ios-final4.log` وملف xcresult تحت `/tmp/sabq-native-analytics-derived/Logs/Test/`.
- `/tmp/sabq-native-analytics-android-final4.log` وملفات JUnit داخل `android-native/app/build/test-results/testDebugUnitTest/`.
- `/tmp/sabq-native-analytics-release-guard.log`.
- `/tmp/sabq-native-secret-scan.json`؛ يحوي الأعداد فقط دون الأسرار.
- `/tmp/sabq-ios-consent-final.json` ولقطة `/tmp/sabq-ios-consent-denied-home.png`؛ بيانات محاكي الاختبار فقط.

ملفات `/tmp` مؤقتة وليست مرفقات دائمة في Git. عقد الأحداث وخطوات القبول المستدامة في [MOBILE_ANALYTICS.md](MOBILE_ANALYTICS.md).
