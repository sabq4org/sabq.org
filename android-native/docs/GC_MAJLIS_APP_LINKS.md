# روابط مجالس خليجي 27 على Android

## حالة التحقق

أُضيفت مرشحات App Links إلى التطبيق لمسارات المجالس التالية:

- `https://sabq.org/gulf-cup/majlis?code=XXXX`
- `https://www.sabq.org/gulf-cup/majlis?id=<majlis-id>&fixture=<fixture-id>`
- `https://sabq.org/gulf-cup/majlis/<majlis-id>`
- `sabqgulfcup://majlis?...` و`gulfcup://majlis?...` كمسار احتياطي داخلي.

لا يجوز نشر `.well-known/assetlinks.json` ببصمة تخمينية. البصمة المطلوبة هي
**SHA-256 لشهادة App signing key** الخاصة بالحزمة `com.sabqorg.sabq` من:

`Google Play Console → Setup → App integrity → App signing key certificate`

محاولة `./gradlew :app:signingReport` في بيئة العمل الحالية لم تُنتج شهادة
الإصدار؛ إعداد الإصدار عاد إلى debug، وdebug keystore نفسه غير موجود. كما أن
keystore الرفع المحلي — إن توفر لاحقًا — قد لا يطابق شهادة Play App Signing،
ولذلك لا يُعد مصدرًا كافيًا للبصمة المنشورة.

## الملف المطلوب بعد الحصول على البصمة الرسمية

أنشئ `client/public/.well-known/assetlinks.json` بالقيمة التالية بعد استبدال
`<PLAY_APP_SIGNING_SHA256>` فقط:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.sabqorg.sabq",
      "sha256_cert_fingerprints": ["<PLAY_APP_SIGNING_SHA256>"]
    }
  }
]
```

وأضف إلى `client/public/_headers`:

```text
/.well-known/assetlinks.json
  Content-Type: application/json; charset=utf-8
  Cache-Control: public, max-age=300, must-revalidate
```

يجب أن يُخدَّم الملف مباشرةً بحالة `200` ومن دون redirect، ثم يُتحقق منه عبر
Google Digital Asset Links API وعلى جهاز إصدار مثبت من Google Play.
