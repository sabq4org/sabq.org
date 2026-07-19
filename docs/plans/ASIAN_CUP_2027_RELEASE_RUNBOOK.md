# دليل إطلاق منصة كأس آسيا 2027

يتبع هذا الدليل ترتيب النشر الإلزامي: Backend ثم iOS وAndroid والويب. المرجع التنفيذي هو Umbrella Issue [#798](https://github.com/sabq4org/sabq.org/issues/798).

## 1. سلسلة الدمج

1. **Backend — #799:** توحيد بيانات البطولة، التغطية الحية، وواجهات توقعات الموبايل.
2. **iOS — #801 ثم #806 ثم #809:** الحساب والتوقعات والروابط والإشعارات، ثم 16 لغة، ثم متابعات المنتخبات والمباريات.
3. **Android — #808:** مركز البطولة الأصلي داخل `android-native`.
4. **Web — #804:** صفحات المباراة والمنتخب واللاعب والهدافين والشجرة والملاعب.
5. لا يدمج أي فرع منصة قبل نجاح Backend على Railway staging.

## 2. إعداد Railway

تُراجع الأسماء فقط؛ لا توضع القيم في Git:

- `APIFOOTBALL_KEY` لجداول وفرق ومباريات وهدافي البطولة (league 7، season 2027).
- `THESPORTS_USER` و`THESPORTS_SECRET` للأحداث والإحصاءات والتقييمات الحية.
- `THESPORTS_MQTT_ENABLED=true` للبث الفوري عند تفعيل اشتراك MQTT.
- `APPLE_ASIANCUP_BUNDLE_ID=com.sabq.asiancup` لقبول Apple identity tokens الخاصة بالتطبيق.
- مفاتيح APNs الحالية مع تعريف bundle الخاص بكأس آسيا لإشعارات الجهاز.
- متغيرات قاعدة البيانات والجلسات الحالية كما هي؛ لا يُنفّذ `db:push` لأن هذه الحزمة لا تضيف Schema.

بعد النشر، يجب أن تُظهر سجلات Railway نجاح تهيئة مزودي الرياضة وعدم ظهور `THESPORTS_USER / THESPORTS_SECRET غير مضبوطين`.

## 3. بوابة Backend

```bash
npm run check
npx vitest run tests/unit/asianCupNames.test.ts
node scripts/asian-cup-smoke.mjs
```

ويُعاد smoke على staging قبل الإنتاج:

```bash
ASIAN_CUP_API_ORIGIN=https://<staging-host> node scripts/asian-cup-smoke.mjs
```

اختبار الحساب اليدوي:

- Apple Sign-in يعيد Bearer token صالحًا لـ`/api/v1/members/profile`.
- قراءة/حفظ التوقع تعمل من iOS وAndroid بالحساب نفسه.
- متابعة منتخب أو مباراة تظهر في `/api/v1/sports/follows` وتُزال بنجاح.
- مباراة حية تعرض الحدث والإحصاءات من TheSports مع بقاء API-Football fallback متاحًا.

## 4. بوابة التطبيقات

### iOS

```bash
xcodebuild -project "asian-cup app ios/AsianCup.xcodeproj" \
  -scheme AsianCup -configuration Release \
  -destination "generic/platform=iOS" archive
```

- Deployment target يظل iOS 17.0.
- فحص Apple Sign-in، APNs، Universal Links، والتوقعات على جهاز فعلي.
- فحص اتجاه RTL في العربية والفارسية والأردية، وLTR في الإنجليزية وبقية اللغات.
- التأكد أن القواميس الـ16 تحتوي العدد نفسه من المفاتيح ولا تعرض fallback غير مقصود.

### Android

```bash
cd android-native
./gradlew :app:assembleDebug :app:testDebugUnitTest
```

- فتح كأس آسيا من الرئيسية ومن رابط `/asian-cup`.
- فتح روابط `/asian-cup/match/:id` و`/asian-cup/team/:id`.
- تجربة التوقع بحساب مسجل وخروج المستخدم إلى شاشة الدخول عند انتهاء الجلسة.

## 5. بوابة الويب

```bash
npm run check
npm run build:client
```

على Cloudflare preview تُفحص صفحات `/asian-cup` و`match` و`team` و`player` و`scorers` و`bracket` و`venues` على 390px و1440px، مع metadata وJSON-LD وروابط الرجوع.

## 6. المراقبة والإرجاع

- أول 60 دقيقة: راقب 5xx ووقت استجابة `/api/asian-cup/*` وأخطاء فك JSON وتسجيل التوقعات.
- أول 24 ساعة: راقب نجاح Apple Sign-in، تسجيل APNs، وعدد اشتراكات الفرق والمباريات.
- تراجع Backend: أعد نشر آخر Railway deployment سليم؛ لا توجد migration لعكسها.
- تراجع الويب: أعد توجيه Cloudflare Pages إلى آخر deployment سليم.
- تراجع الموبايل: أوقف الترويج في TestFlight/Play testing، وأبقِ endpoints متوافقة لأنها additive.

## 7. شرط الإقفال

لا تُغلق #798 حتى تصبح PRs الستة merged، وينجح smoke على الإنتاج، ويُرفع بناء iOS إلى TestFlight وبناء Android إلى مسار الاختبار، وتُراجع صفحات Cloudflare الإنتاجية.
