# المراجعة المستقلة النهائية

النطاق: diff الحالي فقط، مع التركيز على `SabqComponents.swift` و`SabqDesignSystem.swift` و`NewsService.searchResult` و`EditorialNotificationsView.swift`. لم أعدّل المصدر ولم أشغّل build أو simulator.

## نتائج مؤكدة

### P1 — فقدان دعم High Contrast في النص الثانوي — **تمت المعالجة**

في النسخة السابقة كان `SabqTheme.tertiaryInk` يفحص `traits.accessibilityContrast` ويحوّل اللون إلى أبيض/أسود أعلى وضوحاً. diff استبدله أولاً بـ `static let tertiaryInk = adaptive(0x5A6B79, 0xA9B9C8)` (SabqComponents.swift:1086)، لذلك لم يكن يتغير اللون عند تفعيل Increase Contrast. عولج ذلك الآن بإضافة `highContrastLight/highContrastDark` إلى `adaptive` وتطبيقها على `secondaryInk` و`tertiaryInk`، مع اختبار يتطلب نسبة لا تقل عن 7:1 في الوضعين (EditorialDesignSystemTests.swift:16-27).

### P2 — هدف لمس غير موثق في “تعيين الكل كمقروء” — **تمت المعالجة**

زر `markAllReadButton` في `EditorialNotificationsView.swift:228-246` كان يملك `padding(.vertical, 10)` وخط 12pt ولا يفرض `minHeight: SabqLayout.touchTarget`، فكان ارتفاعه المرئي يقارب 34pt. عولج ذلك بإضافة حد أدنى 44pt، وأضيف الحد نفسه إلى `clearAllFooter`.

## مراجعة التعديلات اللاحقة

ألوان بطاقات `submissionCardContent` أصبحت محايدة (`paleFill`/`outline`) مع إبقاء اللون الدلالي للأيقونة؛ «إرسال خبر» والإشعارات يستخدمان `primaryEnd`، وقائمة التعديلات تستخدم `warning`، وشارة العدد تستخدم `actionFill`. النصوص الثانوية تزيل حد السطر عند Dynamic Type accessibility. لم أجد regression جديداً مدعوماً في هذا الجزء من diff. ما يزال تحقق العرض الفعلي في المحاكي خارج هذه المراجعة.

## تحقق

`NewsService.searchResult` (NewsService.swift:171-178) يرمي أخطاء API، يعيد نفس tuple والتصفية `nonOpinionArticles`، والـ`search` القديم يبقى wrapper غير رامي؛ لا regression عقدي ظاهر. التعديلات اللاحقة أضافت اختبار High Contrast وأهداف اللمس، و`git diff --check` نظيف. لم أشغّل build أو simulator.

## المراجعة الأخيرة: تفضيلات الإشعارات — **مقبولة**

`NotificationPreferencesView` يستخدم الآن `Toggle(isOn:)` مع محتوى وصفي كامل داخل label (`EditorialNotificationsView.swift:904-924`)، وأيقونة مخفية عن VoiceOver لتجنب التكرار. `preferenceBinding` يكتب فقط بعد تغيير المستخدم، ويمنع التغييرات أثناء الحفظ؛ هذا يعالج الحفظ العرضي أثناء التحميل والسباق بين التعديلات. `loadPreferences` و`save` يطابقان توقيعي `APIClient` الفعليين (`APIClient.swift:1064-1073`)، ويعيدان `savedPrefs` عند فشل PUT مع رسالة وإعادة محاولة عند فشل GET. أزرار retry والتبديلات معطلة أثناء الحالة المناسبة، والنصوص تلتف مع Dynamic Type. لا خلل جديد مدعوم في هذا القسم.
