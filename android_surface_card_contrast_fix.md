# توثيق إصلاح تباين بطاقات Android

## المشكلة

في تطبيق Android كانت ألوان `SurfaceCard` قريبة جداً من لون الخلفية العامة `SabqColors.background`، خصوصاً في الشاشات الطويلة مثل:

- Home
- Article Detail
- Explore
- Bookmarks
- Settings
- Loyalty
- DailyBrief
- Trending

النتيجة أن البطاقة لا تظهر كطبقة مستقلة، ويصعب على المستخدم التفريق بين سطح البطاقة والخلفية.

## سبب المشكلة

القيم كانت منقولة رقمياً من iOS بهدف تحقيق parity، لكن Compose يعرض الظلال والارتفاعات بشكل أخف من SwiftUI. لذلك المطابقة الرقمية وحدها لم تكن كافية بصرياً على Android.

## الملفات المعدلة

### 1. ألوان الثيم

`android-native/app/src/main/kotlin/com/sabq/smart/ui/theme/SabqColors.kt`

التعديل:

- جعل خلفية light mode أغمق قليلاً:
  - من `Color(0.95, 0.97, 0.99)`
  - إلى `Color(0.93, 0.945, 0.965)`
- إبقاء سطح البطاقة في light mode أبيضاً.
- رفع تباين dark mode:
  - الخلفية أصبحت أغمق.
  - السطح أصبح أعلى وأوضح.
  - الـ outline صار أوضح.
- تقوية قيم الظلال في light/dark لأن Compose كان يعرضها بخفوت.

### 2. مكوّن البطاقة المركزي

`android-native/app/src/main/kotlin/com/sabq/smart/ui/components/SurfaceCard.kt`

التعديل:

- رفع opacity الحد:
  - light mode: `0.72`
  - dark mode: `0.82`
- تعديل الارتفاع:
  - light mode: soft elevation = `10.dp`
  - dark mode: soft elevation = `6.dp`
  - rim elevation = `1.5.dp` في light و `2.dp` في dark
- استخدام `SabqTheme.colors.isDark` بدلاً من `isSystemInDarkTheme()` حتى يحترم وضع التطبيق الفعلي لو كان المستخدم اختار الوضع يدوياً.

## لماذا هذا الحل

الحل يحافظ على روح تصميم iOS، لكنه لا ينسخ أرقامه حرفياً حيث تكون النتيجة ضعيفة في Compose. تم تحسين Android بصرياً عبر ثلاث طبقات:

1. خلفية أغمق قليلاً.
2. سطح بطاقة أوضح.
3. حد وظل أخف من Material Card الثقيلة، لكن أوضح من السابق.

بهذا تصبح البطاقة مفهومة كطبقة مستقلة بدون جعل الواجهة ثقيلة أو بعيدة عن تصميم سبق.

## نطاق التأثير

التغيير مركزي، لذلك يؤثر على كل مكان يستخدم:

- `SabqTheme.colors.background`
- `SabqTheme.colors.surface`
- `SurfaceCard`

وهذا يغطي معظم الشاشات بدون تعديل كل شاشة يدوياً.

## التحقق

تمت محاولة بناء Android عبر:

```bash
./gradlew :app:assembleDebug
```

لكن البيئة الحالية لم تسمح بإكمال البناء بسبب قيود محلية:

- Java Runtime غير متاح عبر النظام.
- بعد استخدام JDK الخاص بـ Android Studio، منع الـ sandbox Gradle من استخدام ملفات cache خارج مساحة العمل.
- عند نقل Gradle cache إلى `/private/tmp`، منعت الشبكة تحميل Gradle.
- عند استخدام Gradle الموجود محلياً، منع الـ sandbox فتح socket للـ Gradle daemon.

لذلك لم يكتمل التحقق الآلي داخل هذه البيئة. التعديل نفسه محصور في ملفين، ولا يغيّر API أو منطق الشاشات.

## اختبار بصري مقترح

بعد البناء محلياً من Android Studio:

1. افتح Home في light mode.
2. تأكد أن البطاقة البيضاء تظهر بوضوح فوق الخلفية.
3. افتح Article Detail وSettings وBookmarks.
4. فعّل dark mode وتأكد أن السطح أعلى من الخلفية وليس مدموجاً معها.
5. يفضل الاختبار على جهاز فعلي لأن rendering الظلال يختلف عن المحاكي.

## القرار

اعتماد Android-specific tuning لطبقات الخلفية والسطح والظل، مع الحفاظ على هوية iOS العامة. المطابقة المطلوبة هنا بصرية وسلوكية، وليست نسخاً رقمياً لقيم الألوان عندما ينتج عنها ضعف في التباين على Android.
