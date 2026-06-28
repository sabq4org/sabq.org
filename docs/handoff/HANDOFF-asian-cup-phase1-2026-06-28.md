# تسليم — كأس آسيا 2027: المرحلة 1 (نقاط API-Football الإضافية + استهلاكها في iOS)

**التاريخ:** 2026-06-28 · **النطاق:** Backend + iOS · **الحالة:** منجز ومُختبَر محليًّا، **غير منشور** بعد.

---

## السياق

البطولة في يناير 2027 (وضع ما قبل الانطلاق). الترتيب وفق `AGENTS.md`: **backend → iOS (المرجع) → Android → web**.
مصدر البيانات: API-Football (`league=7, season=2027`) — لا اشتراك خارجي جديد. الأمور التحريرية/التقارير **مؤجّلة بطلب المالك**.

---

## ✅ ما تم تنفيذه

### الخادم
- **`server/services/asianCupService.ts`** — دوال جديدة:
  - `getAcTopScorers()` — أعلى 10 هدّافين (أهداف/صناعة/ركلات جزاء/دقائق/مباريات).
  - `buildAcBracket()` + `getAcBracket()` — شجرة الأدوار الإقصائية من جدول المباريات (دور الـ16 ← النهائي)؛ فارغة قبل القرعة وتُملأ تلقائيًّا.
  - `getAcSquad()` + `getAcCoach()` + `getAcTeamProfile()` — صفحة المنتخب: الهوية + المجموعة + المباريات + القائمة + المدرّب.
  - `getAcMatchDetail()` + `getAcHeadToHead()` — تفاصيل المباراة بنداء `fixtures?id=` واحد: أحداث + تشكيلات + إحصاءات + تقييمات + أفضل لاعب + مواجهات، مع **توقّع داخلي** (نموذج Elo من `asianCupRatings`) للمباريات القادمة. كاش متكيّف (حيّة 20ث / قُبيل الانطلاق 60ث / غيرها 5د).
  - **إثراء ثنائي اللغة:** أُضيف `nameEn` (الاسم الأصلي اللاتيني) بجانب `name` (العربي) في الهدّافين/القائمة/الأحداث/التشكيلات/التقييمات لاحترام بقية اللغات.
- **`server/routes/asianCup.ts`** — أربع نقاط عامة (بلا مصادقة، خلف نفس `guard`):
  - `GET /api/asian-cup/scorers`
  - `GET /api/asian-cup/bracket`
  - `GET /api/asian-cup/team/:id`
  - `GET /api/asian-cup/match/:id` (Cache-Control يختلف حسب حالة المباراة)
- `npm run check` (tsc) ✅ نظيف.

### iOS (`asian-cup app ios/`)
- **`Services/AsianCupModels.swift`** — نماذج `Decodable`: `AcScorer`, `AcBracket`/`AcBracketRound`, `AcTeamProfile`/`AcSquadPlayer`, `AcMatchDetail` (+`AcMatchEvent`,`AcLineup`,`AcLineupPlayer`,`AcStatistic`,`AcPlayerRating`,`AcMatchPrediction`) + دوال `APIClient`: `fetchAcScorers/Bracket/TeamProfile/MatchDetail`.
- **`Services/AcLocalization.swift`** — مساعد `LName(ar, en)`: العربية → النقل الصوتي العربي، بقية اللغات → الاسم اللاتيني.
- **`Components/AsianCupComponents.swift`** — إثراء `AcMatchDetailSheet` (تحميل التفاصيل + تحديث لحظي للنتيجة) ومكوّنات جديدة: `AcPredictionBarsCard`, `AcManOfMatchCard`, `AcEventsTimelineCard`, `AcStatisticsCard`, `AcRatingsCard`, `AcLineupsCard`, `AcHeadToHeadCard`, `AcInlineLoading`, `AcDetailCard`, `AcDetailSectionTitle`.
- **`Screens/AsianCupView.swift`** — شاشات جديدة: `AcScorersScreen`, `AcBracketScreen`, `AcTeamProfileScreen` (+`AcSquadSection`) + `AcMoreHub` (مدخل من تبويب «المزيد»). جُعلت `AcTeamChip` و`AcGroupRow` روابط تنقّل عبر `NavigationLink(value: AcTeam)` مع `navigationDestination(for: AcTeam.self)` في شاشات المجموعات/المزيد/الهدّافين.
- **i18n:** 173 مفتاحًا **متطابقة** في `ar.json`/`en.json`/`fa.json` (تحقّق آلي بلا فروقات).
- البناء: `xcodebuild ... AsianCup` ✅ نجح (iOS 17 target, iPhone 17 Pro sim).

### التحقق الفعلي (محليًّا)
شُغّل `npm run dev` (المنفذ 5050، مفتاح `APIFOOTBALL_KEY` من `.env.local`) ووُجّه التطبيق إليه مؤقتًا:
- `team/23`: السعودية + المدرّب «روبرتو مانشيني» + المجموعة الأولى + المباريات. ✅
- `scorers`: بيانات حقيقية بأسماء ثنائية اللغة (`نجوين فان في` / `Nguyễn Văn Vĩ`). ✅
- `bracket`: `{rounds: []}` (متوقّع قبل القرعة). ✅

> كل التعديلات المؤقتة (URLConstants → localhost، استثناء ATS في Info.plist، تبديل تبويب البداية) **أُعيدت**، وأُعيد البناء بنجاح بعد الإرجاع. خادم التطوير أُوقف.

---

## ⏳ ما تبقّى

### نشر (قرار مطلوب)
- تطبيق iOS يستهلك `https://api.sabq.org` (الإنتاج). النقاط الأربعة الجديدة **لم تُنشر على Railway** بعد → تظهر البيانات محليًّا فقط.
- المطلوب: PR لتغييرات الخادم (المرحلة 1) → نشر Railway، ثم PR منفصل لتغييرات iOS. (لا دمج مباشر إلى `main`.)

### بقية المنصّات
- **Android-native:** مطابقة 1:1 للشاشات الأربع (تفاصيل المباراة، الهدّافون، الشجرة، صفحة المنتخب) بعد نشر الخادم.
- **Web:** نفس الميزات بتصميم الويب المستقل.

### مؤجّل لاعتماد خارجي (المرحلتان 2/3)
- النتائج/الدقائق الحيّة، الزخم، التعليق، التقييمات الحيّة، تصنيف فيفا، أسماء المزوّد متعددة اللغات — موقوفة على تأكيد `competition_id`/`season_id` (TheSports) و`league_id` (SportMonks) + الاشتراك + IP allowlist. الخطّافات جاهزة للوصل فور تأكيد المعرّفات.
- الأمور التحريرية والتقارير — مؤجّلة بطلب المالك.

### ملاحظات
- أسماء منتخبات التصفيات (خارج الـ24 النهائية) تظهر إنجليزية لأنها غير مُعرّفة في `teams.json` — مقبول؛ الـ24 النهائية مُعرّبة.
- أسماء اللاعبين تأتي معرّبة عربيًّا من الخادم + `nameEn` للغات الأخرى. الأسماء متعددة اللغات «الأصيلة» من المزوّد جزء من المرحلة 2.

---

## ملفات مُعدَّلة رئيسية
```
server/services/asianCupService.ts      (دوال + nameEn)
server/routes/asianCup.ts               (4 مسارات)
asian-cup app ios/AsianCup/Services/AsianCupModels.swift
asian-cup app ios/AsianCup/Services/AcLocalization.swift   (LName)
asian-cup app ios/AsianCup/Components/AsianCupComponents.swift
asian-cup app ios/AsianCup/Screens/AsianCupView.swift
asian-cup app ios/AsianCup/Localization/{ar,en,fa}.json    (173 مفتاحًا)
```
