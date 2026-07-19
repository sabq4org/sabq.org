# نظام التوقّعات في تطبيق سبق الرياضي (Sabq Sports Predictions)

> مرجع شامل لنظام التوقّعات المتطوّر (بركة متدرّجة مشتركة / pari-mutuel) المعمّم على
> كل بطولاتنا. آخر تحديث: 2026-06-29.
> الفرع: `feat/sports-matches-tab-wc-center`.

---

## 1) الفكرة العامة

نظام توقّعات مستوحى من نظام «خليجي 27» في الويب، لكنه **معمّم على كل البطولات**
بدل بطولة واحدة. لكل مباراة **بركة 1000 نقطة** (+ جاكبوت متراكم للبطولة نفسها)
تُقسَّم على ثلاث طبقات وتُوزَّع بالتساوي على فائزي كل طبقة:

| الطبقة | الشرط | النصيب |
|--------|-------|--------|
| 🎯 النتيجة الدقيقة | إصابة النتيجة بالضبط (مثال 2-1) | 50٪ = 500 نقطة |
| 📏 الفارق الصحيح | إصابة فارق الأهداف + اتجاه النتيجة | 30٪ = 300 نقطة |
| ✅ النتيجة الصحيحة | إصابة الفائز/التعادل فقط | 20٪ = 200 نقطة |

قواعد إضافية:
- **كلّما قلّ المصيبون في طبقتك زاد نصيبك** (تُقسَّم الطبقة بالتساوي على فائزيها).
- **جاكبوت متراكم**: إن لم يُصب أحدٌ طبقةً، تتراكم نقاطها (+ بواقي القسمة الصحيحة)
  للمباراة التالية في **نفس البطولة**.
- **النتيجة المقلوبة لا تفوز**: يُحتسب الفائز حسب إشارة (home − away)؛ توقّع 1-2
  لا يُكافأ على مباراة انتهت 2-1.
- منطق التسجيل مُعاد استخدامه حرفيًا من `gulfCupPredictionScoring`
  (`scoreTier` / `distributePool` / `shareForTier`).

> التوقّعات للمتعة والمنافسة فقط — لا رهان ولا مقابل مادّي. الأرباح نقاط ولاء
> تُضاف لمحفظة العضو.

---

## 2) البطولات المشمولة

التوقّعات محصورة في هذه البطولات فقط (قائمة مسموح بها):

- **كأس العالم** (`world-cup`)
- **دوري أبطال آسيا للنخبة** (`afc-champions-league`)
- **كأس الخليج / خليجي 27** (`gulf-cup`)
- **كل البطولات السعودية** (أي بطولة `category === "saudi"`: دوري روشن
  `pro-league`، كأس الملك `kings-cup`، السوبر `super-cup`، الدرجات، دوري السيدات…)

الدوريات الأوروبية/العالمية الأخرى **غير قابلة للتوقّع**. القائمة موحّدة بين:
- الباكند: `PREDICTION_COMP_SLUGS` + `isPredictionComp()` في `sportsPoolPredictionsService.ts`.
- iOS: `SpLongPredictionsView.longCompSlugs` في `PredictionExtras.swift`.

---

## 3) قواعد العرض والتوقيت (مهمة)

- **المباريات**: تظهر للتوقّع فقط ضمن **48 ساعة** قبل انطلاقها. (نجلب 3 ألواح
  أيام `riyadhDateKey(0..2)` ونقصّ على `now + 48h`.) المباريات الأبعد تظهر تباعًا
  حين تدخل نطاق الـ48 ساعة.
- **البطل / الهدّاف (توقّعات طويلة المدى)**: تبقى مفتوحة طوال الأدوار الأولى
  وتُقفل عند **انطلاق ربع النهائي (دور الثمانية)**. الكشف عبر اسم الجولة المعرّب
  (`isLateStageRound`: «ربع النهائي» فما بعدها). الدوريات (بلا أدوار إقصائية)
  تُقفل عند انتهاء الموسم (كل المباريات منتهية). لكل بطولة بركة منفصلة 5000
  للبطل و5000 للهدّاف.
- **الأرقام**: كل الأرقام في واجهة التوقّعات بالصيغة الغربية (مثل `7656`، `50٪`،
  `خليجي 27`) — لا أرقام عربية-هندية مكتوبة يدويًا.

---

## 4) معمارية الباكند

### الخدمة الرئيسية
`server/services/sportsPoolPredictionsService.ts` — تملك كل استعلامات Drizzle
(حسب ADR-001، وحدة الـ routes لا تستورد `db`). أهم الدوال:

- `submitPrediction(userId, input)` — حفظ/تحديث توقّع، تجميد احتمالات النموذج وقت الإرسال.
- `getUpcomingPredictableMatches(userId?)` — مباريات الـ48 ساعة المسموح بها + إحصاءاتي + الجاكبوت.
- `getMyPredictions(userId)` — توقّعاتي (مفلترة على البطولات المسموح بها).
- `getLeaderboard(limit)` — لوحة المتصدّرين.
- `getMatchPredictionsSummary(fixtureId)` — ملخّص توقّعات مباراة.
- `getMeStats(userId)` — نقاط/صحيحة/دقيقة/سلسلة/ترتيب/شارات.
- `settleFinishedMatches()` — محرّك التسوية: تسجيل الطبقات، توزيع البركة، ترحيل الجاكبوت، منح نقاط الولاء والشارات (idempotent عبر `settledAt`).
- `getLongPredictions(slug, userId?)` / `submitLongPrediction(...)` — البطل/الهدّاف.
- `isSportsPredictionsEnabled()` — فلاغ `SPORTS_PREDICTIONS_ENABLED`.

ثوابت رئيسية:
- `POOL_BASE = 1000`، `LONG_POOL = { champion: 5000, top_scorer: 5000 }`.
- `PREDICTION_COMP_SLUGS = { world-cup, afc-champions-league, gulf-cup }` + `category==="saudi"`.
- `PREDICTION_WINDOW_SEC = 48h`.

### مصدر بيانات المباريات
من API-Football عبر `saudiLeagueService`:
- لوحة اليوم: `getGlobalTodayFixtures(dateKey)` (مفلترة على معرّفات دورياتنا).
- تفاصيل المباراة عند التسوية: `getMatchDetail`.
- احتمالات المباراة: `getFixturePrediction` (مع fallback محايد 40/27/33).
- للبطولات طويلة المدى: `getCompetition` / `getFixtures` / `getStandings`.

### النقاط (Bearer — للموبايل)
`server/routes/mobileApiRoutes.ts` تحت `/api/v1/sports/predictions/*` مع
`verifyMemberSession` (Bearer token) وفلاغ الميزة (يرجّع 503 إن كانت معطّلة):
- `GET  /today` — المباريات + إحصاءاتي + الجاكبوت.
- `POST /submit` — حفظ توقّع.
- `GET  /mine` — توقّعاتي.
- `GET  /leaderboard` — المتصدّرون.
- `GET  /match/:fixtureId` — ملخّص مباراة.
- `GET  /long?comp=slug` — البطل/الهدّاف.
- `POST /long` — حفظ توقّع البطل/الهدّاف.

> الموبايل يستخدم Bearer (`/api/v1`) — وليس جلسات Passport الخاصة بالويب.

### الجوب (Cron)
`server/jobs/sportsPredictionsJob.ts` — يستدعي `settleFinishedMatches()` ضمن
دورته (مع leader election حتى لا يعمل على أكثر من نسخة).

### الولاء
`shared/loyalty.ts` — أُضيف `SPORTS_PREDICTION_WIN` و`SPORTS_LONG_PREDICTION_WIN`.

---

## 5) جداول قاعدة البيانات (Drizzle — `shared/schema.ts`)

أربعة جداول جديدة (إضافية فقط، لا تمسّ جداول قائمة):

| الجدول | الغرض |
|--------|-------|
| `sports_pool_predictions` | توقّعات المستخدمين لكل مباراة (النتيجة، الطبقة، النقاط، pickProb) |
| `sports_pool_matches` | حالة كل مباراة (الاحتمالات المجمّدة، حساب البركة/الجاكبوت، التسوية) |
| `sports_pool_long` | توقّعات طويلة المدى لكل بطولة (champion / top_scorer) |
| `sports_pool_badges` | الإنجازات المكتسبة |

### SQL للإنشاء على الإنتاج (idempotent)

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS sports_pool_predictions (
  id             varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id     integer NOT NULL,
  user_id        varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pred_home      integer NOT NULL,
  pred_away      integer NOT NULL,
  status         text NOT NULL DEFAULT 'pending',
  tier           text NOT NULL DEFAULT 'none',
  outcome_hit    boolean NOT NULL DEFAULT false,
  margin_hit     boolean NOT NULL DEFAULT false,
  exact_hit      boolean NOT NULL DEFAULT false,
  points_awarded integer NOT NULL DEFAULT 0,
  pick_prob      integer NOT NULL DEFAULT 0,
  created_at     timestamp NOT NULL DEFAULT now(),
  updated_at     timestamp NOT NULL DEFAULT now(),
  settled_at     timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sp_pool_pred_fixture_user ON sports_pool_predictions (fixture_id, user_id);
CREATE INDEX IF NOT EXISTS idx_sp_pool_pred_user          ON sports_pool_predictions (user_id);
CREATE INDEX IF NOT EXISTS idx_sp_pool_pred_fixture       ON sports_pool_predictions (fixture_id);
CREATE INDEX IF NOT EXISTS idx_sp_pool_pred_user_settled  ON sports_pool_predictions (user_id, settled_at);

CREATE TABLE IF NOT EXISTS sports_pool_matches (
  fixture_id        integer PRIMARY KEY,
  competition_slug  text,
  kickoff_ts        integer NOT NULL,
  home_team_id      integer NOT NULL DEFAULT 0,
  away_team_id      integer NOT NULL DEFAULT 0,
  home_team_name    text NOT NULL,
  home_team_logo    text NOT NULL DEFAULT '',
  away_team_name    text NOT NULL,
  away_team_logo    text NOT NULL DEFAULT '',
  prob_home         integer NOT NULL DEFAULT 33,
  prob_draw         integer NOT NULL DEFAULT 34,
  prob_away         integer NOT NULL DEFAULT 33,
  pool_base         integer NOT NULL DEFAULT 1000,
  pool_carry_in     integer NOT NULL DEFAULT 0,
  paid_exact        integer NOT NULL DEFAULT 0,
  paid_margin       integer NOT NULL DEFAULT 0,
  paid_outcome      integer NOT NULL DEFAULT 0,
  carry_out         integer NOT NULL DEFAULT 0,
  final_home        integer,
  final_away        integer,
  status            text NOT NULL DEFAULT 'open',
  predictions_count integer NOT NULL DEFAULT 0,
  outcome_winners   integer NOT NULL DEFAULT 0,
  margin_winners    integer NOT NULL DEFAULT 0,
  exact_winners     integer NOT NULL DEFAULT 0,
  created_at        timestamp NOT NULL DEFAULT now(),
  updated_at        timestamp NOT NULL DEFAULT now(),
  settled_at        timestamp
);
CREATE INDEX IF NOT EXISTS idx_sp_pool_match_status  ON sports_pool_matches (status);
CREATE INDEX IF NOT EXISTS idx_sp_pool_match_kickoff ON sports_pool_matches (kickoff_ts);
CREATE INDEX IF NOT EXISTS idx_sp_pool_match_comp    ON sports_pool_matches (competition_slug, kickoff_ts);

CREATE TABLE IF NOT EXISTS sports_pool_long (
  id               varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  competition_slug text NOT NULL,
  kind             text NOT NULL,
  team_id          integer,
  team_name        text,
  team_logo        text,
  player_name      text,
  status           text NOT NULL DEFAULT 'pending',
  points_awarded   integer NOT NULL DEFAULT 0,
  created_at       timestamp NOT NULL DEFAULT now(),
  updated_at       timestamp NOT NULL DEFAULT now(),
  settled_at       timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sp_pool_long_user_comp_kind ON sports_pool_long (user_id, competition_slug, kind);
CREATE INDEX IF NOT EXISTS idx_sp_pool_long_comp_kind        ON sports_pool_long (competition_slug, kind);

CREATE TABLE IF NOT EXISTS sports_pool_badges (
  id         varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge      text NOT NULL,
  metadata   jsonb,
  awarded_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sp_pool_badge_user_badge ON sports_pool_badges (user_id, badge);
CREATE INDEX IF NOT EXISTS idx_sp_pool_badge_user        ON sports_pool_badges (user_id);

COMMIT;
```

> بديل: `npm run db:push` على التطوير، أو `./push-to-production.sh <PROD_URL>` للإنتاج.
> لا تشغّل `db:push` مباشرة على قاعدة الإنتاج.

---

## 6) الشارات (Badges)

كتالوج متطابق بين الباكند (`awardBadges`) وiOS (`spBadgeCatalog`):

| الكود | الشارة | الشرط |
|-------|--------|-------|
| `nostradamus` | 🔮 العرّاف | 5 نتائج دقيقة |
| `lionheart` | 🦁 قلب الأسد | إصابة نتيجة مفاجئة (احتمال أقل من 10٪) |
| `hot_streak` | 🔥 سلسلة ملتهبة | 3 توقّعات صحيحة متتالية |
| `marathoner` | 🏃 الماراثوني | 25 توقّعًا مكتملًا |

---

## 7) معمارية iOS (SwiftUI)

| الملف | الدور |
|-------|-------|
| `Services/SportsPredictionModels.swift` | نماذج `Decodable/Encodable` + امتدادات `APIClient` لنقاط التوقّعات |
| `Screens/PredictionsHubView.swift` | المركز: الترويسة (الجاكبوت/إحصاءاتي) + التبويبات + احتفال الفوز |
| `Screens/SpPredictionMatchCard.swift` | بطاقة توقّع مباراة (steppers، شريط الاحتمالات، البركة، المشاركة) |
| `Screens/PredictionExtras.swift` | توقّعاتي · المتصدّرون · البطل/الهدّاف · الإنجازات · الاحتفال + confetti |

### التنقّل (مهم)
- **«التوقّعات» تُفتح من صفحة «حسابي»** (`AccountView` → قسم بارز `NavigationLink → PredictionsHubView`)، وليست تبويبًا في الشريط السفلي.
- شريط التبويبات السفلي: **المباريات · روشن · البطولات · عالمية · حسابي**.
  («عالمية» = `LiveView` رجعت كتبويب مستقل).
- `PredictionsHubView` بلا `NavigationStack` داخلي (يُدفع داخل ستاك «حسابي»).

### تبويبات مركز التوقّعات
`المباريات · توقّعاتي · المتصدّرون · البطل والهدّاف · الإنجازات · كيف تلعب؟`
- تبويب **«كيف تلعب؟»** يشرح الفكرة وتوزيع 50/30/20 والقواعد (مطابق لخليجي 27).

---

## 8) التشغيل والنشر

1. **أنشئ الجداول الأربعة** (SQL أعلاه) على قاعدة الإنتاج.
2. فعّل الفلاغ على Railway: `SPORTS_PREDICTIONS_ENABLED=true`
   (بدونه ترجع النقاط 503 وتعرض الواجهة «المسابقة قريبًا»).
3. النشر الحالي: Cloudflare Pages (واجهة) + Railway (API على `api.sabq.org`).
   النشر من هذا الفرع أو بعد دمجه إلى `main` حسب إعداد النشر.

---

## 9) القرارات والملاحظات

- **iOS هو المرجع للأندرويد** (parity 1:1). الويب مستقل بصريًا (parity وظيفي فقط).
  مطابقة أندرويد (Jetpack Compose) لنظام التوقّعات **لم تُنفّذ بعد**.
- **«كأس آسيا»**: لا يوجد إدخال لكأس آسيا للمنتخبات (AFC Asian Cup 2027) في قائمة
  البطولات، فاعتُمد «دوري أبطال آسيا للنخبة» (للأندية) كبطولة آسيا المتاحة.
- **حلّ تعارض الدمج مع `main`**: `main` احتوى نسخة أقدم من نفس عملنا عبر PRs
  مضغوطة (#538/#539)، فظهرت تعارضات `add/add` على ملفات التوقّعات الثلاثة.
  حُسمت بأخذ **نسختنا الأحدث** (لا فقدان — نسخة `main` كانت كودنا القديم المستبدَل).

---

## 10) سجل الـ commits (هذه الجولة)

```
4192c73  Merge origin/main (حسم التعارضات بأخذ نسختنا)
18a6bc7  fix(sports-predictions): scope to our comps, 48h window, QF lock, latin digits
7ced74a  feat(sports-predictions): how-to-play tab, rolling 2-day matches, long-term scope
583c3d5  feat(sports): generalized tiered-pool predictions across competitions
```

(الفرع: `feat/sports-matches-tab-wc-center` — متقدّم على `main` ولا تعارضات.)

---

## 11) مراجع ذات صلة

- نظام خليجي 27 (الأصل في الويب): `client/src/pages/GulfCupPredictions.tsx`،
  `server/services/gcPredictionsService.ts`، `server/services/gulfCupPredictionScoring.ts`.
- قائمة البطولات ومصدر البيانات: `server/services/saudiLeagueService.ts`.
- التعريب وأسماء الجولات: `server/services/saudiLeagueNames.ts`.
- توثيق المشروع العام: `CLAUDE.md` · `AGENTS.md` · `docs/DEPLOYMENT_STATUS.md`.
