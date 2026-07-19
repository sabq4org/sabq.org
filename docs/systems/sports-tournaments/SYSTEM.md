# البوابة الرياضية والبطولات (`sports-tournaments`)

> آخر مراجعة: 2026-07-19 (أداء لوحات المباريات) | المالك: sports
>
> **تغيير العقد (ودّيات):** slug `club-friendlies` يعرض أندية سعودية فقط — انظر القسم أدناه.

## الغرض
تغطية البطولات، المجالس، الفانتازي، أخبار Sportmonks، Snaps، والاستخبارات الرياضية.

## مفاتيح AI (حصرية)
`world-cup-news`, `sportmonks-news`, `kings-cup-news`, `saudi-league-story`, `saudi-league-preview`, `sports-names`, `sports-snaps`, `sports-intel-trends`, `sports-intel-prediction`, `sports-intel-scene`, `sports-intel-digest`, `sports-intel-copilot`, `sports-intel-match-pre`, `sports-intel-match-live`, `sports-intel-match-post`

## تكلفة النماذج (2026-07-19)
- تقارير/معاينات الدوري السعودي ولقطات VARA ومشهد/توجّهات الاستخبارات: **GPT-4o mini**.
- أخبار البطولات (مونديال / SportMonks / كأس الملك) و digest/copilot وبطاقات live/post: تبقى سلسلة تحريرية أقوى (Sonnet → GPT-5.1).
- يمكن تغيير النموذج من `/dashboard/ai-hub` لكل feature بعد seed الصفوف الجديدة.

## الحدود
- توقعات البطولات الجديدة عبر `predictions-core` — لا محركات جديدة.
- كأس العالم 2026 يبقى على `wc*` legacy حتى نهاية البطولة.

## أداء مركز المباراة
- مهلة SportMonks الافتراضية `SPORTMONKS_HTTP_TIMEOUT_MS` ≈ 3500ms (فشل سريع بدل 15ث).
- TheSports: لا إعادة محاولة بعد timeout (كانت تضاعف الانتظار إلى ~8ث).
- تسخين دقيقة للمباريات الساخنة يشمل إثراء SM (facts/xg/momentum/…).
- تطبيق SabqSports: إثراء ثقيل حسب التبويب لا دفعة واحدة عند الفتح.

## أداء لوحات المباريات (ويب) — 2026-07-19
- `/api/sports/summary` كان يضرب `getFixtures` لكل بطولة (مسار بارد ~20ث) ويزاحم حدّ AF أمام today/live.
- الموجز v4: عدّاد اليوم/المباشر من لوحات `getGlobalToday/Live` مرّة واحدة؛ ودّيات بلا جدول موسم؛ تسخين دوري؛ الواجهة تؤجّل summary حتى يكتمل today+live.
- **سبب بطء الودّيات:** دمج اللحظية استدعى `getTheSportsLiveBoard` (إثراء كل مباريات العالم + diary + أسماء فرق) على نبض `/live` بلا كاش لوحة — فيحبس today/live.
- الإصلاح: `getTheSportsSaudiFriendlyLiveBoard` (ودّيات سعودية فقط + كاش 8ث) + ميزانية 450ms على اللوحات؛ overlay لا يعيد الجلب للودّيات التي دُمجت live؛ نبض الواجهة 12ث.

## أداء VARA (SabqSports) — 2026-07-18
- روشن `HomeView`: كشف تدريجي — مباريات+ترتيب يفتحان اللوحة، ثم إثراء (هدافون/انتقالات/…).
- مركز المباريات: `defer { loading = false }` حتى لا يبقى الدوران بعد إلغاء/اختيار يتيم.
- انتقالات عالمية: `loadedGlobal` يُرفع عند الفشل أيضًا + قائمة Lazy مسطّحة.
- `ignoreCache` للاستطلاع فقط أثناء مباراة جارية؛ SSE/فريقي لا يكسران الكاش بلا داعٍ.
- عالمية/بطولات: لا شاشة دوران كاملة إن وُجدت بيانات سابقة/مفضّلات.

## بطولات الجدول (VARA)
- ديفولت أول تثبيت: `pro-league`, `world-cup`, `kings-cup`, `uefa-super-cup`, `la-liga`, `premier-league`.
- ورقة الإعداد: زر «إلغاء التحديد» يفرّغ المفضّلة؛ لا إعادة إلحاق تلقائي بعد الإلغاء.

## ودّيات الأندية السعودية (2026-07-19)
- slug: `club-friendlies` (API-Football league ≈ 667).
- تُعرض فقط مباريات فيها نادٍ من `SAUDI_CLUB_TEAM_IDS` (روشن + يلو + سيدات) — **ليس** كل Club Friendlies العالمية ولا ودّيات المنتخبات (league 10).
- الحقن من `fixtures?date=` / `live=all` عبر `isSaudiClubFriendlyRow` في `saudiLeagueService`؛ استثناء ضيّق من فلتر الضجيج `NOISE_LEAGUE_RE`.
- VARA: `club-friendlies` ضمن `saudiSlugs`؛ أندية يلو مضافة إلى `saudiTeamIds`.
- **لحظية:** API-Football كثيرًا يبقى على `NS` بعد الانطلاق في الودّيات. نستثني ودّيات الأندية السعودية من ضجيج لوحة TheSports، ونُركّب النتيجة/الحالة بالأسماء على مركز المباراة ولوحة اليوم/المباشر.
- **Dedup ويب:** `/sports/matches` يدمج today+live؛ ودّية قد تظهر بمعرّف AF وبمعرّف TheSports سالب — الدمج يطابق بالموعد+الأسماء ويبقي معرّف AF للروابط.

## مركز الانتقالات (سعودية مؤكّدة)
- مصدر أساسي: API-Football عبر `getLeagueTransfers` — افتراضي `since=4` أشهر (لا 18).
- احتياطي فوري: SportMonks `transfers/teams/{id}` لكل فرق روشن (لا الفيد العالمي `/transfers` — تغطيته السعودية شبه معدومة).
- الدمج في `GET /api/sports/transfers`. تبويب «مؤكّدة» يستبعد الإعارات من العرض.
- VARA/الويب: ترقيم عرض (Lazy + «عرض المزيد») لتقليل ثقل التمرير.

## عند التعديل
- [ ] قرأت هذا الملف
- [ ] إن لمس التوقعات: اقرأ أيضاً `predictions-core/SYSTEM.md`
