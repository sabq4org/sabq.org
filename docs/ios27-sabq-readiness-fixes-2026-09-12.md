# سبق iOS — تنفيذ ملاحظات جاهزية iOS 27 (12 سبتمبر 2026)

ملحق تنفيذي لتقريرَي التدقيق (11 سبتمبر) والتحقق على Xcode 27 RC (12 سبتمبر) في
`~/Documents/Codex/2026-09-1{1,2}/`. هذا الملف يسجّل ما نُفّذ في الكود، وكيف تحقّقنا
منه، وما بقي مشروطًا بجهاز حقيقي أو بقرار المالك.

## ما نُفّذ

| البند | الإصلاح | الملفات |
|---|---|---|
| **F01 — تغيير حجم/نوع الخط لا يصل إلى جسم المقال (P1)** | مفتاح الكاش في جسر `UITextView` صار `Equatable` صريحًا يضم النص + الحجم + الوزن + الخط + التباعد + اللون المحلول للمظهر + فئة Dynamic Type. البناء الفعلي للنص المنسّق انتقل إلى داخل الجسر فلا يُعاد في كل إعادة رسم أثناء التمرير (كان يُبنى في كل tick ثم يُهمل). | `Components/JustifiedText.swift`, `Components/ArticleContentView.swift` |
| **F02 — Dynamic Type في جسور UIKit (P2)** | حجم القارئ يمرّ عبر `UIFontMetrics(.body)` كما تتدرّج خطوط `Font.custom` في بقية الشاشة، وعناوين البطاقات (`SabqRTLText`) تُقاس بالطريقة نفسها. لا تكبير مضاعف لأن `adjustsFontForContentSizeCategory` يبقى مطفأً. | `JustifiedText.swift`, `Components/SabqRTL.swift` |
| **F03 — صوت الخلفية والتحكم من القفل (P1)** | `UIBackgroundModes` (`audio` + `remote-notification`) نُقل إلى `Info.plist` الصريح — مفتاح `INFOPLIST_KEY_UIBackgroundModes` في إعدادات المشروع لم يكن يصل إلى الحزمة أصلًا (أي إن silent push كان بلا إعلان أيضًا). مشغّل مشترك جديد `SabqAudioPlayer` يغذّي Now Playing ويستقبل أوامر القفل/السماعة/CarPlay ويعالج المقاطعات وفصل السماعة ونهاية المقطع؛ الشاشات الثلاث (الخبر، الرأي، النشرات) تستخدمه بدل `AVPlayer` محلي. | `Info.plist`, `project.pbxproj`, `Services/SabqAudioPlayer.swift`, `Screens/ArticleDetailView.swift`, `Screens/OpinionDetailView.swift`, `Screens/AudioNewslettersView.swift` |
| **F06 — تقادم النشاط الحي (P2)** | `context.isStale` يُخفي النبض ويجمّد الساعة الذاتية ويعرض «بانتظار التحديث» مع آخر دقيقة معروفة، على شاشة القفل والجزيرة. | `SabqWidgets/LiveMatchLiveActivity.swift` |
| **F10 — الإفصاح مقابل التحليلات (P1 قبل الرفع)** | البيان يعلن الآن `UserID` (مرتبط، تحليلات) ويضع Product Interaction وPerformance Data كمرتبطين لأن الأحداث تحمل `user_id` عند تسجيل الدخول. **يلزم مطابقة App Store Connect يدويًا.** | `PrivacyInfo.xcprivacy` |
| **F11 — ارتفاع الكاروسيل من الحاوية (P2)** | العرض يُقاس بـ`onGeometryChange` من الحاوية بدل `UIScreen`، وميزانية النص `@ScaledMetric`. | `Screens/HomeFeedView.swift` |
| **F12 — تحذيرات التزامن (P2)** | نماذج سبق بلس `nonisolated`؛ `hasSession` صارت مرآة خيطية-آمنة (`OSAllocatedUnfairLock`) تُقرأ من الواجهات بلا عبور actor. | `Models/SabqPlusModels.swift`, `Services/APIClient.swift`, `Stores/AuthStore.swift` |
| **F13 — اختبارات** | 12 اختبارًا جديدًا لمفتاح الكاش ومقياس Dynamic Type ومفتاح اللون. | `sabqTests/JustifiedTextCacheTests.swift` |
| **أرقام الإصدار** | 10.2.3 → **10.3.0**، البناء 2026081502 → **2026091201** (التطبيق والامتداد). تحقّق من App Store Connect/Xcode Cloud قبل الرفع. | `project.pbxproj` |

سياسة جلسة الصوت الجديدة: التفعيل عند أول تشغيل، والإبقاء عليها أثناء الإيقاف
المؤقت (كي تبقى أزرار القفل)، وتسليمها بـ`notifyOthersOnDeactivation` عند الإيقاف
النهائي أو نهاية المقطع أو مغادرة الشاشة. الفرق عن السابق: الإيقاف المؤقت لم يعد
يعيد الصوت لـCarPlay/Spotify فورًا؛ الإيقاف النهائي ونهاية المقطع يفعلان.

## التحقق (Xcode 27.0 RC 27A266a، محاكي iPhone 18 Pro / iOS 27.0)

- Release على SDK 27: **BUILD SUCCEEDED، صفر تحذيرات مصدر** (كانت 6).
- الاختبارات الوحدوية: **47 ناجحة في 6 مجموعات** (كانت 35 في 5).
- الحزمة الناتجة: `UIBackgroundModes = [audio, remote-notification]`، الإصدار 10.3.0/2026091201 في التطبيق والامتداد، `NSSupportsLiveActivities` وأوصاف HealthKit موجودة.
- داخل المقال: سحب حجم الخط 17 → 22 غيّر الجسم فورًا مع بقاء bold والروابط؛ رفع Dynamic Type إلى XXXL كبّر الفقرات (لقطات في مجلد التقرير `implementation/`).
- الصوت: زر «استماع» تحوّل إلى «إيقاف» من حالة المشغّل، وبقيت حالة التشغيل بعد قفل المحاكي وفتحه بعد نحو دقيقة.

## ما لم يُثبت هنا ويلزمه جهاز حقيقي أو قرار

1. **أزرار شاشة القفل وCarPlay** — محاكي iOS لا يعرض Now Playing في القفل ولا مركز التحكم؛ الاختبار على جهاز: قفل، مكالمة واردة، فصل AirPods، الاستئناف من القفل.
2. **مطابقة App Store Connect** لإفصاح الخصوصية بعد تعديل البيان (UserID مرتبط).
3. **سر GA4 Measurement Protocol** ما زال في `Info.plist`. نقله للخادم مؤجل عمدًا: الطلبات المجهولة تمرّ بمحدد المعدل، وتحويل كل حدث تحليلي إلى POST على `api.sabq.org` يهدد بحرق ميزانية IP المشتركة (حادثة 429 الموثقة في `docs/ratelimit-edge-ip-fix-2026-06-03.md`). يحتاج مسارًا مستثنى من المحدد قبل النقل.
4. **مفتاح «خط القراءة» لا يغيّر العربية**: يطلب `.serif` من خط النظام، وNew York بلا حروف عربية فيسقط على SF Arabic نفسه. سلوك قائم قبل هذا العمل؛ المقترح ربطه بخط IBM Plex Sans Arabic المضمّن (خط الهوية) مقابل SF Arabic. قرار منتج.
5. أرقام الإصدار/البناء مقترحة؛ Xcode Cloud قد يملك رقم بناء أعلى.
6. ويدجت «أهم الأخبار»، App Intents، إطار NowPlaying الجديد في iOS 27 — أعمال مقترحة منفصلة كما في التقرير.

> **تحديث 2026-09-12 مساءً:** الإصدار المنشور فعليًا على TestFlight هو **10.3.3**؛ `MARKETING_VERSION` في المستودع رُفع إليه ليطابقه، والأرشيف التالي يحتاج رقمًا أعلى (10.3.4 أو بناءً أعلى من الذي رُفع).
