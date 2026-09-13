# إعداد قياس تطبيقَي سبق الأصليين

> العمل: [Issue #1652](https://github.com/sabq4org/sabq.org/issues/1652) · المتابعة التشغيلية: [#1655](https://github.com/sabq4org/sabq.org/issues/1655) · العقد: [mobile-analytics](../systems/mobile-analytics/SYSTEM.md)

## القرار
Firebase Analytics هو مرسل أحداث النسخ الجديدة. لا تضمين لـMeasurement Protocol secret أو توليد client_id/session_id في التطبيق. تحتفظ GA4 بالتدفقات القديمة لتاريخ النسخ السابقة؛ لا تتغير تلقائيًا إلى App streams ولا يُنقل تاريخها بمجرد ربط SDK.

## الوضع التشغيلي
تم التحقق من حساب الوصول `sabq4u@gmail.com` ومن مشروع Firebase `sabq-ga3-ga4` (رقم المشروع `534820013195`) وربطه بملكية GA4 الحالية `369420309`. هذا يؤكد هوية الإعداد والربط الإداري، لكنه لا يثبت استقبال الأحداث في GA4.

| التطبيق | هوية الإنتاج | تدفق MP القديم للتاريخ فقط |
|---|---|---|
| iOS | `com.sabq.sabqorg` | Web `14926276203` / `G-26QJ46Q70B` |
| Android | `com.sabqorg.sabq` | Web `14926555103` / `G-XPS0W1N9CQ` |
| Android debug | `com.sabqorg.sabq.dev` | لا إعادة استخدام إعداد release للتجميع افتراضيًا |

| تطبيق Firebase | App ID | حالة الإعداد في المستودع |
|---|---|---|
| iOS `com.sabq.sabqorg` | `1:534820013195:ios:d516ed2e146f209abdc08e` | `GoogleService-Info.plist` مدمج مع الحفاظ على إعدادات Google Sign-In الحالية |
| Android `com.sabqorg.sabq` | `1:534820013195:android:22935774c3725e53bdc08e` | إعداد Release غير موجود عمدًا حتى فصل مشروع FCM الإنتاجي المختلف |
| Android QA `com.sabqorg.sabq.dev` | `1:534820013195:android:5287c6c9eacf65d0bdc08e` | `src/debug/google-services.json` مُزوّد محليًا للاختبار ومستبعد من Git |

تدفقات التطبيقات الأصلية المسجلة في GA4 property `369420309` هي: iOS `15768236568`، Android الإنتاجي `15768279887`، وAndroid QA `15768280630`. هذه أرقام تسجيل وربط فقط، ولا تُثبت استقبال الأحداث أو ظهورها في DebugView.

## إعداد Firebase الصحيح
1. استخدم مشروع سبق `sabq-ga3-ga4` المرتبط بملكية GA4 `369420309` بعد التحقق من الملكية والصلاحيات.
2. سجّل كل هوية أصلية بنوعها الصحيح: iOS وAndroid. لا تنشئ Web stream باسم تطبيق.
3. نزّل الإعدادات من المشروع نفسه. ملف iOS المدمج يحافظ على `CLIENT_ID` و`REVERSED_CLIENT_ID` وتهيئة Google Sign-In الحالية.
4. زوّد `android-native/app/src/debug/google-services.json` محليًا بإعداد Android QA المطابق للـsuffix للاختبار. الملف مستبعد من Git؛ CI الافتراضي يبني Debug دون جمع. لا تستعر ملف VARA ولا تستخدم Application ID وهميًا. لا تُدخل إعداد Android Release قبل حل اختلاف مشروع FCM الإنتاجي.
5. افحص كل config دون طباعة المفاتيح:

```bash
python3 scripts/verify-mobile-firebase-config.py --platform ios --config 'sabq app ios/sabq/GoogleService-Info.plist' --identity com.sabq.sabqorg --expected-project sabq-ga3-ga4
python3 scripts/verify-mobile-firebase-config.py --platform android --config android-native/app/google-services.json --identity com.sabqorg.sabq --expected-project sabq-ga3-ga4
```

استُخدم `sabq-ga3-ga4` كمعرّف المشروع المثبت. الفحص يتحقق من المنصة وهوية التطبيق ورقم المشروع ووجود الحقول المطلوبة؛ لا يثبت وحده الربط داخل GA4 أو صحة صلاحيات Google API key، ولا يثبت تسجيل الأحداث.

## الموافقة والخصوصية
- جمع Analytics متوقف قبل تهيئة SDK حتى اختيار المستخدم السماح؛ الرفض والسحب متاحان من الإعدادات ولا يمنعان قراءة الأخبار.
- إشارات الإعلانات تبقى مرفوضة؛ هذه الموافقة لا تمنح إذن IDFA أو تخصيص إعلانات.
- لا تُرسل أحداث سبقت الموافقة بأثر رجعي. user_id الداخلي لا يطبق إلا عندما يسمح جمع Analytics، ويُمسح من SDK عند الخروج أو الرفض.
- النصوص لا توصف بأنها «مجهّلة» مع استخدام معرف عضو؛ المعلمات محددة ومفلترة، وبيانات الإدارة والحساب الحساسة مستبعدة.
- الاختبارات معطلة عن الجمع افتراضيًا. في iOS لا يُهيأ Firebase في Debug إلا بوسيط التشغيل `-SabqAnalyticsDebug`. في Android يبقى SDK معطلًا في حزمة Debug افتراضيًا، ويستلزم بناؤها للاختبار `-PanalyticsDebugEnabled=true`. موافقة المستخدم لازمة أيضًا في الحالتين. إظهار DebugView يحتاج خيارات Firebase التشخيصية المعتادة؛ راجع المشروع والتدفق قبل الاختبار.

## معاني الأحداث
| الحدث | المعنى |
|---|---|
| screen_view | دخول شاشة عامة جديدة بمالك تتبع واحد |
| login | نجاح المصادقة، وليس الضغط على زر المزود |
| sign_up | نجاح إنشاء حساب؛ method يحدد الوسيلة |
| search | استجابة بحث ناجحة مطابقة للاستعلام الحالي بعد التنقية |
| share_intent | فتح نافذة المشاركة |
| share | stage=completed على iOS بعد completion، أو destination_selected على Android؛ اختيار وجهة لا يثبت اكتمال نشر خارجي |
| bookmark_toggle | نجاح تغيير الحفظ المحلي، بما فيه وضع offline؛ لا يعني تأكيد مزامنة الخادم |
| article_like | حالة الإعجاب من استجابة الخادم الناجحة؛ لا حدث عند الفشل أو التراجع |
| push_open | فتح إشعار حقيقي، لا رابط مباشر |
| deep_link_open | رابط مباشر؛ kind/source ومعرف محتوى آمن فقط |
| scroll_depth | عبور25/50/75/90 من المحتوى مرة لكل حد في الزيارة |
| reading_time | قراءة foreground بالثواني؛ ليس engagement_time_msec الخاص بالـSDK |

عمق القراءة يصف ظهور المحتوى في الشاشة ولا يثبت قراءة المستخدم له. iOS يستخدم المسافة داخل جسم المقال؛ Android يستخدم نسبة مقاطع الجسم مع الجزء المرئي من المقطع الأخير بسبب العرض الكسول. كلاهما يستبعد التعليقات والتذييل، لكن نسبة العمق ليست مقياسًا متطابقًا بالبكسل بين المنصتين.

حدث `notification_open` محجوز لدى Firebase ولا يُرسل عبر `logEvent` يدويًا؛ الاسم المعتمد لقياس فتح إشعارات سبق هو `push_open`. قد ينشئ FCM الحدث التلقائي المحجوز لحملاته؛ لا تُجمع أعداده مع `push_open` باعتبارهما فتحين منفصلين. راجع إعداد الحدث الرئيسي والتقارير للاسم الجديد عند إتمام ربط GA4. [مرجع Firebase الرسمي](https://firebase.google.com/docs/reference/kotlin/com/google/firebase/analytics/FirebaseAnalytics.Event).

## خطة انتقال السر القديم
1. أثبت استقبال SDK في تدفقات التطبيقات الأصلية على نسخ اختبار، ثم حضّر الإصدارين للمراجعة.
2. امسح سر MP من النسخ الجديدة وافحص الحزم النهائية للتأكد من عدم وجوده. لا تشغّل MP وSDK لنفس الحدث في النسخة الجديدة.
3. قد تظل نسخ قديمة تستخدم السر؛ قرار إلغائه/تدويره يوازن منع تزوير القياس مقابل توقف قياس تلك النسخ. الإلغاء لا يعطل قراءة الأخبار لكنه يقطع مصدر القياس القديم.
4. لا تلغِ السر تلقائيًا أثناء التحضير، ولا تحذف تدفقات التاريخ أو تغير FCM/OAuth/إعلانات GTM.

## قبول الإصدار
- اختبارات وحدة للحالة والخصوصية والقراءة، وبناء Android وiOS وحاجز Release عند فقد config.
- جلسات جديدة: رفض/قبول/سحب، خروج ودخول، انتقال شاشة ورجوع، خلفية واستئناف، مشاركة وإلغاء، بحث فاشل/ملغى/ناجح، push بارد ودافئ ورابط مباشر.
- حساب اختبار مصرح لتجارب التسجيل والمصادقة؛ لا إنشاء حسابات حقيقية أو إرسال إشعارات للمستخدمين للاختبار.
- قياس متوقع واحد لكل حدث، في DebugView للتدفق الصحيح، ثم تقارير ما بعد المعالجة. network/SDK logs وحدهما لا يثبتان التسجيل.
- App Store وGoogle Play وبيانات الخصوصية يحتاجان مراجعة الإصدار النهائي؛ نجاح المحاكي لا يعني الموافقة على النشر.
- DebugView ما زال يحتاج تحققًا فعليًا: آخر فحص أظهر `0` جهازًا و`0` حدثًا في GA4 حتى 10:40 بتوقيت الرياض. لا تعتمد على وجود config أو نجاح البناء باعتباره إثبات استقبال.

## مراجع Google
- https://firebase.google.com/docs/analytics/ios/get-started
- https://firebase.google.com/docs/analytics/android/get-started
- https://firebase.google.com/docs/analytics/screenviews
- https://firebase.google.com/docs/analytics/android/configure-data-collection
- https://developers.google.com/tag-platform/security/guides/app-consent
