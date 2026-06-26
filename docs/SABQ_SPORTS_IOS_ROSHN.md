# تطبيق سبق الرياضي (SabqSports iOS) — إعادة التصميم بهوية «روشن»

> آخر تحديث: 2026-06-26
> المنصة: iOS (SwiftUI) — مشروع `sports app ios/SabqSports.xcodeproj`
> الحزمة: `com.sabq.sports` · Deployment Target: iOS 17.0
> مراجع ذات صلة: [`docs/SPORTS_PORTAL_ROADMAP.md`](SPORTS_PORTAL_ROADMAP.md) · [`docs/SPORTS_DATA_SOURCES.md`](SPORTS_DATA_SOURCES.md) · [`AGENTS.md`](../AGENTS.md)

---

## 1. الهدف

إعادة تصميم تطبيق سبق الرياضي ليكون **تطبيق متابعة بطولة دوري روشن** (لا تطبيقًا إخباريًا)، متوافقًا بصريًا مع هوية روشن المعروضة على موقع سبق (`/roshn`)، مع:

1. هوية روشن البصرية (ألوان/خطوط/عناصر).
2. واجهة غنية ببيانات البطولة (ترتيب، مباريات، نتائج، هدّافون).
3. سهولة وصول وتنقّل + بحث/تصفية في الأخبار.
4. اختيار فريق مفضّل ومتابعته.
5. أداء وسرعة (تحميل متوازٍ + كاش).
6. تكامل مع وسائل التواصل (مشاركة).

> الفلسفة (من `AGENTS.md`): **iOS هو المرجع الرسمي للأندرويد** — أي port إلى `android-native/` لاحقًا يطابق هذه الشاشات 1:1.

---

## 2. الهوية البصرية — `Services/SportsTheme.swift`

أُعيد بناء `SpTheme` بالكامل من «أخضر زمردي صاخب» إلى لوحة **«هادئة فاخرة»** مطابقة لهيرو روشن على الويب. كل أسماء الرموز مُحتفظ بها (لاتساق الشاشات القائمة)، وتغيّرت القيم فقط.

| الرمز | القيمة | الوصف |
|------|--------|-------|
| `ink` | `#0E1B26` | فحمي مزرقّ عميق (خلفية/نص داكن) |
| `greenDeep` | `#072E29` | بترولي غامق (PETROL_DEEP) |
| `green` | `#0C463F` | البترولي الأساسي (PETROL) |
| `gold` | `#C2A14D` | ذهبي مقتصد — التتويج/التمييز/الإبراز |
| `crimson` | أحمر | المباشر/الإنذار |

- `heroGradient`: فحمي → بترولي عميق → بترولي (مطابق هيرو روشن على الويب).
- دعم **الوضع الليلي تلقائيًا** عبر دالة `dyn(light, dark)` للألوان التكيّفية.
- نسيج نقطي ذهبي خفيف `SpDotTexture` في `Components/SportsComponents.swift` (يطابق نقشة radial-dot على الويب).

---

## 3. بنية التطبيق — التبويبات

`Screens/RootTabView.swift` — خمسة تبويبات، الدوري هو محور التجربة:

| التبويب | الأيقونة | الشاشة | الدور |
|---------|----------|--------|------|
| **روشن** | `trophy.fill` | `HomeView` | هب دوري روشن مباشرةً (الرئيسية) |
| البطولات | `sportscourt.fill` | `CompetitionsView` | بقية البطولات |
| المباشر | `dot.radiowaves...` | `LiveView` | لوحة مباشرة شاملة |
| الأخبار | `newspaper.fill` | `NewsView` | تغطية سبق الرياضية + بحث |
| حسابي | `person.crop.circle` | `AccountView` | الحساب والتفضيلات |

- لون التمييز: `SpTheme.gold`.
- **الأخبار نُقلت من الرئيسية إلى تبويب مستقل** — الرئيسية صارت دوريًا بحتًا.
- مركز المباراة وصفحات النادي/اللاعب تُفتح كـ `sheet` من داخل التبويبات.

---

## 4. الرئيسية = هب روشن — `Screens/HomeView.swift`

عند فتح التطبيق يجد المستخدم روشن أمامه مباشرةً. كل البيانات من `/api/sports/pro-league/*` بتحميل متوازٍ.

### 4.1 الهيرو (الترويسة)
ترويسة بطولة أنيقة — **الهوية هي البطل**:
- شعار الدوري في شارة بيضاء بإطار ذهبي خفيف + هالة.
- سطر تعريفي: «الدوري السعودي للمحترفين» (ذهبي).
- العنوان: **دوري روشن** (كلمة «روشن» ذهبية).
- سطر الحالة: «موسم 2025/2026 · حالة الموسم» (جارٍ الآن / قريبًا / انتهى الموسم) بمؤشّر لوني.
- خلفية: `heroGradient` + `SpDotTexture` + علامة كأس مائية خفيفة + حدّ ذهبي رفيع + حواف سفلية دائرية.

> **قرار تصميمي:** أُزيل من الهيرو **زر المشاركة وصورة/زر الحساب** لأنهما حشو — المشاركة الصحيحة تكون على مباراة/فريق/لاعب محدّد (موجودة داخل تلك الصفحات)، و«حسابي» موجود أصلًا في الشريط السفلي.

### 4.2 التابات الداخلية
شريط تابات مخصّص **مثبّت** (pinned via `LazyVStack` + `Section`) بمؤشّر ذهبي متحرّك (`matchedGeometryEffect`): `نظرة · المباريات · الترتيب · الهدّافون`. تظهر التابات ديناميكيًا حسب توفّر البيانات.

### 4.3 الأقسام
- **نظرة عامة**: بطاقة الفريق المفضّل (إن وُجد) + المباشر الآن + الجولة الحالية + آخر النتائج. وخارج الموسم: بطاقة `SpOutlookCard` (عدّ تنازلي للافتتاح).
- **المباريات**: صفوف مدمجة (الفريقان فوق بعضهما + النتيجة + عمود الحالة/التوقيت) تبرز الفائز.
- **الترتيب**: جدول كامل (المركز، النادي، لعب، فارق الأهداف، النقاط) — نقر الصف يفتح صفحة النادي.
- **الهدّافون**: قائمة مرتّبة (المركز، اللاعب، الفريق، الأهداف) — نقر يفتح صفحة اللاعب.

---

## 5. الفريق المفضّل — `Services/AuthStore.swift`

تخصيص محلّي خفيف بلا حاجة لتسجيل دخول أو خادم:
- `SpFavorites` (`@Observable`, singleton) يخزّن `SpFavTeam` في `UserDefaults` بالمفتاح `sabqsports.favorite.team`.
- يُحقن في البيئة من `SabqSportsApp.swift` (`.environment(favorites)`).
- زر نجمة في ترويسة صفحة النادي (`Screens/TeamPlayerPages.swift`) للتبديل.
- يظهر كبطاقة وصول سريع تتصدّر «نظرة عامة» في الرئيسية.

---

## 6. المشاركة الاجتماعية

`ShareLink` أصلي يشارك روابط عميقة لموقع سبق (`URLConstants`):
- مباراة: `sabq.org/sports/match/:id` — في شريط أدوات `MatchCenterView`.
- نادي: `sabq.org/sports/team/:id` — في شريط أدوات صفحة النادي.
- لاعب: `sabq.org/sports/player/:id` — في شريط أدوات صفحة اللاعب.

---

## 7. طبقة البيانات — `Services/APIClient.swift`

- `actor APIClient` — عميل شبكة عام (نقاط البوابة الرياضية عامة بلا مصادقة في v1).
- الجذور (`URLConstants`):
  - `publicAPI = https://api.sabq.org/api` — البيانات الرياضية العامة.
  - `mobileAPI = https://api.sabq.org/api/v1` — التوقّعات/المتابعة/التنبيهات (Bearer، محجوزة لاحقًا).
- جلستان: قياسية بـ `URLCache` (10MB ذاكرة + 50MB قرص) + جلسة `ephemeral` بلا كاش للتحديث اليدوي (`ignoreCache`).
- **مهلة الطلب 15 ثانية / المورد 30 ثانية** — لا تعليق دائم.
- `loadAll()` في `HomeView` يجلب 5 موارد بالتوازي عبر `async let` (competitions · outlook · matches · standings · scorers)، ثم يضبط `loading = false` دائمًا؛ ولو فشل كل شيء يعرض «تعذّر الاتصال بخادم البيانات».

### مسارات تم التحقق منها (200، أقل من ثانية)
```
GET https://api.sabq.org/api/sports/competitions
GET https://api.sabq.org/api/sports/pro-league/matches
GET https://api.sabq.org/api/sports/pro-league/standings
GET https://api.sabq.org/api/sports/pro-league/scorers
```

> **ملاحظة تشخيصية:** إن ظهرت دوّارة تحميل عالقة على المحاكي رغم استجابة الـ API، فالسبب غالبًا **تعثّر شبكي لحظي في المحاكي** لا عطل في الكود — التحميل يكتمل دائمًا (أو يعرض خطأ) خلال مهلة 30 ثانية، والسحب للأسفل (pull-to-refresh) مفعّل.

---

## 8. الملفات المتأثّرة (هذه الجولة من العمل)

| الملف | التغيير |
|------|---------|
| `Services/SportsTheme.swift` | لوحة ألوان روشن الكاملة + تدرّجات الهيرو |
| `Components/SportsComponents.swift` | `SpDotTexture` (نسيج نقطي) |
| `Services/URLConstants.swift` | روابط مشاركة عميقة (match/team/player) |
| `Services/AuthStore.swift` | `SpFavorites` + `SpFavTeam` |
| `SabqSportsApp.swift` | حقن `SpFavorites` في البيئة |
| `Screens/RootTabView.swift` | تبويبات جديدة (روشن/الأخبار) + لون ذهبي |
| `Screens/HomeView.swift` | هب روشن: هيرو + تابات مثبّتة + أقسام + `NewsView` |
| `Screens/MatchCenterView.swift` | `ShareLink` للمباراة |
| `Screens/TeamPlayerPages.swift` | زر مفضّل + `ShareLink` للنادي/اللاعب |

---

## 9. البناء والتشغيل

```bash
# البناء على محاكي (مثال: iPhone 17 Pro)
xcodebuild -project "sports app ios/SabqSports.xcodeproj" \
  -scheme SabqSports -sdk iphonesimulator -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build

# التثبيت والتشغيل
xcrun simctl install booted <path>/SabqSports.app
xcrun simctl launch booted com.sabq.sports
```

الحالة الحالية: **BUILD SUCCEEDED**، التطبيق يعمل ويجلب بيانات موسم 2025/2026 الحقيقية.

---

## 10. عمل لاحق (Pending)

- تصحيح `currentTeam` للاعبين المنتقلين (parity مع الويب) — لوحظ أن لاعبًا منتقلًا ما زال يظهر في ناديه السابق، والقيمة السوقية مفقودة أحيانًا.
- port الشاشات إلى `android-native/` 1:1 (iOS مرجع).
