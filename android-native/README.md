# سبق — تطبيق أندرويد الأصلي

تطبيق سبق الأصلي المبني بـ Kotlin وJetpack Compose. هذا هو مسار أندرويد النشط في المستودع، وقد استبدل غلاف Capacitor القديم في إصدارات Google Play بدءًا من 10.0.0.

## الحالة الحالية

- الإصدار المضبوط في `main`: **10.1.3** (`versionCode = 144`).
- نحو **50 شاشة Compose** تحت `feature/`، تشمل القراءة، البحث، الأقسام، الحساب، الولاء، الإشعارات، الصوت، وكؤوس العالم والخليج وآسيا.
- اتصال مباشر بـ `https://api.sabq.org/api/v1/*` عبر Retrofit ومصادقة Bearer.
- تسجيل أجهزة FCM واستقبال الإشعارات وفتح الوجهة داخل التطبيق.
- روابط عميقة لنطاقي `sabq.org` و`www.sabq.org`، إضافة إلى روابط البطولات.
- نظام تصميم وRTL وخط IBM Plex Sans Arabic مطابق لتطبيق iOS بقدر الإمكان.

> تطبيق iOS هو مرجع التصميم والسلوك. اقرأ الشاشة المقابلة في `ios/` قبل أي تغيير بصري في أندرويد.

## هوية التطبيق

هناك فرق مقصود بين حزمة كود Kotlin ومعرّف تطبيق Play:

| البند | القيمة |
|---|---|
| Kotlin namespace | `com.sabq.smart` |
| Play applicationId | `com.sabqorg.sabq` |
| Debug applicationId | `com.sabqorg.sabq.dev` |

معرّف `com.sabqorg.sabq` هو معرّف التطبيق المنشور في Play. لا تغيّره إلى `com.sabq.smart` اعتمادًا على إعدادات مجلد Capacitor القديم؛ تلك الإعدادات لا تمثل الحزمة المنشورة تاريخيًا.

## البنية المختصرة

```text
android-native/
├── app/src/main/kotlin/com/sabq/smart/
│   ├── data/          # Retrofit، DTOs، repositories، auth، FCM
│   ├── feature/       # الشاشات وViewModels حسب المجال
│   ├── nav/           # الرسم الملاحي والتعامل مع الروابط
│   └── ui/            # الثيم والمكونات المشتركة
├── app/src/main/res/  # الموارد والأيقونات والثيم
├── fastlane/          # بيانات متجر Play وسجل الإصدارات
└── gradle/            # version catalog وإعدادات البناء
```

## البناء محليًا

المتطلبات:

- JDK 17
- Android SDK 36
- Android Studio Ladybug (2024.2.1) أو أحدث

```bash
cd android-native
./gradlew :app:assembleDebug
./gradlew :app:installDebug
```

بناء الإصدار:

```bash
./gradlew :app:bundleRelease
```

توقيع الإصدار يقرأ القيم التالية من `local.properties` أو من متغيرات البيئة المكافئة، ولا يجوز حفظ الأسرار في Git:

```properties
release.storeFile=/absolute/path/to/release.keystore
release.storePassword=...
release.keyAlias=...
release.keyPassword=...
```

عند غياب مفاتيح الإصدار يُستخدم توقيع debug كحاجز أمان؛ سينجح البناء محليًا لكن Play سيرفض الملف، فلا تعتمد نجاح `bundleRelease` وحده كدليل على صحة التوقيع.

## الروابط والإشعارات

- `AndroidManifest.xml` يعلن App Links لـ `sabq.org` و`www.sabq.org`.
- يلزم وجود `/.well-known/assetlinks.json` على الموقع، ويجب أن يحتوي `com.sabqorg.sabq` وبصمة SHA-256 من **Play App Signing**.
- التطبيق يسجل توكن FCM عبر `/api/v1/devices/register` ويعالجه في `SabqMessagingService`.
- الإرسال من السيرفر يعتمد على ضبط `FCM_PROJECT_ID` و`FCM_PRIVATE_KEY` و`FCM_CLIENT_EMAIL` في Railway. وجود الكود لا يثبت أن متغيرات الإنتاج مضبوطة.

## بوابات الجودة قبل أي إصدار

1. `./gradlew :app:assembleDebug` من checkout نظيف.
2. `./gradlew :app:bundleRelease` مع مفاتيح الرفع الصحيحة.
3. تثبيت نسخة Internal Testing وفتح خبر من رابط ويب ومن إشعار FCM.
4. فحص RTL للشاشات المتغيرة مقابل iOS.
5. التأكد من أن كل مورد يستدعيه الكود متتبع في Git؛ لا تعتمد على ملفات محلية كانت مخفية بقواعد `.gitignore`.

ملف `.github/workflows/android-native-build.yml` يطبق بوابة `assembleDebug` تلقائيًا عند تغيير التطبيق أو ملف الـworkflow نفسه.

## ملاحظات حالية

- لا توجد حاليًا حزمة اختبارات `src/test` أو `src/androidTest` فعلية؛ إضافة smoke tests للمسارات الحرجة أولوية.
- لا تطوّر ميزات جديدة داخل `android/`؛ هو غلاف Capacitor تاريخي فقط وفق `AGENTS.md`.
- لا تستدعِ نقاط `/api/*` الخاصة بجلسة الويب من التطبيق؛ استخدم `/api/v1/*` وBearer دائمًا.
