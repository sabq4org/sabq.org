# خطة تطوير البوابة الرياضية — استعدادًا للموسم القادم

> صياغة أولى (2026‑06‑23). مبنية على الحالة الفعلية للبوابة بعد استكشاف `/sports`.
> مرجع مكمّل: [`SPORTS_DATA_SOURCES.md`](SPORTS_DATA_SOURCES.md) (أدوار المصادر) · [`MATCH_EVENT_ALERTS.md`](MATCH_EVENT_ALERTS.md).
> ترتيب التنفيذ يتبع [`AGENTS.md`](../AGENTS.md): backend → iOS (المرجع) → Android (1:1) → web.

## الرؤية
بوابة رياضية **حيّة لكل البطولات** (لا المونديال فقط)، بمركز مباراة موحّد وغني، وشخصنة قوية، وأداء عالٍ، وparity كامل بين المنصّات الثلاث — جاهزة لموسم 2026/27.

## الحالة الحالية (نقطة الانطلاق)
- **الصفحة المعتمدة:** `/sports` → `SportsDashboard` (تصميم Bento). مع صفحات: `/sports/matches`، `/sports/live`، `/sports/competition/:slug`، `/sports/team/:id`، `/sports/player/:id`.
- **ازدواج يجب حسمه:** `/sports8` (`Sports8` تجريبي) + `SportsHub.tsx` (legacy — صار مكتبة أنواع/مكوّنات لكنه يحمل صفحة كاملة غير مستخدمة).
- **المصادر:** API-Football (العمود الفقري، 34 دوريًا) + TheSports (لحظي، **المونديال فقط حاليًا**) + SportMonks (إثراء المونديال).
- **الفجوة الكبرى:** الطبقة اللحظية الفائقة (TheSports) **لا تصل البوابة العامة** — الدوري السعودي وغيره يعتمد على كاش API-Football الأبطأ.
- **منجز حديثًا:** تنبيهات أحداث المباريات على الويب (parity مع iOS)، إزالة «ما فاتك» (`/digest`).

---

## قسم كأس آسيا 2027 (السعودية) — مُنفَّذ (2026‑06‑23)

قسم جديد مستقلّ على `/asian-cup` بإبداع بصري أعلى من المونديال (هوية خضراء سعودية + لمسات ذهبية، عدّ تنازلي حيّ، هالة متوهّجة للوقو). **اللوقو:** `attached_assets/asian-cup-2027-emblem.png`، ومرتبط في الترويسة (`Header.tsx`) بجوار شعار المونديال (سطح المكتب + الجوال).

- **المعرّفات المؤكَّدة (فحص حيّ من المزوّدات):**
  - **API-Football:** `league=7` (AFC Asian Cup)، `season=2027` — **بيانات كاملة متاحة الآن**: 24 منتخبًا (منها السعودية id=23)، 36 مباراة بمجموعات مسحوبة تبدأ 2027‑01‑07 (الافتتاح: السعودية × فلسطين). **تنبيه:** نقطة `standings` تُرجع مجموعات **التصفيات** (`description: "Promotion - Asian Cup"`، فيها منتخبات غير متأهّلة) لا النهائيات — **لا تُستخدم**. بدلًا منها نبني مجموعات النهائيات + ترتيبها **حسابيًّا من الجدول** (`buildGroupsFromFixtures`: Union-Find على مباريات «Group Stage» → 6 مجموعات من 4؛ مجموعة السعودية = الكويت/عُمان/السعودية/فلسطين). الترتيب يُحسب من النتائج المنتهية فقط (قبل البطولة: تكوين بأصفار، شارة «لم تبدأ»).
  - **TheSports:** `competition_id` لكأس آسيا **غير مؤكَّد بعد** من الدعم — مُعلَّق؛ نعتمد API-Football الآن (وSportMonks لاحقًا للحظة الحيّة). البطولة في يناير 2027 فلا بيانات حيّة الآن (وضع معاينة/عدّ تنازلي ينقلب تلقائيًّا).
  - **كأس آسيا = كرة قدم حصرًا** (لا رياضات أخرى — تلك «دورة الألعاب الآسيوية» المختلفة، خارج باقتنا).
- **التعريب:** قاموس محلّي موثوق `server/services/asianCupNames.ts` (`AC_TEAM_AR` لكل الـ24 منتخبًا بمعرّف API-Football + `AC_VENUE_AR`/`AC_CITY_AR` لملاعب ومدن الاستضافة) — **لا يعتمد تعريب TheSports المحجوب**. أولوية: قاموس كأس آسيا → قاموس المونديال → الإنجليزي.
- **الباك‑إند:** `server/services/asianCupService.ts` (عميل API-Football، تعريب عبر `asianCupNames`، كاش SWR) → `getAcTeams`/`getAcFixtures`/`getAcStandings`/`getAcOverview` (عدّ تنازلي + مضيف + ملاعب من الجدول + تركيز السعودية). المسارات `server/routes/asianCup.ts` (`/api/asian-cup/{overview,teams,fixtures,standings}`) مُسجَّلة في `splitRoutesIndex.ts`.
- **الويب:** `client/src/pages/AsianCup.tsx` + `client/src/components/asiancup/*` (`AcHero` بعدّ تنازلي وهالة، `AcSaudiSpotlight`، `AcGroups` رشيق، `AcSchedule` بتبويب الجولات وتجميع يومي، `AcTeams` شبكة المنتخبات مع إبراز المضيف، `AcHostShowcase` ملاعب من الجدول، `AcMatchCard` مشترك). كله data-driven مع حالات فارغة لبقة.
- **مشاركة/SEO:** معالج هب في `server/routes/edgeMeta.ts` (`/^\/asian-cup\/?$/`) يحقن العنوان/الوصف + OG/Twitter + JSON-LD (CollectionPage + Breadcrumb). صورة المشاركة `public/branding/asian-cup-og-image.png` (1200×630، الشعار على هوية خضراء، نص عربي) — تُخدم من Railway عبر `/branding/*`. ميدلوير Pages يحقنها تلقائيًّا (`isInjectablePath('/asian-cup')=true`).
- **متبقٍّ:** (1) تأكيد `competition_id` كأس آسيا من TheSports ثم ربط overlay اللحظي (يعيد استخدام نمط المونديال). (2) صفحة منتخب/مركز مباراة لكأس آسيا إن لزم. (3) parity iOS/Android بعد استقرار الويب.

---

## المراحل

### المرحلة 0 — تثبيت الأساس وتنظيف الازدواج (P1)
**الهدف:** مصدر واجهة واحد لا لبس فيه قبل أي بناء جديد.
- حسم اللوحات: `SportsDashboard` هو المعتمد. ندمج أفضل أفكار `Sports8` فيه، ثم نحذف `/sports8` و`Sports8.tsx`.
- تحويل `SportsHub.tsx` إلى **مكتبة مكوّنات/أنواع فقط** (إزالة الـ default export الصفحة legacy غير المستخدمة).
- حسم `sabq-pulse-widget.html`: تنفيذه بـbackend حقيقي أو حذفه.
- **المنصّات:** web فقط. **المخاطر:** منخفضة (إزالة كود ميت).

### المرحلة 1 — تعميم الطبقة اللحظية لكل البطولات (P1 — أكبر رافعة)
**الهدف:** النتيجة/الأحداث/الإحصاءات الحيّة الفائقة (TheSports) في **كل** البوابة لا المونديال فقط.
- توسيع جسر TheSports خارج `WC_COMPETITION_ID`: ربط الدوري السعودي + دوري أبطال آسيا + الدوريات الأوروبية الكبرى (diary + مطابقة الوقت/الأسماء كما في المونديال).
- طبقة overlay عامة (نظير `overlayLiveScore`/`overlayLiveDetail`) داخل `saudiLeagueService`/`routes/sports.ts`.
- الالتزام بتسلسل المصادر الموثّق (TheSports ← API-Football).
- **فكرة محفوظة من `Sports8`: «نبض المباشر»** — شريط أفقي حيّ لمباريات العالم الجارية الآن (دقيقة لحظية + نبضة حمراء، تحديث 20ث). نُرحّله أعلى `/sports` كواجهة للطبقة اللحظية.
- **المنصّات:** backend أولًا، ثم تستفيد المنصّات الثلاث تلقائيًا (نفس DTO). **الاعتمادية:** إدراج عنوان Railway في TheSports + التأكد من تغطية TheSports للدوريات المستهدفة. **المخاطر:** متوسطة (جسر المطابقة لكل بطولة).

### المرحلة 2 — مركز مباراة موحّد وغني (P2)
**الهدف:** `MatchDialog` واحد يخدم المونديال والعام بنفس الجودة.
- توحيد مركز المباراة (الويب: `MatchDialog`/`MatchCenterDialog`، iOS: `WorldCupMatchCenter`) بتبويبات: مباشر · أحداث · إحصاءات · تشكيلات · H2H · توقعات.
- تغذية التبويبات حسب توفّر المصدر (لحظي من TheSports، عميق من SportMonks للمونديال، أساس من API-Football).
- **المنصّات:** backend → iOS → Android → web.

### المرحلة 3 — الشخصنة ودمج المحتوى (P2)
**الهدف:** تجربة «بوابتي».
- **متابعة البطولات** في الواجهة (الـAPI جاهز `kind:"competition"`، ينقص الزرّ) + إشعار «انطلاق الجولة/القمم».
- خلاصة «فِرقي/بطولاتي» مخصّصة أعلى `/sports`.
- دمج أخبار القسم الرياضي مع المباريات (خبر مرتبط بالمباراة/الفريق).
- **المنصّات:** backend خفيف + الثلاث.

### المرحلة 4 — العمق: اللاعبون والفِرق والمواسم (P3)
**الهدف:** صفحات مرجعية غنية.
- تعميق `SportsTeam`/`SportsPlayer`: إحصاءات موسمية، تاريخ، إصابات، انتقالات (حسب توفّر API-Football/SportMonks).
- ترتيبات وهدّافون تاريخيون، مقارنات.

### المرحلة 5 — المجتمع والتفاعل (P3)
**الهدف:** تفاعل يرفع البقاء.
- التوقعات (الجدول موجود — `sports_predictions`)، التصويت، لوحات المتصدرين، شارات.
- **فكرة محفوظة من `Sports8`: «تحدّى الجمهور»** — بطاقة gamification بارزة: نقاطك، إصاباتك التامّة، ترتيبك على لوحة المتصدّرين، واختيار سريع لمباريات اليوم لتوقّعها.

### المرحلة 6 — الأداء وSEO وparity الموبايل (P2 مستمر)
**الهدف:** سرعة + اكتشاف + اتساق.
- مراجعة caching للبوابة (HTTP/SWR/Redis) بلا تسميم CDN على المسارات الحيّة.
- SEO لصفحات البطولة/الفريق/اللاعب (عبر `edgeMeta.ts`/`seoInjector.ts`).
- parity أندرويد 1:1 مع iOS، وتدقيق الثيم الجديد.

---

## ترتيب البدء المقترح
`المرحلة 0` (تنظيف سريع) ← `المرحلة 1` (الطبقة اللحظية لكل البطولات — أعلى أثر لأولويتك «النتائج اللحظية») ← `المرحلة 2` (مركز المباراة) ← الباقي بالتوازي حسب الطاقة.

## نقطة التوقّف الحالية (2026-06-23)

**أُنجز ودُفع** (`441e63a`): المرحلة 0 (تنظيف الازدواج) + تنبيهات أحداث المباريات على الويب + إزالة «ما فاتك» + وثيقتا المصادر والخطة.

**المرحلة 1 — انفكّ العائق (2026‑06‑23):** زوّدنا TheSports رسميًا بـ`competition_id` للدوريات المطلوبة، وأكّدوا أن الأسماء تُجلب أثناء التجربة عبر نقطة **`Schedule and Results - date query`** (حقل `results_extra` يحوي `competition[]` و`team[]` بـ id+name). كما أن باقة **Basic Info** مضمّنة في الباقة المدفوعة بلا تكلفة إضافية.

- **المعرّفات محفوظة في الكود:** `TS_COMPETITION_IDS` في `server/services/theSportsService.ts` (روشن، النخبة الآسيوية، الإنجليزي، الإسباني، الإيطالي، الألماني، الفرنسي + المونديال).
- **آلية الأسماء:** `match/diary` يرجّع معرّفات فقط؛ نقطة `schedule/...` (date query) ترجّع `results_extra` بخريطة id→name للبطولات/الفِرق. نخزّنها مرّة (cache) ونعيد استخدامها.
- **القيد الزمني:** كل أوقات الـAPI بتوقيت **UTC+8**؛ date query يقبل timestamp من −30 إلى +30 يومًا ويرجّع نتائج 24 ساعة.

**المرحلة 1 — الباك‑إند مكتمل (2026‑06‑23):** عُمّم جسر TheSports وطبقة الـoverlay على البوابة بالكامل، خلف أعلام آمنة (أفضل جهد، تتراجع لـAPI-Football):

- **الجسر مُعمّم:** `match/diary` يُكاش خامًّا (كل البطولات) ويُشارَك؛ `resolveTsMatchId(fixtureId, kickoffTs, competitionId)` يفلتر على `competition_id` ثم يطابق وقت البداية بـ**تطابق فريد إلزامي** — أي التباس (مباريات متزامنة في نفس البطولة) → `null` فلا ربط خاطئ. `getTheSportsFastScore`/`getTheSportsMatchLive` صارا يقبلان `competitionId` (افتراضه المونديال للتوافق). مساعد `getTsCompetitionId(slug)`.
- **الـoverlay العام في `saudiLeagueService`:** `overlayLiveMatchDetail` (نتيجة + أحداث بأسماء معرَّبة + إحصاءات حيّة)، `overlayLiveBoardList` (today/live)، `overlayLiveFixturesForComp` (مركز مباريات البطولة). موصولة في `routes/sports.ts`: `/match/:id` و`/live` و`/today` و`/:comp/matches`.
- **النطاق:** يعمل فقط للبطولات الثماني المُدرَجة في `TS_COMPETITION_IDS` وأثناء اللعب فقط؛ المنتهية تبقى من API-Football (أحداث قابلة للنقر + تقييمات + معرّفات).
- **التنبيهات عُمّمت لكل البطولات المُدرَجة** (`collectTsLive` يحلّ `getTsCompetitionId(slug)` بدل فلتر `world-cup`) — هدف باسم الهدّاف/الصانع + بطاقة + فار لحظيًّا لروشن والنخبة الآسيوية والدوريات الأوروبية الخمسة، مع تراجع آمن لأحداث API-Football عند الالتباس/التعذّر.
- **«نبض المباشر» أُضيف أعلى `/sports`** (`LivePulse` في `SportsDashboard`) — شريط بطاقات أفقي للمباريات الجارية عبر كل بطولاتنا، نداء `/api/sports/live` كل 15ث، يظهر فقط عند وجود مباشر.

**ما تبقّى للمرحلة 1:** فضّ التباس المباريات المتزامنة بالأسماء عبر `results_extra` (date query) لاستعادة التغطية اللحظية في جولات الدوري المتزامنة (يحتاج إدراج IP الإنتاج للتجربة). **متطلّب تشغيلي عام:** إدراج IP الإنتاج (Railway egress) في قائمة TheSports لتفعيل الطبقة اللحظية فعليًّا.

**المرحلة 2 — إثراء مركز المباراة (ويب — 2026‑06‑23، قيد التجربة في dev):** قرّبنا مركز المباراة العام (`MatchDialog` في `SportsHub`) من ثراء مركز المونديال (`MatchCenterDialog`) بإضافة تبويبين من SportMonks:
- **الزخم (`/api/sports/match/:id/momentum`):** رسم الزخم الهجومي عبر الزمن + شريط استحواذ — مرآة لمونديال `getMomentum` عبر جسر الهوية (`resolveSportsSmId`)، مكوّن `SpMomentumView`.
- **التعليق (`/api/sports/match/:id/commentary`):** أبرز اللحظات معرَّبة الأسماء مع إبراز الأهداف — مرآة `getCommentary`، مكوّن `SpCommentaryView`.
- **مُجرَّب في dev:** القادسية 5:1 الاتحاد (روشن) → زخم 19 نقطة + استحواذ 65/35، تعليق 9 لحظات. أفضل جهد، يتراجع لحالة فارغة لبقة عند غياب تغطية SportMonks.
- **تبقّى للمرحلة 2:** توحيد المونديال على نفس `MatchDialog` (إزالة ازدواج `MatchCenterDialog`) عند الاستقرار؛ parity على iOS/Android. **ملاحظة:** جُمَل التعليق إنجليزية بأسماء عربية (سلوك `sportmonksService` الحالي المشترك مع المونديال) — تعريب الجُمَل الكامل مهمّة لاحقة (يحتاج ترجمة AI لكل سطر).

**تعريب أسماء TheSports (2026‑06‑23، التفعيل الكامل):** اللغة تُجلب عبر نقطة مرجعية `language/list` (لا باراميتر نداء): ترجّع لكل `id` كيان حقول `name_ar`/`name_en`... — `type`: 1‑category 2‑country 3‑competition 4‑team 5‑player 6‑injury. مزامنة بالصفحات أو تزايديًّا بـ`time` أو مستهدفة بـ`uuid`.
- **التطبيق:** `resolveTsNames(type, ids)` في `theSportsService` — يطلب بالـ`uuid` المستهدف فقط (لاعبو المباراة الحاليّون) لا القاموس الكامل، يُكاش 24س، أفضل جهد. مُفعَّل بـ`THESPORTS_LANG=ar`.
- **موصول:** أسماء اللاعب الرئيسي في الطبقة اللحظية (`mapTsEventsToSpl`) والتنبيهات (`detectTsEventAlerts`) — تُفضَّل أسماء المزوّد العربية عبر `player_id`، وتتراجع لتعريب `worldCupNameTranslator` (الذي يمرّر العربي أصلًا كما هو).
- **متطلّب التفعيل:** `THESPORTS_LANG=ar` + إدراج IP الإنتاج. **تبقّى:** توسيع لأسماء الصانع/التبديل (التقاط `assist1_id`/`in_player_id`/`out_player_id`)، وأسماء الفِرق/البطولات عند تبنّي تشكيلات/ترتيبات TheSports.

**إثراء المونديال — حالة التأهّل (2026‑06‑23، قيد التجربة في dev):** أضفنا حساب «حالة التأهّل» لجدول ترتيب المونديال — لا يحتاج TheSports (يُحسب من الترتيب + المباريات المتبقّية الموجودة عبر API-Football، قابل للتجربة الآن).
- **الحساب (`computeGroupQualification` في `worldCupService`):** brute‑force لكل احتمالات مباريات المجموعة المتبقّية (3^n)، وحُكم تحفّظي بالنقاط فقط (دون افتراض فارق أهداف): **متأهّل** = في كل سيناريو لا يسبقه/يساويه أكثر من منتخب · **خارج** = في كل سيناريو يسبقه منتخبان فأكثر · غير ذلك **في الصراع**. يقتصر على المركزين الأوّلين داخل المجموعة (سباق أفضل الثوالث مُؤجَّل).
- **الواجهة:** `getStandingsWithQualification` يُغذّي `/api/world-cup/standings` بحقل `qualifyStatus` لكل صف؛ `StandingsSection` يلوّن الصفوف (أخضر/كهرماني/أحمر) + مفتاح ألوان، ويعتم المُقصى. عند انتهاء دور مجموعة → `null` (الشجرة تتكفّل).
- **مُجرَّب في dev (الترتيب الحالي):** فرنسا+النرويج (6 نقاط) متأهّلان، السنغال+العراق (0) خارج؛ الأردن «خارج» بصحّة لأن توزيع المباريات المتبقّية يمنع بلوغه المركزين. typecheck نظيف.

**إثراء المونديال — قيمة الفريق + حقائق البطولة + الترتيب اللحظي (2026‑06‑23، مُجرَّب في dev، اشتراك فعلي):**

بعد تفعيل الاشتراك المدفوع وإدراج IP، فُحصت نقاط TheSports فعليًّا (من جهاز مُدرَج) واتّضحت الخريطة الدقيقة أدناه. بُنيت ثلاث ميزات تعتمد فقط نقاطًا **مُتحقَّق أنها تعمل**:

- **جسر الفرق بلا أسماء (`getWcTeamBridge` في `worldCupService`):** يطابق مبارياتنا (API-Football، `home.id/away.id`+timestamp) بمباريات TheSports (`match/recent/list` للموسم الحالي، `home_team_id/away_team_id`+`match_time`) عبر **تطابق وقت فريد** (±120ث)، فينكشف زوجا المعرّفين معًا. تصويت عبر كل مباريات المنتخب → اتجاه آمن. كاش 6س. **متحقَّق:** الأرجنتين→26، البرازيل→6، السعودية→23.
- **قيمة الفريق + التأسيس (`team/additional/list`):** `getWcTeamExtra` → حقل `extra` في `/api/world-cup/team/:id`؛ تُعرض في ترويسة صفحة المنتخب (`WorldCupTeam`): القيمة السوقية للتشكيلة + سنة التأسيس. **متحقَّق:** الأرجنتين €807.5M (1893)، السعودية €40.7M (1959).
- **حقائق البطولة (`competition/additional/list`):** `getWcCompetitionFacts` → نقطة جديدة `/api/world-cup/facts`؛ مكوّن `TournamentFacts` أسفل الهيرو: **حامل اللقب** (الأرجنتين، 3) + **الأكثر تتويجًا** (البرازيل، 5) + **الاستضافة** (الولايات المتحدة، كندا، المكسيك) — بأسمائنا وشعاراتنا عبر الجسر، وروابط لصفحات المنتخبات.
- **الترتيب اللحظي — تصويب توثيقي (2026‑07‑03):** ما ورد هنا سابقًا عن `getTsLiveStandings`/`overlayLiveStandings` كان **انجراف توثيق**: الدالة الأولى بقيت بلا أي مستدعٍ (حُذفت 2026‑07‑03) والثانية لم تُوجد قط. الترتيب اللحظي الفعلي يُحسب محليًّا من المباريات الجارية (`buildGroupStandings` + `applyProvisionalTable` في `server/services/liveStandings.ts`) ويعمل. مساري TheSports الصالحين إن أُعيد النظر: `season/recent/table/detail?uuid=<seasonId>` (دائم) و`table/live?competition_id=` (أثناء اللعب) — بنيتهما موثّقة في ذاكرة الجلسات والدوكس.

**خريطة نقاط TheSports (مصحَّحة 2026‑06‑23 برد الدعم الفني — «الخطأ كان مسارات غير صحيحة لا حجبًا»):**

كل ما كان يُظنّ «محجوبًا» كان بسبب **مسار خاطئ**. المسارات الصحيحة (مُتحقَّقة فعليًّا من جهاز مُدرَج):

| الحاجة | المسار الصحيح | الحالة |
|---|---|---|
| الترتيب اللحظي الكامل | `season/recent/table/detail?uuid=<seasonId>` | ✅ مُطبَّق |
| الترتيب أثناء المباراة | `table/live?competition_id=` | ✅ احتياط |
| إحصاء اللاعب لكل مباراة | `match/player_stats/detail?uuid=<matchId>` (BASIC DATA — Player statistics/historical matches) | ✅ يعمل (52 صفًّا) — مؤكَّد من الدعم 2026‑06‑24 |
| إحصاء الفريق لكل مباراة | `match/team_stats/detail?uuid=<matchId>` | ✅ يعمل |
| **إحصاء الفريق للموسم** | **`season/recent/team/stat?uuid=<seasonId>`** (ADVANCED DATA — Season team statistics/newest season) | ✅ مؤكَّد من الدعم 2026‑06‑24 (لم يُتحقَّق الشكل بعد — يلزم إدراج IP) |
| **تصنيف فيفا للرجال** | `ranking/fifa/men` | ✅ يعمل (الأرجنتين #1، إسبانيا #2 — `team.id` يطابق جسرنا) |
| الإصابات | `team/injury/list` | ✅ يعمل |
| قنوات البثّ | `match/tv/list?uuid=<matchId>` | ✅ يعمل |
| المدرب/الحكم/الملعب | `coach/list` · `referee/list` · `venue/list` (BASIC INFO) | ✅ يعمل |
| انتقالات/قيمة/قدرة اللاعب | `player/transfer/list` · `player/market/list` · `player/ability/list` | ✅ يعمل |
| ملف اللاعب (اسم/صورة/مركز) | **`player/with_stat/list`** (BASIC INFO) | ✅ مؤكَّد من الدعم 2026‑06‑23 (لم يُتحقَّق الشكل بعد — انظر ملاحظة عنوان dev) |
| القيمة السوقية للفريق/التأسيس | `team/additional/list` | ✅ مُطبَّق |
| حقائق البطولة | `competition/additional/list` | ✅ مُطبَّق |
| التعريب | `language/list` (مزامنة مُصفَّحة بلا uuid، الحقل العربي **`name_aa`**) | ✅ يعمل |

- **القيمة السوقية للاعب — صار المسار متاحًا (2026‑06‑23):** الدعم أكّد أن ملف اللاعب عبر **`player/with_stat/list`** (حزمة BASIC INFO، [الدوكس](https://www.thesports.com/docs/football#package:BASIC%20INFO,endpoint:Player)). مع `player/market/list`/`transfer/list`/`ability/list` العاملة، يكتمل بناء الميزة فور التحقّق من شكل الاستجابة وطريقة الربط (يُفضَّل المطابقة بالاسم الإنجليزي داخل المنتخب عبر `team_id`).
- **خلل مكتشف في تعريب الأسماء (PR #450):** `resolveTsNames` ينادي `language/list` بـ`uuid=` (مرفوض) ويقرأ `name_ar`، بينما الصحيح: **بلا uuid (مزامنة مُصفَّحة)** والحقل **`name_aa`**. الأثر صامت (يتراجع للنقل الصوتي). إصلاح منفصل مقترح: مزامنة دورية لقاموس `name_aa`.

**ميزات جاهزة للبناء فورًا (المسارات مؤكَّدة):** تصنيف فيفا على صفحة المنتخب/القسم (`ranking/fifa/men`) · الإصابات قبل المباراة (`team/injury/list`) · قنوات البثّ في مركز المباراة (`match/tv/list`) · إحصاء المباراة المفصّل (`match/player_stats/detail` + `match/team_stats/detail`).

**تأكيد الدعم لمسارَي الإحصاءات (2026‑06‑24):** بعد سؤالنا عن «إحصاء اللاعب لكل مباراة» و«إحصاء الفريق للموسم»، أكّد الدعم رسميًّا:
- **إحصاء اللاعب لكل مباراة** → `match/player_stats/detail` (BASIC DATA — *Player statistics (historical matches)*). نفس المسار المتحقَّق سابقًا (52 صفًّا).
- **إحصاء الفريق للموسم** → `season/recent/team/stat` (ADVANCED DATA — *Season team statistics (newest season)*). **مسار جديد** لم يكن في خريطتنا.
> الحقول التفصيلية في «sample responses» بالتوثيق (صفحة SPA لا تُقرأ آليًّا). **البناء محجوب على إدراج عنوان خروج الفحص `78.95.50.229` لدى TheSports** (5 خانات متاحة) لمعاينة شكل الاستجابة الحيّ قبل التنفيذ — يخدم أيضًا التحقّق من `bracket/season` (شجرة الأدوار).

**معاينة الأشكال الحيّة (2026‑06‑24 — بعد إدراج `78.95.50.229`، معرّف الموسم `e4wyrn4hgjzq86p`):**

1. **`bracket/season?uuid=<seasonId>`** → `results = { brackets[], groups[], rounds[], match_ups[] }`:
   - `rounds[]`: `{ id, bracket_id, group_id, name ("1/16 Finals"…), abbr (R32/R16/QF/SF/F/Third place), number }`.
   - `match_ups[]`: `{ id, round_id, number, type_id, state_id, home_team_id, away_team_id, winner_team_id, home_score, away_score, parent_ids[], children_ids[], match_ids[], note }`. معرّفات الفرق uuid (تُسمّى عبر `season/recent/team/stat` أو `language/list type4`).
   - **⚠️ قرار: لا نفعّل TheSports للـBracket الآن.** كل المواجهات (R32 → **النهائي**) مملوءة سلفًا بمنتخبين (`state_id=1`, `winner=""`, نتيجة 0-0) رغم عدم اكتمال المجموعات → **بذور/توقّعات للقرعة لا منتخبات محسومة**. عرضها يُظهر تأهّلات خاطئة. **المصدر يبقى API-Football** (`buildBracket` في `worldCupService` + `/api/world-cup/bracket`) الذي يُظهر الإقصائيات الرسمية فور نشرها. يُعاد النظر في استخدام TheSports للشجرة لاحقًا (مثلًا كشف تعبئة فعلية عبر `winner_team_id`/`state_id` المتقدّم، أو جسر `match_ids` لفتح مركز المباراة).
2. **`season/recent/team/stat?uuid=<seasonId>`** → `results[]` (48 منتخبًا)، كلٌّ: `team{id,name,logo}` (الشعار حقيقي من TheSports) + إحصاءات موسمية مسمّاة: `matches, goals, penalty, assists, yellow_cards, red_cards, shots, shots_on_target, dribble(_succ), clearances, blocked_shots, tackles, passes, passes_accuracy (عدد مكتمل لا نسبة), key_passes, crosses(_accuracy), long_balls(_accuracy), duels(_won), fouls, was_fouled, goals_against, interceptions, offsides, corner_kicks, ball_possession, freekicks, saves, big_chance_missed/created, aerial_won/lost, poss_losts…`.
3. **`match/player_stats/detail?uuid=<matchId>`** → `results[]` (≈52 صفًّا لكل مباراة)، كلٌّ: `{ player_id, team_id, first (1=أساسي), minutes_played, rating, goals, penalty, assists, shots, shots_on_target, passes, passes_accuracy, key_passes, dribble(_succ), tackles, interceptions, clearances, blocked_shots, duels(_won), fouls, was_fouled, offsides, dispossessed, saves, crosses, long_balls, aerial_won/lost, big_chance_missed/created… }`. أسماء اللاعبين عبر `language/list type5` (`name_aa`). الصفوف بقيم 0 (لم يشارك) تُسقط.

**مُنفَّذ ومتحقَّق حيًّا (2026‑06‑24):**

- **إحصاء المنتخب في البطولة (`season/recent/team/stat`):**
  - الخادم: `getTsSeasonTeamStats(seasonUuid)` في `theSportsService` (كاش 30د) → `getWcSeasonTeamStatsMap` (نداء واحد يخدم كل المنتخبات) + `getWcTeamSeasonStats(teamId)` في `worldCupService` (عبر الجسر، انتقاء ~15 بندًا مُعرَّبًا، حساب نسبة دقّة التمرير/الثنائيات). يُضاف `seasonStats` إلى `WcTeamProfile` (مسار `/api/world-cup/team/:id`).
  - الواجهة: قسم «إحصاء المنتخب في البطولة» في `WorldCupTeam.tsx` (شبكة بطاقات). **تحقّق حيّ:** الأرجنتين (مباراتان): 5 أهداف، 0 مستقبَلة، استحواذ 51%، دقّة تمرير 89%.
- **تقييم/إحصاء اللاعب لكل مباراة (`match/player_stats/detail`):**
  - الخادم: `getTsMatchPlayerStats(matchUuid)` في `theSportsService` (كاش 2د/30د) → `getWcMatchPlayerStats(fixtureId)` في `worldCupService` (جسر المباراة + إقران مضيف/ضيف + تعريب الأسماء `type5` مع احتياط اسم التشكيلة، إسقاط من لم يشارك، ترتيب بالتقييم). مسار جديد `/api/world-cup/match/:id/player-stats`.
  - الواجهة: تبويب «التقييمات» في `MatchCenterDialog` يستخدم TheSports **احتياطًا** عند غياب تقييمات API-Football (مكوّن `TsRatingsFallback`، مجموعة لكل فريق، شارة تقييم ملوّنة). **تحقّق حيّ:** المكسيك×ج.أفريقيا (كينونيز 8.5)، أمريكا×باراغواي (بالوغون 9.1، هدفان)، البرازيل×المغرب (فينيسيوس 8.0).
  - ملاحظة: لا نقر على بطاقة اللاعب في الاحتياط (لا يتوفّر معرّف API-Football هنا)، وبعض الأسماء بصيغة «العائلة، الاسم» من `name_aa`.

**مرجع توثيق TheSports:** https://www.thesports.com/docs/football · قائمة أخطاء API: https://www.thesports.com/helpcenter/3/58

**حسم اتصال الإنتاج بـTheSports (2026‑06‑23 — مُغلَق ✅):** ظهرت البيانات في dev لا في الإنتاج. بنقطة تشخيص مؤقّتة (`_tsdiag`، أُزيلت بعد الحسم) تبيّن: المفاتيح مضبوطة (`configured:true`) والمسار صحيح، لكن `ok:false` بسبب **`IP is not authorized`**. السبب الجذري: **عنوان خروج Railway غير ثابت** يتغيّر مع كل نشر (يفسّر «ظهور القيمة السوقية ثم اختفاءها» بين نشرين). **الحل:** تفعيل **Static Outbound IPs** على خدمة الـAPI (خطة Pro: Settings → Networking → Enable Static IPs → 3 عناوين) + إدراج **الثلاثة** لدى TheSports + إعادة نشر → `ok:true`. **تنبيه دائم:** لا تُغيَّر منطقة (Region) الخدمة لاحقًا — العناوين الثابتة تتغيّر بتغيّرها فتُعاد إدراجها.

## حالة التسليم (Handoff — 2026‑06‑23)

> لأي إيجنت يلتقط العمل: هذا ملخّص الحالة الحيّة وكيفية التحقّق وأين الكود.

- **الفرع:** `feat/sports-arabic-match-center` — آخر commit `b408ad9`. **مطلوب:** دمج الـPR إلى `main` (يُدمج تلقائيًّا — أُعيد بناؤه فوق آخر `main`). بعد الدمج تختفي أي بقايا تشخيص ويستقرّ كل شيء.
- **بيئة الإنتاج تعمل الآن:** اتصال TheSports `ok` بعد تثبيت Static Outbound IPs (انظر «حسم اتصال الإنتاج» أعلاه). لا تُغيَّر منطقة خدمة Railway.
- **بيانات الاعتماد للفحص اليدوي:** `THESPORTS_USER`/`THESPORTS_SECRET` على Railway. مثال نداء:
  `curl --ipv4 "https://api.thesports.com/v1/football/<path>?<params>&user=<U>&secret=<S>"`
- **⚠️ قائمة IP لدى TheSports محدودة السعة:** عند تثبيت عناوين Railway الثلاثة (2026‑06‑23) **أُزيل عنوان dev السابق `188.50.158.76`** — فالفحص المحلي/الـdev **لم يعد يصل TheSports** (يردّ «IP is not authorized»). للفحص اليدوي من جهازك: أعِد إدراج عنوان جهازك مؤقّتًا لدى TheSports (وقد يلزم حذف أحد العناوين بسبب الحدّ)، أو افحص من الإنتاج. **هذا يحجب التحقّق من `player/with_stat/list` حاليًّا.**
- **أين الكود:** خدمة المزوّد `server/services/theSportsService.ts` (نداء `tsGet`، وكيل IPv4، كاش `withSWR`، `getTsTeamExtra`, `getTsCompetitionExtra`, `resolveTsNames`). دمج المونديال `server/services/worldCupService.ts` (`getWcTeamBridge` جسر الفِرق، `getWcCompetitionFacts`, `getWcTeamExtra`). المسارات `server/routes/worldCup.ts`. الواجهة `client/src/pages/WorldCup.tsx` + `client/src/components/worldcup/*` + `client/src/pages/WorldCupTeam.tsx`.
- **ثوابت مفيدة:** `WC_COMPETITION_ID = kp3glrw7hwqdyjv` · موسم المونديال الحالي يُجلب من `competition/additional/list`.`curSeasonId`.
- **قبل أي push:** `npm run check` (نظيف حاليًّا) + تأكّد من الفرع (`git branch --show-current`).
- **التالي المُوصى به:** النقطة #1 (تصنيف فيفا) — لا تحتاج جسرًا جديدًا.

## النقاط القادمة (Backlog مُرتَّب — كلّ نقطة PR مستقل)

**جاهزة فورًا (المسارات مؤكَّدة وتعمل في الإنتاج الآن):**
1. ✅ **(مُنفَّذ ومتحقَّق حيًّا 2026‑06‑23)** **تصنيف فيفا للمنتخبات (`ranking/fifa/men`):** ترتيب المنتخب + النقاط + التغيّر (▲▼) في ترويسة صفحة المنتخب وبطاقات القسم. `team.id` يطابق الجسر مباشرة. **تحقّق حيّ:** الأرجنتين #1 (1877) ▲2 · إسبانيا #2 — · فرنسا #3 ▼2. — التفاصيل أدناه.
2. ✅ **(مُنفَّذ ومتحقَّق حيًّا 2026‑06‑23 — صفحة المنتخب فقط)** **الإصابات قبل المباراة (`team/injury/list`):** قائمة المصابين عبر الجسر بأسماء عربية. **قرار:** على **صفحة المنتخب** فقط (مركز المباراة من SportMonks، مبدأ #1). **تحقّق حيّ:** «نيمار سانتوس — إصابة في عضلة الساق». — التفاصيل أدناه.
3. ✅ **(مُنفَّذ ومتحقَّق حيًّا 2026‑06‑23)** **قنوات البثّ (`match/tv/list?uuid=<matchId>`):** «أين تُشاهد» في مركز المباراة — بُني معه **جسر معرّف المباراة** (النقطة 7). **تحقّق حيّ:** beIN SPORTS MAX 1/2 أولًا. — التفاصيل أدناه.
4. ⚠️✅ **(جزئي ومتحقَّق حيًّا 2026‑06‑23: إحصاء الفريق مُنفَّذ؛ إحصاء اللاعب مؤجَّل)** **إحصاء المباراة المفصّل (`match/team_stats/detail` + `match/player_stats/detail`):** إحصاء **الفريقين** يعمل (احتياط للمنتهية خلف SportMonks). **تحقّق حيّ:** المكسيك×جنوب إفريقيا استحواذ 60-40، تسديدات 16-3، دقّة تمرير 90-81%. إحصاء **اللاعب مؤجَّل** (متاح: `rating` + الحقول + الاسم العربي عبر name_aa — يلزم فقط UI). — التفاصيل أدناه.

5. ❌ **القيمة السوقية للاعب — مسدودة بقيود المزوّد (أُلغيت 2026‑06‑23):** التُقطت عيّنة خام من الإنتاج لـ`player/with_stat/list?team_id=<argUuid>` فعادت **لاعبين عالميين عشوائيين معتزلين** (روبن فان بيرسي، أشلي كول) بـ`team_id:""` و`market_value:0` — **النقطة تتجاهل فلتر `team_id` تمامًا** وتُرجع تفريغًا عالميًّا مُصفَّحًا (السلوك نفسه الذي رُصد سابقًا في `player/market/list` و`transfer/list`). لا سبيل لجلب تشكيلة منتخب، والمطابقة بالاسم ضد قاعدة عالمية تُنتج قيمًا خاطئة. **القرار:** أُزيل إثراء قيمة اللاعب بالكامل (`getTsTeamPlayers`/`getWcSquadMarketValues`/حقول `marketValue` في `WcSquadPlayer` + عرضها في `WorldCupTeam`). **القيمة السوقية للمنتخب (`extra.marketValue` من `team/additional/list`) تبقى وتعمل.** **إعادة التفعيل تحتاج:** مسار team→players حقيقي (تشكيلة/لاعبون باستعلام uuid لاعب)؛ نقاط lineup محجوبة. سجلّ الانتقالات يعتمد على uuid اللاعب → مسدود بالتبعية.

**ديون تقنية/تحسينات:**
6. ✅ **(مُصلَح ومتحقَّق حيًّا 2026‑06‑23)** **تعريب أسماء TheSports (PR #450):** التشخيص النهائي بعد الفحص الحيّ: **uuid يعمل لكن مفردًا لا متعدّدًا**، والحقل الصحيح **`name_aa`** لا `name_ar`. أُصلح `resolveTsNames`: نداء بـuuid واحد/طلب (تزامن محدود 6، سقف 80) + قراءة `name_aa` + إسقاط اشتراط `THESPORTS_LANG`. تحقّق حيّ: type5 → «نيمار سانتوس»، type2 → «إيطاليا». يفيد الطبقة اللحظية والتنبيهات والدوري السعودي أيضًا.
7. ✅ **(مُنفَّذ 2026‑06‑23 مع النقطة 3)** **جسر معرّف المباراة (API-Football matchId ↔ TheSports `uuid`):** `getWcMatchTsId` يطابق فريقي مباراتنا (عبر جسر الفِرق → uuid) بزوج فرق مباراة TheSports من `match/recent/list` (تطابق الزوج فريد، أدقّ من الوقت وحده)، الوقت كفاصل عند تكرار اللقاء. كاش بعد أول حلّ. جاهز لإعادة الاستخدام في النقطة 4.
8. **توحيد مركز المباراة:** دمج مركز المونديال (`MatchCenterDialog`) مع العام (`MatchDialog`) لإزالة الازدواج بعد الاستقرار.
9. **parity على iOS/Android** لكل ما سبق بعد استقرار الويب (iOS أولًا ثم Android 1:1).

**التجارة:** نبدأ شهرًا واحدًا بـAdvanced Data ($1000) — يشمل Basic+Advanced لكل 1970+ دوري — ثم ربع سنوي. لا نأخذ Live Match Tracker (ويدجت iframe، نبني واجهتنا).

## سجلّ تنفيذ النقاط الجاهزة (يبدأ 2026‑06‑23)

> **تحديث 2026‑06‑23 (بعد إدراج IP المطوِّر):** فُحصت كل النقاط حيًّا وصُحّحت البنى الفعلية (كانت تخمينية وخاطئة)، ثم تحقّقنا من المخرجات النهائية. **البنى الحقيقية المتحقَّقة:**
> - فيفا: `results` كائن فيه `items[]` · `team.id` · `ranking` · `points` · **`position_changed`** (موجب=صعد).
> - الإصابات: **`results[0].injury[]`** عناصرها `{player_id, reason(إنجليزي), injury_id, start_time, end_time, missed_matches}` — **لا اسم لاعب** (يُحلّ عبر `language/list type5` → **`name_aa`**).
> - البثّ: `results[0].tv = [{country_id, names[]}]` — لا روابط/شعارات؛ ضخم (≈216 قناة) فنُبرز beIN ونحدّ بـ6.
> - إحصاء الفريق: `results` كائنان بحقول **مسمّاة** (`ball_possession, shots, shots_on_target, passes, passes_accuracy, corner_kicks, fouls, offsides, yellow_cards, red_cards…`).
> - **`language/list` لا يدعم uuid متعدّدًا** (مفرد فقط) والحقل العربي **`name_aa`** (إصلاح PR #450).
> - الوحيد المحجوب فعلًا: `player/list` (ملف اللاعب: صورة) — لكن **الاسم متاح** عبر `language/list type5`.

### النقطة 1 — تصنيف فيفا (`ranking/fifa/men`) ✅ باك‑إند+ويب (2026‑06‑23)
- **الباك‑إند (`theSportsService.ts`):** `getTsFifaRanking()` → `Map<uuid, TsFifaRank{rank,points,change}>`، كاش 24س (`EXTRA_TTL`)، أفضل جهد. تحليل دفاعي لاسم الفريق (`team_id` | `team.id` | `team` نصّي)، والرتبة (`ranking` | `rank` | `position`)، والنقاط (`points` | `point` | `score`)، والتغيّر يُشتقّ من الترتيب السابق (`previous_ranking`/`prev_ranking`/`last_ranking`/`old_ranking`؛ موجب = صعد ▲) وإلا حقل صريح (`ranking_change`/`rank_change`/`change`). مساعد `pickNum`.
- **الجسر (`worldCupService.ts`):** `getWcTeamFifaRank(teamId)` عبر `getWcTeamBridge` (API-Football id → uuid) + `getTsFifaRanking`. أُضيف `fifaRank` إلى `WcTeamProfile`، و`getTeamsRanked()` يُثري قائمة المنتخبات بحقل `WcTeam.fifaRank` الاختياري (دون تلويث كاش `getTeams` الطويل).
- **المسار:** `/api/world-cup/team/:teamId` يرجّع `fifaRank`؛ `/api/world-cup/teams` يستخدم `getTeamsRanked`.
- **الويب:** شريحة «تصنيف فيفا #N» + سهم ▲/▼ ملوّن في ترويسة `WorldCupTeam.tsx`؛ شارة رقم رتبة صغيرة فوق شعار كل منتخب في `TeamsSection.tsx`.
- **⚠️ متبقٍّ:** تحقّق حيّ من أسماء حقول `ranking/fifa/men` واتجاه ▲▼ (هل الحقل الصريح موجب=صعود أم نزول؟) من جهاز مُدرَج. + parity iOS/Android لاحقًا (النقطة 9).

### النقطة 2 — الإصابات/الغيابات (`team/injury/list`) ✅ باك‑إند+ويب (2026‑06‑23)
- **قرار النطاق:** على **صفحة المنتخب** فقط. مركز المباراة يعرض الغيابات من SportMonks (`match-facts.absentees`)؛ مبدأ #1 (مزوّد واحد لكل بيانة) يمنع التكرار.
- **الباك‑إند (`theSportsService.ts`):** `getTsTeamInjuries(uuid)` → `TsInjury[]`، كاش 6س، أفضل جهد. تحليل دفاعي: معرّف/اسم اللاعب (`player_id`/`player_name`/`player.*`)، سبب نصّي (`reason`/`desc`/`description`)، معرّف نوع الإصابة (`type`/`injury_type`)، الحالة (`missing_type`/`status`)، وقت البداية/النهاية (`start_time`/`end_time`/`expected_end_time`).
- **الجسر (`worldCupService.ts`):** `getWcTeamInjuries(teamId)` عبر الجسر؛ الأسماء معرَّبة best-effort (i18n type 5 ثم `worldCupNameTranslator`)، ونوع الإصابة عبر i18n type 6، والحالة عبر قاموس `INJURY_STATUS_AR`، وتاريخ العودة بـ`Intl` (ميلادي/الرياض). **يُسقط أي صفّ بلا اسم قابل للعرض.** أُضيف `injuries` إلى `WcTeamProfile`.
- **الويب:** قسم «الإصابات والغيابات» في `WorldCupTeam.tsx` (بطاقة قائمة: اسم + سبب + حالة + تاريخ العودة) — يظهر فقط عند وجود إصابات.
- **⚠️ متبقٍّ + مخاطرة معروفة:** (1) أسماء حقول `team/injury/list` غير متحقَّقة حيًّا. (2) **اسم اللاعب هو نقطة الضعف:** نقطة ملف اللاعب محجوبة وتعريب i18n type 5 قد يكون معطوبًا (PR #450) — فإن لم يأتِ اسم في الرد ولا من i18n، **القائمة تظهر فارغة** (best-effort). يُحسَّن بعد إصلاح النقطة 6 وتأكيد مسار ملف اللاعب. + parity iOS/Android لاحقًا.

### النقطة 3 — قنوات البثّ (`match/tv/list`) + جسر معرّف المباراة (النقطة 7) ✅ باك‑إند+ويب (2026‑06‑23)
- **جسر معرّف المباراة (`worldCupService.ts`):** `getWcMatchTsId(fixtureId)` — يجلب مباراتنا (`getFixtures`) ويحلّ فريقيها عبر جسر الفِرق إلى uuid، ثم يطابق زوج الفرق في `getTsCompetitionMatchPairs` (وُسِّع ليُرجع `id` معرّف المباراة) — **تطابق الزوج فريد لكل مباراة** (لا التباس تزامن)، والوقت فاصل عند تكرار اللقاء. كاش بعد أول حلّ (`wcMatchIdBridge`).
- **الباك‑إند (`theSportsService.ts`):** `getTsMatchTv(matchUuid)` → `TsTvChannel[]`، كاش 6س، أفضل جهد. **الشكل متحقَّق من عيّنة إنتاج (2026‑06‑23):** `results[0].tv = [{ country_id, names:[..] }]` — نُسطّح أسماء القنوات لكل الدول، نُزيل التكرار بالاسم، **نُبرز beIN أولًا** (صاحب حقوق المونديال في الخليج/الشرق الأوسط) ونحدّ الناتج بـ6 قنوات لتفادي الضجيج العالمي. لا روابط/شعارات/أسماء دول في الرد (نتركها `null`). و`getWcMatchTv(fixtureId)` يجمع الجسر + الجلب.
- **المسار:** `/api/world-cup/match/:id/tv` → `{ available, channels }` (كاش طويل، القنوات شبه ثابتة).
- **الويب:** مكوّن `MatchTvSection` (شريط شرائح: اسم القناة) بين ترويسة `MatchCenterDialog` والتبويبات، **للمباريات غير المنتهية فقط**، يختفي عند غياب قنوات.
- **⚠️ متبقٍّ:** (تحسين) ربط `country_id` باسم دولة عربي لعرض القناة الخليجية تحديدًا (يحتاج قاموس دول i18n موثوق — النقطة 6). + parity iOS/Android لاحقًا.

### النقطة 4 — إحصاء المباراة المفصّل (`team_stats` + `player_stats`) ⚠️ جزئي (2026‑06‑23)
- **قرار النطاق:** إحصاء **الفريق** فقط الآن (خالٍ من أسماء اللاعبين، آمن). إحصاء **اللاعب مؤجَّل** — يعتمد على اسم اللاعب وهو العائق المؤكَّد نفسه (نقطة ملف اللاعب محجوبة، النقطة 5) فلا قيمة لشبكة أرقام بلا أسماء.
- **الباك‑إند (`theSportsService.ts`):** `getTsMatchTeamStats(matchUuid)` → `TsTeamStat[]{type,home,away}` عبر جسر المباراة، كاش 2د/30د. **أعلى عدم يقين:** **بنية الرد** مجهولة (لا مجرّد أسماء حقول)؛ `parseTeamStats` يحلّل ثلاثة أشكال محتملة (مصفوفة صفوف / كائن `.stats` / `{home:[],away:[]}`).
- **الجسر (`worldCupService.ts`):** `getWcMatchTeamStats(fixtureId)` → `WcStatistic[]`؛ يُسمّي **الأكواد المعروفة تجريبيًّا فقط** (`TS_TEAM_STAT_MAP`: استحواذ٪/تسديدات على‑خارج المرمى/هجمات/خطرة/ركنيات/بطاقات) ويُسقط المجهول لتفادي تسمية خاطئة، ويُسقط الإحصاء الصفري للطرفين.
- **المسار:** `/api/world-cup/match/:id/stats` → `{ available, team }`.
- **الويب (`StatsTab`):** أُدخل إحصاء TheSports المفصّل في سلسلة الأولوية **للمباريات المنتهية**: SportMonks ← **TheSports المفصّل** ← API-Football (لا تكرار، يملأ الفجوة فقط). لا تغيير على سلوك المباشر (TheSports اللحظي يبقى الأول).
- **⚠️ متبقٍّ:** (1) تحقّق حيّ من **بنية** `match/team_stats/detail` (الأهم) وتوسيع `TS_TEAM_STAT_MAP` بأكواد إضافية (تمريرات/تسديدات كلية/تسلّل…) بعد رؤية الرد. (2) **إحصاء اللاعب** بعد تأكيد مسار ملف اللاعب وإصلاح النقطة 6. + parity iOS/Android.

## مبادئ ملزمة أثناء التنفيذ
1. مزوّد واحد لكل بيانة (مصفوفة `SPORTS_DATA_SOURCES.md`) — لا تداخل.
2. كل تغيير backend ينعكس على الثلاث بنفس DTO قدر الإمكان.
3. iOS هو المرجع البصري للأندرويد؛ الويب مستقل بصريًا، متطابق وظيفيًا.
4. كل نداء مزوّد «أفضل جهد» (حالة فارغة لبقة، لا عطل).
5. لا توسيع نطاق داخل PR واحد — كل مرحلة/مهمة في PR مستقل.
