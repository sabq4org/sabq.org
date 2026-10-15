# VARA Android Native

تطبيق Android المستقل لـ«سبق الرياضي»، مطابق وظيفياً لتطبيق iOS في `sports app ios/SabqSports`، ولا يستبدل تطبيق سبق العام في `android-native/app`.

## البناء

```bash
cd android-native
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :vara:assembleDebug
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :vara:testDebugUnitTest :vara:lintDebug
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :vara:assembleRelease :vara:bundleRelease
```

- الحزمة: `com.sabq.sports`، وdebug: `com.sabq.sports.dev`.
- الحد الأدنى: Android API 26، والهدف/الترجمة: API 36.
- **التوقيع (منذ 2026-07-27):** release يوقَّع بمفتاح رفع VARA مستقل تمامًا عن تطبيق سبق الرئيسي. القيم تُقرأ من `android-native/local.properties` (مفاتيح `vara.storeFile/storePassword/keyAlias/keyPassword` — gitignored، والمخزن خارج المستودع في `~/sabq-secrets/`) أو من متغيرات بيئة `VARA_*`. غيابها = سقوط آمن لمفتاح debug (بناء محلي فقط، يرفضه المتجر).
- **FCM مفعّل:** مشروع Firebase `sabq-vara` بالحزمتين وبصمات SHA؛ `google-services.json` في `vara/` (غير ملتزم — أضِفه كسرّ في CI). البلجن يُطبَّق شرطيًا عند وجود الملف؛ بدونه بناء أخضر بتدهور آمن.
- التحديث الحي: استطلاع متكيف بالمقدمة فقط (لا SSE) + دقيقة مباراة ذاتية العدّ من `clockStartEpoch`. كل التواريخ بتوقيت الرياض وأرقام لاتينية (`VaraFormat`).
- **اقتران موارد مع تطبيق سبق (فخ بناء):** `res.srcDirs` يدمج كامل `../app/src/main/res` (للخطوط وأيقونة الإشعار). أي مورد جديد في تطبيق سبق يشير إلى مكتبة لا تعتمدها VARA يكسر ربط موارد `:vara` — حدث مع ويدجت Glance (`sabq_news_widget_info.xml`) وعولج بـstub في `vara/src/main/res/layout/glance_default_loading_layout.xml`. عند إضافة موارد كهذه في `app` تحقق من بناء `:vara` أيضًا.
- **الأيقونة:** مولّدة من أيقونة iOS الأصلية (`AppIcon.png` 1024). أيقونة Play عالية الدقة: `src/main/ic_vara_playstore.png` (512×512). المشغّل التكيفي: طبقات `ic_vara_adaptive_fg` بكل الكثافات فوق `@color/vara_icon_background` + طبقة monochrome لأيقونات Android 13 المُثيمة. عند تغيير أيقونة iOS أعد التوليد من المصدر نفسه.

## العقود

- البيانات الرياضية العامة: `https://api.sabq.org/api/sports/*` و`/api/world-cup/*` بلا Authorization.
- العضوية والتوقعات والأجهزة: `https://api.sabq.org/api/v1/*` مع Bearer محفوظ بـAndroid Keystore.
- لا يرفق العميل Bearer إطلاقاً بالمسارات الرياضية العامة.

راجع [PARITY.md](PARITY.md) لخريطة الشاشات وقيم التصميم والتحقق.
