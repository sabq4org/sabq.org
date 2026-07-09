# تطبيق «سبق الرياضي» — توثيق العمل (2026‑06‑26)

تطبيق iOS مستقل (SwiftUI، target iOS 17) يستهلك نقاط `/api/sports/*` العامة من `api.sabq.org`.
الـ scheme: `SabqSports` · Bundle: `com.sabq.sports`. هذا الملف يوثّق إعادة التصميم والإثراء التي تمّت في جلسة 2026‑06‑26.

---

## 1. الهوية البصرية — «iOS grouped + لون تطبيق قابل للتغيير» (محدَّث 2026-07-09)

المرجع: تصميم صفحة كأس آسيا على الويب (`sabq.org`). المبدأ الحالي:

> **خلفية رمادية محايدة + بلوكات بيضاء/سُخامية + لون مظهر يختاره المستخدم (الأخضر افتراضيًا) + مسطّح بلا ظلال + حدود خافتة + تكيّف فاتح/داكن.**

كل الألوان مركزية في **`Services/SportsTheme.swift`** (enum `SpTheme` + `SpAccentTheme` + `SpThemeMode`). أهم القيم:

| الرمز | القيمة | الاستخدام |
|---|---|---|
| `screenGradient` | رمادي iOS فاتح / سُخامي مزرق داكن | خلفية كل الشاشات (تكيّفي) |
| `card` / `surface` | أبيض / سطح مرتفع داكن | كل البطاقات |
| `cardStroke` | حدّ خافت | فصل ناعم للبطاقات |
| `cardShadow` | **`.clear`** | لا ظلال (مسطّح تمامًا) |
| `green` | لون التطبيق المختار (`emerald` افتراضيًا؛ «أحمر VARA» خيار) | اللمسة النشطة (أزرار/أيقونات/حالات) |
| `onDark` / `onDarkDim` / `onDarkFaint` | حبر تكيّفي | النصّ |
| `gold` | ذهبي | الميداليات + الكرت الأصفر فقط (دلالي) |

- **المظهر:** `SpThemeMode` — تلقائي / فاتح / داكن عبر `.preferredColorScheme(themeMode.colorScheme)` في `SabqSportsApp.swift` (لم يعد مفروضًا فاتحًا).
- **الخلفية المحيطة** (`SpAmbientBackground`) = `screenGradient` فقط — بلا توهّجات/نقشة.
- **قاعدة التحويل** (كتلة ملونة → بطاقة): الخلفية `card`+`cardStroke`، الزوايا `cardRadius`، النصّ `onDark*`، الأزرار النشطة = لون التطبيق. **يُستثنى الدلالي** (الكرت الأصفر، تمييز فريقين).

كل الشاشات تتبع هذه الهوية: الرئيسية، البطولات، العالمية، الحساب، مركز المباراة، النادي، اللاعب.

---

## 2. التنقّل — صفحات مدفوعة بدل الانبثاق

- **مركز المباراة + تفاصيل النادي + تفاصيل اللاعب** تُفتح كصفحات **push** عبر `.navigationDestination(item:)` / `NavigationLink` (لا sheets). الوجهات الثلاث بلا `NavigationStack` داخلي وبلا زرّ إغلاق (زرّ الرجوع التلقائي).
- **تفاصيل الخبر** وحدها تبقى **انبثاقًا** (`SpSafariView` = `SFSafariViewController`).
- قاعدة مهمّة: `navigationDestination` يجب أن يكون **داخل** محتوى `NavigationStack` لا على الـstack نفسه (بخلاف `.sheet`).

---

## 3. الرئيسية — لوحة دوري روشن (`Screens/HomeView.swift`)

حُذف شريط التبويبات القديم، واستُبدل بتدفّق واحد غنيّ بالأرقام (`dashboardContent`):

1. **الهيرو** — مباراة الفريق المفضّل (عند الدخول واختياره) بشارة «⭐ فريقي المفضّل»، وإلا مباراة الدوري الأبرز. بطاقة بيضاء.
2. **نبض الدوري** — شريط KPI أفقي مدمج (المتصدّر/الهدّاف/أقوى هجوم/أمنع دفاع/فارق الصدارة).
3. **جولة هذا الأسبوع** — مباريات اليوم/القادمة.
4. **سباق اللقب** — أفضل 5 + **نقاط فورمة آخر 5** (فوز أخضر/تعادل رمادي/خسارة حلقة).
5. **الهدّافون ⇄ الصنّاع** — مبدّل داخلي، بصور اللاعبين.
6. **أبرز الأرقام** — أكثر تهديفًا/أمتن دفاع/أكثر فوزًا.
7. **آخر النتائج** و**أبرز الصفقات** (`topDeals`).

- **صور اللاعبين**: الهدّافون من `photo`، المنتقلون يُبنى رابطهم `media.api-sports.io/football/players/{id}.png`. عبر `SpAvatarImage` المكاشّف (@State) لتجنّب وميض `AsyncImage` في الرئيسية كثيرة التحديث.
- روابط «الكل» تدفع صفحات كاملة (`navigationDestination(isPresented:)`).

---

## 4. إصلاح اتجاه النتيجة (RTL) — مهم/عام

في RTL يُوضع المضيف يمينًا، لكن نصّ النتيجة كان مفروضًا LTR بترتيب «مضيف‑ضيف» فيظهر رقم المضيف يسارًا = **مقلوب بصريًّا**.
**الحل**: عكس ترتيب الأرقام في النصّ إلى `"\(goals.away) - \(goals.home)"` مع إبقاء `.environment(\.layoutDirection,.leftToRight)`.
أُصلح في ٤ مواضع: hero، آخر النتائج، centerColumn (مركز المباراة)، `SpMatchCard`.

---

## 5. إثراء مركز المباراة (`Screens/MatchCenterView.swift`)

ترويسة بيضاء + التبويبات تظهر شرطيًّا حسب توفّر الداتا: `events/commentary/analysis/ratings/lineups/stats/h2h`.

| الميزة | النقطة | الوصف |
|---|---|---|
| **التقييمات** | `/match/:id/players` | «أفضل لاعب» + تقييمات XI بالصور + شارة ملوّنة (أخضر≥7/رمادي6‑7/قرمزي<6) → صفحة اللاعب |
| **المواجهات** | `/h2h?home&away` | سجلّ (فوز/تعادل/فوز + شريط) + آخر اللقاءات → مركز كلٍّ |
| التحليل (سابق) | `/xg /momentum /pressure /facts` | نبض الأرقام/الزخم/الضغط/الوقائع |

ملاحظة: `ratings/h2h` تُجلب غير متزامنة (انتظر ~5ث بعد الفتح). **أُزيل «الملخّص الذكي» (`/match/:id/story`)** من العرض بطلب المالك (2026‑06‑26)؛ النموذج `SpMatchStory` ودالة `fetchStory` باقيان في `SportsModels.swift` للاستخدام المستقبلي لكن لا يُستدعَيان.

---

## 6. صفحة النادي (`Screens/TeamPlayerPages.swift` · `SpTeamPage`)

أُعيد بناؤها 1:1 على مرجع كأس العالم (`WCTeamSheet`) — **تمرير واحد متواصل بلا تبويبات**، بثيم سبق الرياضي الأبيض:
- **ترويسة بطلة** بتدرّج أخضر (`SpTheme.heroGradient`) + لمسة ذهبية ضبابية: الشعار + الاسم + سطر المركز/النقاط + البطولة + المدرّب، نص أبيض.
- **شريط متابعة** حبوب (المفضّل + تابع التنبيهات).
- **بلاطات حقائق** (`SpFactTile`): المركز · نقاط · التأسيس · حجم القائمة.
- **بطاقة المدرّب** + **بطاقة الملعب** (`SpVenueInfo`: اسم/مدينة/سعة).
- **الإصابات** (`/team/:id/injuries`) + **آخر الانتقالات** (`/team/:id/transfers`).
- **أرقام الفريق في الموسم** كشبكة بلاطات (`biggest`/`summary` من `?with=stats`).
- **المباريات** مجمّعة (مباشر/قادمة/نتائج) + **هدّافو الفريق** + **القائمة** حسب المركز.

---

## 7. صفحة اللاعب (`SpPlayerPage`)

أُعيد بناؤها 1:1 على مرجع كأس العالم (`WCPlayerSheet`):
- **ترويسة هوية مسطّحة** (لا بطاقة): الصورة (حلقة خضراء) + الاسم + الاسم الكامل + شارات المركز/الرقم/الجنسية.
- **بلاطات حقائق** (العمر/الطول/الوزن) + **سطر الميلاد** (تاريخ ميلادي بالعربية + محلّ الميلاد).
- **القيمة السوقية** — `/player/:id/market` (تُخفى عند `available:false`).
- **أرقام الموسم** كشبكة بلاطات لكل بطولة + شارة تقييم ملوّنة.
- **الفورمة الأخيرة** — `/player/:id/form`: شريط نتائج ف/ت/خ (الأحدث يمينًا) + **رسم أعمدة xG** (SwiftUI Charts، يظهر فقط عند توفّره) + صفوف المباريات.
- **سجل المواسم** (`?with=extras`) + **المسيرة** (بشعارات) + **الألقاب** (شارة المركز/الموسم).

---

## 8. صفحة البطولة (`Screens/CompetitionDetailView.swift`)

«كل شيء عن البطولة» من **كل اشتراكاتنا**، بالاستايل الأخير (ترويسة بطلة + حبوب تبويب أفقية + بطاقات مسطّحة):
- **ترويسة بطلة** بتدرّج أخضر: الشعار + الاسم + شارة الحالة (منتهٍ/جارٍ/قادم) + الموسم `2025/2026` + عدد الأندية.
- **حبوب تبويب أفقية** (تُخفى الفارغة): نظرة · الترتيب · الهدّافون · الصنّاع · المباريات · الانتقالات.
- **نظرة**: **بطل الموسم المنتهي** (`/{comp}/outlook` → `champion`) ببانر ذهبي وتاج + بلاطات حقائق (الموسم/الأندية/أهداف وصناعة المتصدّر) + مقتطف الترتيب (أعلى ٥) + **هدّاف/صانع البطولة** (بطاقتان) + آخر النتائج.
- **الترتيب الكامل** مع تاج للبطل (المركز ١).
- **الهدّافون** (`/{comp}/scorers`) + **الصنّاع** (`/{comp}/assists`، جديد) + **المباريات** (مباشر/اليوم/قادمة/نتائج) + **الانتقالات** (`/sports/transfers`، للبطولات السعودية).
- مرِنة: لا تُحجب الصفحة كاملةً لأنّ نداءً واحدًا فشل (مثل 502 على `matches`) — يُعرض كل ما تحمّل.

---

## نقاط الـAPI المستهلَكة (مرجع)

```
/sports/competitions · /sports/{comp}/standings|scorers|assists|matches|outlook
/sports/transfers · /sports/world-live
/sports/match/{id} · /story · /players · /xg · /momentum · /pressure · /facts · /commentary*
/sports/h2h?home&away
/sports/team/{id}?with=stats · /injuries · /transfers · /coach* · /scorers*
/sports/player/{id}?with=extras · /form · /market
/api/v1/articles?section=sports   (mobileAPI — الأخبار)
```
(*) متاحة على الخادم — بعضها قيد الإضافة للواجهة.

---

## الملفات الرئيسية

| الملف | الدور |
|---|---|
| `Services/SportsTheme.swift` | السمة المركزية (كل الألوان/الأنصاف) |
| `Services/SportsModels.swift` | النماذج + امتداد `APIClient` (كل دوال `fetch*`) |
| `Services/APIClient.swift` | عميل الشبكة (get/post مع كاش/ephemeral) |
| `Screens/HomeView.swift` | لوحة روشن + تبويب الأخبار |
| `Screens/MatchCenterView.swift` | مركز المباراة (ملخّص/أحداث/تحليل/تقييمات/مواجهات) |
| `Screens/TeamPlayerPages.swift` | صفحتا النادي واللاعب |
| `Components/SportsComponents.swift` | مكوّنات مشتركة (الخلفية/الصور/البطاقات/SpMatchCard/SpOutlookCard) |

---

## 8. خطّ زمن الأحداث المرئي (`Screens/MatchCenterView.swift` · `eventsView`)

استُبدلت قائمة الأحداث المسطّحة بخطّ زمني ثنائي المحور كتصميم الويب:
- **محور أخضر مركزي** (`Capsule` بعرض 2) تتدلّى منه **شارات الدقائق** الخضراء (`90'+8`) فتبدو متّصلة.
- **بطاقات بيضاء على جهة الفريق**: المضيف يمينًا، الضيف يسارًا — الأيقونة عند الحافة الداخلية (نحو المحور) والنصّ يحاذي الخارج.
- **رأس الفريقين** فوق الخطّ (شعار + اسم؛ الضيف يسارًا/المضيف يمينًا).
- **فاصل «نتيجة الشوط الأول H - A»** يُحقن آليًّا عند حدّ الدقيقة 45 (الترتيب تنازليّ، الأحدث أعلى)؛ النتيجة تُحسب من أحداث الأهداف ≤45 (الهدف العكسي يُحتسب للخصم).
- **التخطيط مُثبَّت LTR** داخليًّا (`environment(\.layoutDirection, .leftToRight)`) لضمان ثبات يمين/يسار بصرف النظر عن RTL، مع إبقاء النصّ العربيّ بمحاذاة `.trailing`.

**مطابقة `TimelineChip` في الويب (2026‑06‑26):** أُعيد ضبط البطاقات لتطابق `MatchCenterDialog.tsx` بدقّة بدل التقريب:
- **بطاقات مدمجة بحجم محتواها** (`text` بـ`frame(maxWidth: 150)` بلا `infinity`) تُلاصق العمود المركزي — لا كتل ممتدة لكامل العرض. الأيقونة محاذاةٌ للأعلى (`HStack(alignment: .top)`).
- **بطاقة الهدف** بخلفية `green.opacity(0.10)` وحلقة `green.opacity(0.25)`؛ بقيّة الأحداث بخلفية `chipFill` رماديّة بلا إطار.
- **أيقونات مسطّحة ملوّنة (بلا دائرة مملوءة)** عبر `eventBadge` — مطابقة لـ`EventIcon`: هدف `soccerball` أخضر · إهدار جزاء `exclamationmark.shield.fill` أحمر · فار `play.tv.fill` بنفسجي (`varPurple`) · تبديل `arrow.left.arrow.right` أزرق سماوي (`subSky` = sky‑500) · بطاقة مربّع أصفر/أحمر (`cardChip`).
- **ثلاثة أسطر للنصّ**: الاسم (غامق) + سطر نوع الهدف بالأخضر (`goalTypeLine` — يُعرض فقط لِما يحمل معلومة كركلة جزاء/عكسي، لا يُكرَّر «هدف» العام) + سطر رماديّ سفليّ (`detailSubtitle`): «صناعة: …» للهدف، «بديلًا عن: …» للتبديل، وصف البطاقة/الفار للبقية.
- **شارة الدقيقة** كبسولة خضراء (`Capsule` بحدّ أدنى عرض 40) — مطابقة لـ`rounded-full bg-emerald-600`.

عنصر القائمة `SpTimelineItem` (file‑scope): `.event` أو `.halftime`.

## 9. التعليق اللحظي (`Screens/MatchCenterView.swift` · `commentaryView`)

تبويب **«التعليق»** الجديد (نظير تبويب الويب في `MatchCenterDialog.tsx`) — أبرز اللحظات المُعرَّبة من `/sports/match/:id/commentary` (SportMonks، أفضل جهد):
- النموذج `SpCommentary { available, live, items }` و`SpCommentaryItem { minute, extraMinute, goal, important, textAr, order }` في `SportsModels.swift` (فكّ مرن بقيَم افتراضية). الجلب `fetchCommentary` بالتوازي في `load()`.
- يظهر التبويب شرطيًّا (`hasCommentary`) بعد «الأحداث» مباشرةً، ويُخفى إن لم تتوفّر لحظات.
- كل سطر: شارة الدقيقة (LTR) + أيقونة نوع اللحظة + النصّ العربي بمحاذاة `.trailing`. اللحظات المهمّة (هدف/important) بخلفية خضراء خفيفة وإطار أخضر.
- **نوع اللحظة** يُستنتج من النصّ العربي (`commentaryKind` — مطابق لمنطق الويب): goal/yellow/red/penalty/corner/substitution/shot‑saved/shot‑missed/fulltime/period/added‑time/other، وتُعيَّن أيقونة SF Symbol لكلٍّ. **مهم**: المزوّد لا يضبط `is_goal` لكل هدف، لذا يُكتشف الهدف أيضًا من بداية النصّ (`textAr.hasPrefix("هدف")`) كي تظهر أيقونة الكرة الخضراء والإبراز لكل الأهداف (بما فيها ركلات الترجيح).
- شريط «التعليق يتحدّث مباشرةً» (نقطة قرمزية) عند `live`.

> بقية تبويبات الويب (الزخم/الضغط ضمن «التحليل»، التشكيلات، الإحصاءات، التقييمات، التوقّعات، المواجهات) مطبَّقة سابقًا — مركز المباراة الآن مكتمل المحتوى مقابل الويب.

## 10. خطّ زمن أفقي للمباراة (`MatchCenterView.swift` · `matchTimelineBar`)

أعلى تبويب «الأحداث» شريط أفقي يلخّص الأهداف والكروت (نظير `WorldCupMatchCenter` ومقابل الويب):
- محور أفقي أخضر + علامات مرجعية `0' · 45' · 90'` (و`maxMinute` عند الوقت بدل الضائع). الإحداثي يدويّ بـRTL (`barX`): الدقيقة 0 **يمينًا** والأكبر يسارًا، والتخطيط مُثبَّت LTR لثبات الإحداثيات.
- **المضيف فوق المحور · الضيف تحته** مع مفتاح ألوان (المضيف أخضر/الضيف ذهبي). علامة الهدف كرة خضراء بدائرة بيضاء، البطاقة مستطيل أصفر/أحمر، وشارة الدقيقة الصغيرة تحتها/فوقها.
- يظهر فقط عند وجود أهداف/كروت؛ يبقى الخطّ الزمني الثنائي العموديّ تحته.

## 11. التشكيلة على أرض الملعب (`MatchCenterView.swift` · `pitchView` / `benchGrid`)

استُبدلت قائمة التشكيلة النصّية بملعب ثنائي الأبعاد (نظير `WCPitch`):
- **`pitchRows`** يبني صفوف اللاعبين من الشبكة `"صف:عمود"` (الصف 1 = الحارس). إن غابت الإحداثيات (`grid` فارغ) يعود تلقائيًّا للقائمة النصّية (`playerRow`).
- ملعب بتدرّج أخضر + دائرة منتصف + خطّ تقسيم؛ كل لاعب دائرة بيضاء بالرقم واسمه أسفلها، والصفوف موزّعة عموديًّا (`y = h·(1 − (i+0.6)/(n+0.4))`). التخطيط داخل كل صفّ LTR لتوزيع متّسق.
- **دكة البدلاء** شبكة `LazyVGrid` تكيّفية (رقم + اسم)؛ كلٌّ من لاعبي الملعب والدكة قابل للنقر لفتح `SpPlayerPage` عبر `selectedPlayer`.
- ألوان الملعب (`pitchTop`/`pitchBottom`) محليّة في `MatchCenterView` (غير مضافة لـ`SpTheme`).

### تسطيح الإطارات (مطابقة المرجع)
المرجع يعرض القوائم والرسوم العريضة **مسطّحة بلا بطاقات/إطارات**؛ تُحفظ البطاقات للكتل المدمجة فقط:
- **الترويسة (النتيجة)**: أُزيل الكرت الأبيض — `header` مسطّح: شعارات + النتيجة + `SpStatusPill` أسفل النتيجة + سطر معلومات مركزيّ (`headerMeta`: البطولة · الجولة · اليوم). لا إطار.
- **التشكيلة**: أُزيل الكرت الأبيض الخارجي عن `lineupCard` — الرأس/المدرّب/الدكة مسطّحة، والملعب الأخضر هو الحاوية الوحيدة.
- **الإحصاءات**: أشرطة `statRow` مسطّحة مباشرةً على الخلفية بلا كرت محيط.
- **التحليل**: رسوم الزخم/الضغط (`momentumCard`/`pressureCard`) مسطّحة (عنوان + رسم بلا إطار)؛ تبقى كتلتا xG والوقائع/الطقس داخل بطاقات (`analysisCardBg`) كالمرجع.

### إصلاح اتجاه التعليق (RTL)
كان نصّ التعليق يُحاذى يسارًا (يبدو LTR) بسبب `alignment: .trailing` + `multilineTextAlignment(.trailing)` — في بيئة RTL تعني `.trailing` **اليسار**. الإصلاح: استخدام `.leading` لكليهما (= اليمين في RTL، كالمرجع) فتظهر الدقيقة/الأيقونة يمينًا والنصّ بمحاذاة يمين.

## 12. الهوية: أيقونة التطبيق + شعار VARA

- **أيقونة التطبيق**: `Assets.xcassets/AppIcon.appiconset/AppIcon.png` (1024×1024، بلا قناة ألفا — أيقونة universal مفردة) استُبدلت بتصميم VARA الداكن (مربّع داكن + كرة دائرية خضراء بدوائر إلكترونية وحرف V). الملف هو المصدر الوحيد؛ Xcode يولّد بقية المقاسات.
- **أيقونة إشعارات iOS**: النظام يعرض أيقونة التطبيق نفسها في مركز الإشعارات، لذلك أي ظهور للشعار القديم يعني أن البناء/الأرشيف لم يلتقط `AppIcon` الحالي أو أن نسخة أصول مساعدة غير متزامنة. يجب أن تطابق أي نسخة محلية تحت `build/Assets.xcassets/AppIcon.appiconset/AppIcon.png` هذا الملف.
- **شعار VARA في الرئيسية**: أُضيف imageset باسم `VaraLogo` (الشعار الدائري المعدني الأخضر «VARA»). يُعرض عبر `brandBar` أعلى `HomeView.heroSection`: الشعار مقصوص دائرةً (32pt، بحدّ `cardStroke`) + كلمة «VARA» (LTR، heavy، tracking 1) متوسّطة فوق ترويسة «دوري روشن».

## 13. إعادة تصميم «حسابي» كمركز إعدادات ذكي (`AccountView.swift`)

كانت الصفحة مجرّد بطاقة ملف + 5 مفاتيح تنبيه منفصلة (كل واحد بطاقة) + روابط جامدة غير قابلة للنقر. أُعيد بناؤها كقوائم مجمّعة نظيفة (نمط إعدادات iOS): **بطاقة بيضاء واحدة لكل قسم** بصفوف مفصولة بفواصل خفيفة (تبدأ بعد أيقونة الصف، `padding(.leading, 56)`)، عبر مكوّنات مشتركة محلّية: `settingsCard` / `sectionHeader` / `rowDivider` / `iconTile` / `hint`.

البنية الذكية:
- **الملف**: ترويسة أفقية مدمجة (صورة 60 + اسم + بريد + سطر ولاء `loyaltyLine` يتكيّف: «مشجّع X» أو «تتابع N فريقًا» أو ترحيب).
- **فِرقي**: بطاقة تضمّ **الفريق المفضّل** (`SpFavorites` — محلّي، يعمل **بلا تسجيل دخول**؛ يُضبط من نجمة صفحة النادي ويُمسح هنا بزرّ ×، والنقر يفتح صفحة النادي) + **الفِرق المتابَعة** (عند الدخول فقط: عدّاد + تمرير أفقي للشعارات يفتح صفحة النادي).
- **تنبيهات المباريات**: المفاتيح الخمسة في بطاقة واحدة بفواصل بدل 5 بطاقات؛ مع `hint` يتكيّف (تابع فريقًا / تصلك لِفِرقك). خارج الدخول: صفّ تلميح «سجّل الدخول لتفعيل التنبيهات».
- **عن التطبيق**: روابط **قابلة للنقر فعلاً** عبر `@Environment(\.openURL)` (موقع سبق، القسم الرياضي) بأيقونة سهم خارجي + صفّ الإصدار. أيقونات هذا القسم محايدة (`onDarkDim`) لا خضراء.
- **تسجيل الخروج**: بطاقة بنصّ قرمزي + `confirmationDialog` تأكيد. تذييل «VARA · تطبيق سبق الرياضي».

اللمسة الخضراء مقتصرة على أيقونات التخصيص/التنبيهات والمفاتيح؛ بقية الصفحة بيضاء هادئة (نفس روح تهدئة قسم البطولات).

## 14. «المباشر» بتبويبين (`LiveView.swift`)

أُعيد بناء الصفحة من تدفّق واحد (world-live مفلتر على بطولاتنا) إلى **تبويبين** (شريط حبّتين أخضر/أبيض):

1. **«المباريات»** — مباريات بطولاتنا **اليوم** عبر الفئات من `/sports/today` (`fetchToday`). تُشتقّ الفئة من `competitionSlug` عبر خريطة تُبنى من `/sports/competitions` (`catBySlug`). الترتيب حسب طلب المالك: **العالمية (كأس العالم) → الخليجية → العربية → السعودية → الأوروبية** (`categoryOrder` محلّي في الـView). الجارية الآن تُرفع إلى قسم **«مباشر الآن»** (رأس أحمر) أعلى التبويب؛ وداخل كل فئة: القادمة بالوقت أولًا ثم المنتهية. كل بطاقة `SpMatchCard(showsCompetition: true)` تُظهر الحالة عبر `SpStatusPill`.
2. **«مباشر العالم»** — كل مباريات العالم الجارية الآن من `/sports/world-live` (بلا فلتر `competitionSlug` بعكس السابق، فتظهر الدوريات العالمية)، مجمّعة حسب البطولة/الدولة (`worldGroups`): بطولاتنا أولًا (rank 0/1) ثم العالمية (rank 2).

**`SpStatusPill` (تحسين):** أصبح يقرأ `status.code` ويُظهر ليبلًا قصيرًا بدل الدقيقة في الأوقات بلا عدّاد — `HT`→«استراحة»، `BT`→«استراحة إضافي»، `P/PEN`→«ركلات»، `SUSP`→«موقوفة»، `INT`→«متوقّفة» — وإلا الدقيقة (`e'` أو `e+extra'`)، والمنتهية تبقى `status.label` («انتهت»). أكواد الحالة من `WC_STATUS_AR`/`WC_LIVE_STATUSES` في الخادم.

> قرار افتراضي قابل للتعديل: مكان السعودية/الأوروبية في الترتيب اجتهاد (المالك ذكر العالمية/الخليجية/العربية صراحةً).

### تحسينات تبويب «المباريات» (طلب المالك)
- **شريط اختيار اليوم** (`dayStrip`): حبّات أفقية من قبل ٣ أيام حتى أسبوعين (تقويم الرياض)، اليوم يظهر «اليوم» وبقية الأيام باسم اليوم + «27 يونيو». الضغط يضبط `selectedDate` ويستدعي `loadDay()` = `fetchToday(date:)` لليوم المختار (مستقلّ عن «مباشر العالم»). `ScrollViewReader` يمركز اليوم المختار.
- **الوقت بصيغة لاتينية** «22:00»: `SpFormat.fmt` صار يستخدم `Locale("ar-u-nu-latn")` + `Calendar(.gregorian)` — أسماء عربية + أرقام لاتينية + تقويم ميلادي (تفادي `ar-SA` الذي يفترض الهجري فيظهر «محرم»). أُضيفت `weekdayName`/`dayMonthLabel`/`dateKey`.
- **إزالة تكرار الوقت**: في `SpMatchCard` كانت الشارة العلوية تعرض الوقت ومركز البطاقة يعرضه أيضًا. الآن الشارة (`SpStatusPill`) تعرض **«قادمة» (أخضر خفيف)** للقادمة و**«انتهت» (أحمر خفيف)** للمنتهية، والمركز يعرض الوقت «22:00» مرة واحدة (أو النتيجة). ينطبق التحسين أيضًا على `MatchCenterView.centerColumn` (كان فيه التكرار نفسه).
- **تسمية الفئة العالمية**: `liveCategoryLabel` تُرجِع **«كأس العالم»** للفئة `world` بدل «بطولات عالمية» (موسم كأس العالم 2026).

## 15. Onboarding — محذوف (2026-07-09)

> **قرار المالك أ1:** لا Onboarding عند أول تشغيل. التطبيق يفتح مباشرة على التبويبات (Guest-first). ختم «من سبق» في الـSplash وورقة الدخول فقط — لا جولة ميزات.

**منفّذ:** أُزيل `SpOnboardingView` و`@AppStorage("sabqsports.onboarding.seen.v2")` و`fullScreenCover` من `RootTabView`. ورقة الدخول (`SpLoginSheet`) تبقى متاحة سياقيًّا عبر `SpAppRouter.requestLogin()`.

**تاريخي (لا يُعاد):** جولة Aurora (`OnboardingView.swift` / `ob_seen_v1`) ثم `SpOnboardingView` / `seen.v2`.

## 16. متابعة المباريات + بطاقة «مبارياتي» (`SpMatchFollows` + `SpMyMatchesCard`)

متابعة مباريات بعينها (روشن أساسًا، وكأس العالم تجريبيًّا) بفائدة مزدوجة: تتصدّر **بطاقة «مبارياتي»** الرئيسية، وتُجدوَل **إشعارات محلّية** تذكيرية.
- **المخزن** (`Services/AuthStore.swift` › `SpMatchFollows` — `@MainActor @Observable` singleton، محلّي بـ`UserDefaults`، **بلا تسجيل دخول**): يحفظ لقطة كاملة `[SpFixture]` (صار `SpFixture` + أنواعه `Codable`؛ أُضيف `kickoff: Date` من `timestamp`). دوال: `isFollowing/toggle/add/remove/update`، والقائمة مرتّبة زمنيًّا (`items`).
- **الإشعارات المحلّية**: عند المتابعة يُطلب الإذن (إن `notDetermined`) وتُجدوَل تذكيرتان عبر `UNCalendarNotificationTrigger`: «تبدأ بعد ١٠ دقائق ⚽» و«انطلقت المباراة! 🔥». تُلغى عند إلغاء المتابعة أو تُعاد جدولتها عند `update` إن تغيّر الموعد. مُعرّفات `match-<id>-pre/-kick`.
- **التحديث**: `refresh()` (تُستدعى في `HomeView.loadAll`) يجلب `fetchMatchDetail` للمباريات الجارية أو القريبة (±٣ ساعات) عبر `withTaskGroup` ويحدّث اللقطات.
- **البطاقة** (`Components/SportsComponents.swift` › `SpMyMatchesCard`): **أوّل بطاقة** في `HomeView.heroSection` (بعد ترويسة VARA/دوري روشن، فوق المباراة البارزة)؛ تظهر فقط عند وجود متابَعات. عنوان «مبارياتي» + نجمة ذهبية + عدّاد بعدد المتابَعات. كل صفّ: الفريقان + مركز يتغيّر بالحالة عبر `TimelineView(.periodic by:1)`:
  - قادمة وأبعد من ساعتين → **توقيت المباراة** بخط صغير (`22:00`) + اليوم (`26 يونيو`).
  - قادمة وباقٍ ساعتان أو أقل → **عدّاد تنازليّ حيّ** أخضر بخط أصغر (لاتيني `HH:MM:SS`) + «تبدأ بعد».
  - مباشرة → النتيجة + نقطة حمراء «مباشر». منتهية → النتيجة + «انتهت».
- **زرّ المتابعة موثوق عبر `ZStack` (شقيق لا متداخل)**: `NavigationLink` يبتلع نقرة أي `Button` متداخل في `label`، فجُعلت **نجمة المتابعة** في `SpMatchCard` و**نجمة الإلغاء** في صفوف «مبارياتي» عناصر **شقيقة** للرابط داخل `ZStack` (مع فراغ `Color.clear` محجوز في التخطيط لمطابقة موضعها). تُضاف المتابعة أيضًا من **شريط أدوات `SpMatchCenter`** (`topBarLeading`، موثوق دائمًا).

## 17. مركز المباراة القادمة (`MatchCenterView`)

- **تعطيل التوقّع مؤقتًا**: بطاقة «توقّع النتيجة» (`predictCard`) لم تَعُد تُعرض (النظام غير مكتمل). الكود محفوظ ومُعطَّل العرض فقط — يُعاد ربط `predictCard` في صدر `body` لإعادة تفعيله.
- **بطاقة «الوقت المتبقّي»** (`preMatchCard`، تظهر حين `!started`): تستكمل مركز المباراة القادمة كبقية المباريات — عدّاد تنازلي حيّ بحبّات يوم/ساعة/دقيقة/ثانية (`SpCountdownChips`) + سطر الموعد (`headerMeta` + `kickoffTime`)، بجانب تبويبات المواجهات/التحليل المتاحة قبل المباراة.

## 18. الإشعارات اللحظية للمباريات المتابَعة (هدف/انطلاق/نهاية/بطاقة/فار)

يعيد استخدام جوب التنبيهات الرياضية القائم (`server/jobs/sportsAlertsJob.ts` + `sportsAlertsService.ts`، استطلاع كل ١٠ث، APNs+FCM) ويوسّعه ليشمل **متابعة المباراة المفردة**، لا متابعة الفريق فقط.

**Backend (إضافي — بلا تغيير سكيمة؛ `sports_follows.kind` نصّ حرّ بفهرس فريد):**
- `sportsFollowsService.ts`: `SportsFollowKind` صار يشمل `"match"` (refId = fixtureId)، + `getMatchFollowerUserIds(fixtureIds)` + `getFollowedMatchFixtureIds()`.
- `sportsAlertsService.ts`: `dispatchAlert` يرسل لاتحاد (متابعي الفريقين ∪ متابعي المباراة). و`detectEventAlerts` (بطاقات/فار) لم يَعُد يتجاوز المباراة إن لم يتابعها أحد بالفريق طالما هي متابَعة مفردةً.
- المسار `/api/v1/sports/follows` (POST/DELETE) يقبل `kind="match"` تلقائيًّا عبر `isValidFollowKind`.

**iOS:** `SpMatchFollows` يزامن المتابعة/الإلغاء مع `/api/v1/sports/follows` عند تسجيل الدخول (الإشعارات اللحظية تربط المباراة بالحساب+الجهاز). التذكيرات المحلّية والبطاقة تعملان بلا دخول. `syncAllToServer()` بعد الدخول يرفع المتابعات المحلّية. تلميح «سجّل الدخول لإشعارات لحظية» يظهر في بطاقة «مبارياتي» عند عدم الدخول.

### توجيه APNs المتعدّد (تطبيقان على نفس الخادم والمفتاح)
نفس مفتاح/خادم سبق يخدم تطبيقَي الأخبار (`com.sabq.sabqorg`) والرياضة (`com.sabq.sports`) معًا، بتوجيه `apns-topic` **لكل جهاز**:
- **سكيمة:** عمود `bundle_id` (نصّ اختياري) في جدول `push_devices` (`shared/schema.ts`) — فارغ = الـbundle الافتراضي (`APNS_BUNDLE_ID`). طُبِّق بـ`npm run db:push`.
- **تسجيل الجهاز:** `/api/v1/devices/register` يقبل `bundleId` ويخزّنه (insert + update، مع حدّ طول دفاعي). تطبيق الرياضة يرسل `Bundle.main.bundleIdentifier` (`SpDeviceRegisterBody.bundleId` في `SportsModels.swift`).
- **الإرسال:** `apnsService.sendPushNotification` يقبل `options.topic`؛ حين يُمرَّر يُستخدم بدل `credentials.bundleId`. و`sportsAlertsService.pushToUserDevices` يقرأ `pushDevices.bundleId` لكل جهاز ويمرّره كـtopic — فأجهزة الرياضة تستقبل على `com.sabq.sports` والأخبار على الافتراضي، بلا تعارض.

**تشغيل Production (Railway):** `SPORTS_ALERTS_ENABLED=true` · `APIFOOTBALL_KEY` · مفتاح APNs المشترك (`APNS_KEY_ID`/`APNS_TEAM_ID`/المفتاح) مع `APNS_BUNDLE_ID=com.sabq.sabqorg` (الافتراضي للأخبار؛ الرياضة تُوجَّه تلقائيًّا عبر `bundle_id` المخزّن) · `ENABLE_BACKGROUND_WORKERS` · جهاز حقيقي للاختبار (الـpush لا يعمل على المحاكي).

## 19. تنبيهات الانتقالات (سعودية + عالمية بارزة)

إشعارات دفعية للصفقات المؤكّدة الجديدة، **بثّ عام** لمن فعّل المفتاح (لا يقتصر على متابعي نادٍ، بخلاف تنبيهات المباريات). مفتاحان مستقلّان في «حسابي»: «انتقالات سعودية» (مفعّل افتراضيًّا — opt-out) و«انتقالات عالمية بارزة» (مطفأ افتراضيًّا — opt-in).

**Backend:**
- **السكيمة:** عمودان جديدان في `sports_alert_prefs` (`shared/schema.ts`): `transfers_saudi` (default true) و`transfers_global` (default false). طُبِّق بـ`npm run db:push`.
- `sportsAlertPrefsService.ts`: وُسِّع العرض/الافتراضات/المفاتيح؛ و`filterUsersByEventPref` صار يرجع لافتراض المفتاح لمن لا صفّ له (لا `true` ثابت) — مهم للعالمية (المطفأة افتراضيًّا) كي لا تُبثّ للجميع.
- `transferAlertsService.ts` + `jobs/transferAlertsJob.ts`: دورة كل ~10د على القائد فقط. **السعودية** من `getLeagueTransfers()` (روشن)، **العالمية** من `getGlobalConfirmed()` مُرشَّحة `major && !saudi`. خطّ أساس ضدّ الإغراق (أول دورة تسجّل الـids بلا إرسال، يصمد عبر Redis `transfer_alerts:baseline:v1`) + حارس حداثة (لا يُرسَل أقدم من 3 أيام). المرشّحون = أصحاب جهاز نشط بحزمة `com.sabq.sports`، ثم ترشيح بالتفضيل، ثم `inbox` + `notificationBus` + `pushToUserDevices` (المُعاد استخدامها من `sportsAlertsService`). نوع الإشعار `sports.transfer.saudi|global`، deeplink `/sports/transfers`.
- المسارات `/api/sports/alert-prefs` (Passport) و`/api/v1/sports/alert-prefs` (Bearer) تقبل المفتاحين الجديدين.

**iOS:** `SpAlertPrefs`/`SpAlertPrefsBody`/`updateAlertPrefs` (`SportsModels.swift`) + قسم «تنبيهات الانتقالات» في `AccountView.swift` (صفّا تبديل عبر `alertRow`).

**تشغيل Production (Railway):** `SPORTS_TRANSFER_ALERTS_ENABLED=true` (بعد `db:push` واختبار التوصيل) · `APIFOOTBALL_KEY` (السعودية) · `SPORTMONKS_API_TOKEN` (العالمية) · نفس بنية APNs/FCM لتنبيهات المباريات. غياب أي مفتاح مصدر = تجاهل نطاقه بلا عطل.

## 20. المتابعة اللحظية على شاشة القفل (Live Activity / ActivityKit)

متابعة نتيجة مباراة حيّة على **شاشة القفل والجزيرة الديناميكية** دون فتح التطبيق.

**تحديد المباراة:** في `MatchCenterView`، زرّ في شريط الأدوات (`topBarLeading`) يظهر **للمباريات الجارية فقط** (`f.status.live && liveActivity.isSupported`): `platter.filled.bottom.iphone` لبدء المتابعة، و`lock.iphone` (أخضر) لإيقافها — `liveActivity.toggle(for:)`.

**هدف Widget Extension جديد `SabqSportsWidgets`** (`com.sabq.sports.LiveActivity`، productType app-extension، أُضيف يدويًّا في `project.pbxproj`: target + Sources/Frameworks/Resources + Embed Foundation Extensions في التطبيق + dependency/proxy + config list). ملفاته: `SabqSportsWidgetsBundle.swift` (@main) و`SpMatchLiveActivity.swift` (واجهة شاشة القفل + الجزيرة) و`Info.plist` (NSExtensionPointIdentifier=widgetkit-extension).

**الأصل المشترك** `Services/SpMatchActivity.swift` (يُجمَّع في الهدفين): `SpMatchActivityAttributes` — ثوابت (الفريقان/الشعارات/البطولة/الانطلاق) + `ContentState` ديناميكية. ⚠️ **أسماء حقول `ContentState` تُطابق `LiveActivityContentState` في الخادم حرفيًّا** (`homeScore/awayScore/minute(String)/statusLabel/isLive/isFinished/lastEvent`) — أي اختلاف يكسر فكّ ترميز دفعات APNs.

**المدير** `Services/SpLiveActivityManager.swift` (`@Observable` singleton، يُحقن في `SabqSportsApp`): `start/update/end/toggle`، يلتقط النشاطات الباقية بعد إعادة التشغيل (`adoptExisting`)، ويراقب `pushTokenUpdates` لكل نشاط فيرفعها للخادم. التحديث المحلّي يجري من `MatchCenterView.load` و`SpMatchFollows.update` (no-op إن لا نشاط).

**عرض الدقيقة الحيّة:** الويدجت يعرض **نصّ الدقيقة المدفوع** (`ContentState.minute` مثل «45'»/«45+2'»/«90+3'») كما يظهر داخل التطبيق تمامًا — لا عدّاد ذاتيًّا (`Text(timerInterval:)`). الخادم يعيد حساب الدقيقة ويدفعها كل ثانيتين بأولوية عالية فتبقى حيّة ومتزامنة. **سبب التخلّي عن العدّاد الذاتي:** `Text(timerInterval:)` كان (١) يعرض صيغة الساعات فوق الدقيقة 60 («1:12:30» بدل «72'»)، (٢) يتأخّر دقيقةً كاملة بإزاحة `−1` في `clockStartEpoch`، (٣) يعجز عن تمثيل بدل الضائع — فيخالف رقم التطبيق. حقل `clockStartEpoch` باقٍ في `ContentState` (عقد APNs مشترك مع سبق/الخليج) لكنّ ويدجت الرياضي لا يقرؤه. العدّ التنازلي قبل الانطلاق (`Date()...kickoff`) باقٍ كما هو.

**القيود:** صور الشعارات لا تُحمَّل في Live Activity — نستخدم أوّل حرفين من اسم الفريق في شارة ملوّنة. متاح iOS 16.2+ وبشرط `areActivitiesEnabled`.

### الدفع عبر APNs (التطبيق مغلق) — الخادم (مبني مسبقًا)
- جدول `live_activity_tokens` (+عمود `bundle_id` للتوجيه متعدّد التطبيقات) — `shared/schema.ts`.
- نقطتان (عامّتان، تعملان للزوّار): `POST /api/v1/live-activity/register` (`{ fixtureId, token, bundleId }`) و`/live-activity/end` (`{ token }`).
- `liveActivityService.runLiveActivityCycle` (عامل `liveActivityWorker`، كل 5ث، قائد فقط، مع `ENABLE_BACKGROUND_WORKERS`): يبني الحالة من `worldCupService`+`sportmonksService`، يدفع عند تغيّر البصمة فقط، يُنهي عند النهاية، ويُلغي التوكنات الفاسدة.
- `apnsService.sendLiveActivityUpdate`: `apns-push-type=liveactivity` و`apns-topic=<bundleId>.push-type.liveactivity` — يستخدم `bundleId` المخزّن للتوكن (`com.sabq.sports`) بدل الافتراضي.

**تشغيل Production:** نفس مفتاح APNs المشترك + `ENABLE_BACKGROUND_WORKERS` (تعطيل: `LIVE_ACTIVITY_PUSH_ENABLED=false`). SQL الإنتاج: `ALTER TABLE live_activity_tokens ADD COLUMN IF NOT EXISTS bundle_id text;`. اختبار على جهاز حقيقي.

## 19. إخفاء شريط التبويب عند التمرير (`SpTabBarVisibility` + `.autoHideTabBar()`)

لتحرير مساحة القراءة: التمرير لأسفل يخفي الشريط السفلي، والتمرير لأعلى/قرب القمة يُظهره.
- حالة مشتركة `SpTabBarVisibility` (`@Observable` singleton، `hidden`) تُحقن في البيئة (`SabqSportsApp`).
- `RootTabView` يطبّق `.toolbar(hidden ? .hidden : .visible, for: .tabBar)` على التبويبات الخمسة.
- مُعدِّل `.autoHideTabBar()` (في `SportsComponents.swift`) يُطبَّق على الـScrollView الرئيسية لكل تبويب (روشن/البطولات/المباشر/الأخبار/حسابي)؛ يرصد اتجاه التمرير عبر `onScrollGeometryChange` (iOS 18+) ويحدّث الحالة بحركة `easeInOut`. قرب القمة (<36pt) يُظهر دائمًا، و`onAppear` يعيد الإظهار.
- **iOS 17:** بلا أثر (الشريط يبقى ظاهرًا) — `onScrollGeometryChange` متاح من iOS 18.

## ملاحظات تشغيل
- البناء: `xcodebuild -scheme SabqSports -destination 'platform=iOS Simulator,...'`.
- أتمتة النقر بالمحاكي (`cliclick`) غير دقيقة للأهداف الصغيرة/التنقّل العميق — اعتمد البناء + curl للـDTOs للتحقّق.
- تحذيرات SourceKit «Cannot find type Sp…» أثناء التحرير زائفة (فهرسة بين الملفات) — البناء الفعلي مرجع الحقيقة.
