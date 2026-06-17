/**
 * البوابة الرياضية العامة — تُغذّي قسم /sports في الويب.
 *
 * تعيد استخدام saudiLeagueService بالكامل (نفس مزوّد API-Football وكاش SWR)
 * لكنها — على عكس راوتر /api/saudi-league المخفي خلف SAUDI_LEAGUE_ENABLED —
 * نقاطٌ عامة جاهزة للإنتاج. البوابة الوحيدة هي توفّر مفتاح API:
 *   - مفتاح متوفّر  → بيانات حيّة.
 *   - مفتاح غير متوفّر → 200 ببيانات فارغة و configured:false، فتُخفي الواجهة
 *     بلوكات المباريات/الترتيب/الهدّافين بسلاسة بدل أن تتعطّل.
 *
 * لا يستورد db (ملتزم بـ ADR-001) — كل الوصول للبيانات عبر الخدمة فقط.
 */
import type { Express, Request, Response } from "express";
import {
  getCompetition,
  getCompetitionRounds,
  getFixtures,
  getFixturePrediction,
  getFixturesByRound,
  getLiveFixtures,
  getMatchDetail,
  getMatchPlayerRatings,
  getPlayerCard,
  getPlayerInjuries,
  getPlayerSeasonHistory,
  getPlayerTransfers,
  getSquad,
  getStandings,
  getTeamProfile,
  getTeamStats,
  getTeamCoach,
  getTeamTopScorers,
  getTeamTransfers,
  getTopAssists,
  getTopRedCards,
  getTopScorers,
  getTopYellowCards,
  isSaudiLeagueConfigured,
  listCompetitions,
  listCompetitionsWithMeta,
  type SaudiCompetition,
  type SplFixture,
} from "../services/saudiLeagueService";

const RIYADH_TZ = "Asia/Riyadh";
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: RIYADH_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** مفتاح يوم بتوقيت الرياض (YYYY-MM-DD) لتصنيف "مباريات اليوم" بدقة محلية. */
function riyadhDayKey(ts: number): string {
  return dayKeyFmt.format(new Date(ts * 1000));
}

/** يقسّم جدول البطولة إلى مباشر/اليوم/قادمة/نتائج جاهزة للعرض. */
function bucketFixtures(fixtures: SplFixture[]) {
  const todayKey = riyadhDayKey(Math.floor(Date.now() / 1000));

  const live = fixtures.filter((f) => f.status.live);
  const today = fixtures.filter(
    (f) => !f.status.live && riyadhDayKey(f.timestamp) === todayKey
  );
  const upcoming = fixtures
    .filter((f) => !f.status.live && !f.status.finished && riyadhDayKey(f.timestamp) !== todayKey)
    .slice(0, 20);
  const results = fixtures
    .filter((f) => f.status.finished && riyadhDayKey(f.timestamp) !== todayKey)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20);

  return { live, today, upcoming, results };
}

export function registerSportsRoutes(app: Express) {
  // يحوّل :comp إلى بطولة معروفة (افتراضيًا دوري روشن)، أو يرد 404.
  const resolve = (req: Request, res: Response): SaudiCompetition | null => {
    const slug = String(req.params.comp || "pro-league");
    const comp = getCompetition(slug);
    if (!comp) {
      res.status(404).json({ message: "بطولة غير معروفة" });
      return null;
    }
    return comp;
  };

  // قائمة البطولات المتاحة (لمبدّل البطولات في الواجهة).
  // الموجة 2: تُثرى بالشعار والموسم الحالي لكل بطولة (ترويسة ديناميكية).
  app.get("/api/sports/competitions", async (_req, res) => {
    res.set("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400");
    if (!isSaudiLeagueConfigured()) {
      res.json({ configured: false, competitions: listCompetitions() });
      return;
    }
    try {
      res.json({ configured: true, competitions: await listCompetitionsWithMeta() });
    } catch (error) {
      console.error("[Sports] competitions meta failed:", error);
      // تدهور بسلاسة إلى القائمة الأساسية دون شعار/موسم.
      res.json({ configured: true, competitions: listCompetitions() });
    }
  });

  // إضافة: متصدّرو البطاقات (إنذارات + طرد) في طلب واحد لتبويب الواجهة.
  app.get("/api/sports/:comp/cards", async (req, res) => {
    const comp = resolve(req, res);
    if (!comp) return;
    if (!isSaudiLeagueConfigured()) {
      res.json({ configured: false, yellow: [], red: [] });
      return;
    }
    try {
      const [yellow, red] = await Promise.all([
        getTopYellowCards(comp).catch(() => []),
        getTopRedCards(comp).catch(() => []),
      ]);
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json({ configured: true, yellow, red });
    } catch (error) {
      console.error("[Sports] cards failed:", error);
      res.status(502).json({ message: "تعذر جلب متصدّري البطاقات حاليًا" });
    }
  });

  // مركز المباريات لبطولة: مباشر/اليوم/قادمة/نتائج في طلب واحد.
  app.get("/api/sports/:comp/matches", async (req, res) => {
    const comp = resolve(req, res);
    if (!comp) return;
    if (!isSaudiLeagueConfigured()) {
      res.set("Cache-Control", "public, max-age=30, s-maxage=60");
      res.json({ configured: false, live: [], today: [], upcoming: [], results: [] });
      return;
    }
    try {
      const [fixtures, liveNow] = await Promise.all([getFixtures(comp), getLiveFixtures(comp)]);
      const buckets = bucketFixtures(fixtures);
      // دمج المباشر من نقطة live (أدقّ) مع ما التُقط من الجدول.
      const liveIds = new Set(liveNow.map((f) => f.id));
      const live = [...liveNow, ...buckets.live.filter((f) => !liveIds.has(f.id))];
      res.set("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=60");
      res.json({ configured: true, live, today: buckets.today, upcoming: buckets.upcoming, results: buckets.results });
    } catch (error) {
      console.error("[Sports] matches failed:", error);
      res.status(502).json({ message: "تعذر جلب المباريات حاليًا" });
    }
  });

  // متصفّح الجولات: قائمة الجولات + الجولة الحالية (للدوريات).
  app.get("/api/sports/:comp/rounds", async (req, res) => {
    const comp = resolve(req, res);
    if (!comp) return;
    if (!isSaudiLeagueConfigured()) {
      res.json({ configured: false, rounds: [], current: null });
      return;
    }
    try {
      const { rounds, current } = await getCompetitionRounds(comp);
      res.set("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
      res.json({ configured: true, rounds, current });
    } catch (error) {
      console.error("[Sports] rounds failed:", error);
      res.status(502).json({ message: "تعذر جلب الجولات حاليًا" });
    }
  });

  // مباريات جولة محدّدة (?name=الجولة الخام). تُستخدم مع /rounds للتصفّح.
  app.get("/api/sports/:comp/round", async (req, res) => {
    const comp = resolve(req, res);
    if (!comp) return;
    const name = String(req.query.name || "").trim();
    if (!name) {
      res.status(400).json({ message: "اسم الجولة مطلوب" });
      return;
    }
    if (!isSaudiLeagueConfigured()) {
      res.json({ configured: false, fixtures: [] });
      return;
    }
    try {
      const fixtures = await getFixturesByRound(comp, name);
      res.set("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300");
      res.json({ configured: true, fixtures });
    } catch (error) {
      console.error("[Sports] round fixtures failed:", error);
      res.status(502).json({ message: "تعذر جلب مباريات الجولة حاليًا" });
    }
  });

  // الترتيب (يرد [] للكؤوس ومن لا يدعمه).
  app.get("/api/sports/:comp/standings", async (req, res) => {
    const comp = resolve(req, res);
    if (!comp) return;
    if (!isSaudiLeagueConfigured()) {
      res.json({ configured: false, standings: [] });
      return;
    }
    try {
      res.set("Cache-Control", "public, max-age=120, s-maxage=300, stale-while-revalidate=600");
      res.json({ configured: true, standings: await getStandings(comp) });
    } catch (error) {
      console.error("[Sports] standings failed:", error);
      res.status(502).json({ message: "تعذر جلب الترتيب حاليًا" });
    }
  });

  // الهدّافون (أعلى 15؛ يرد [] لمن لا يدعمها).
  app.get("/api/sports/:comp/scorers", async (req, res) => {
    const comp = resolve(req, res);
    if (!comp) return;
    if (!isSaudiLeagueConfigured()) {
      res.json({ configured: false, scorers: [] });
      return;
    }
    try {
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json({ configured: true, scorers: await getTopScorers(comp) });
    } catch (error) {
      console.error("[Sports] scorers failed:", error);
      res.status(502).json({ message: "تعذر جلب قائمة الهدافين حاليًا" });
    }
  });

  // صنّاع الأهداف (الموجة 1) — أعلى 15 صانع هدف؛ يرد [] لمن لا يدعمها.
  app.get("/api/sports/:comp/assists", async (req, res) => {
    const comp = resolve(req, res);
    if (!comp) return;
    if (!isSaudiLeagueConfigured()) {
      res.json({ configured: false, assists: [] });
      return;
    }
    try {
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json({ configured: true, assists: await getTopAssists(comp) });
    } catch (error) {
      console.error("[Sports] assists failed:", error);
      res.status(502).json({ message: "تعذر جلب قائمة صنّاع الأهداف حاليًا" });
    }
  });

  // تفاصيل مباراة — المعرّف عام عند المزود فلا يحتاج تحديد البطولة.
  app.get("/api/sports/match/:id", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.status(404).json({ message: "المباراة غير موجودة" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ message: "معرّف مباراة غير صحيح" });
      return;
    }
    try {
      const detail = await getMatchDetail(id);
      if (!detail) {
        res.status(404).json({ message: "المباراة غير موجودة" });
        return;
      }
      const ttl = detail.fixture.status.live ? "max-age=10, s-maxage=15" : "max-age=120, s-maxage=300";
      res.set("Cache-Control", `public, ${ttl}, stale-while-revalidate=120`);
      res.json(detail);
    } catch (error) {
      console.error("[Sports] match detail failed:", error);
      res.status(502).json({ message: "تعذر جلب تفاصيل المباراة حاليًا" });
    }
  });

  // تقييمات لاعبي المباراة (lazy) — نقطة منفصلة عن /match/:id تُستدعى فقط عند فتح
  // تبويب «التقييمات»، لأن fixtures/players ثقيلة (22+ لاعبًا) ولا داعي لها على كل فتح.
  app.get("/api/sports/match/:id/players", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.status(404).json({ message: "غير متاح" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ message: "معرّف مباراة غير صحيح" });
      return;
    }
    try {
      const ratings = await getMatchPlayerRatings(id);
      if (!ratings) {
        res.status(404).json({ message: "لا تتوفّر تقييمات لهذه المباراة" });
        return;
      }
      res.set("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=120");
      res.json(ratings);
    } catch (error) {
      console.error("[Sports] match player ratings failed:", error);
      res.status(502).json({ message: "تعذر جلب تقييمات اللاعبين حاليًا" });
    }
  });

  const parseId = (raw: unknown): number | null => {
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  };

  // صفحة النادي: هوية + ترتيب + مباريات + تشكيلة — المعرّف عام عند المزود.
  // الموجة 1: عند ?with=stats تُضمَّن إحصاءات النادي + المدرب + هدّافوه في نفس
  // الاستجابة (واجهة صفحة النادي تستخدمها لتقليل الطلبات).
  app.get("/api/sports/team/:id", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.status(404).json({ message: "النادي غير موجود" });
      return;
    }
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف نادٍ غير صحيح" });
      return;
    }
    try {
      const withExtras = req.query.with === "stats";
      const profile = await getTeamProfile(id, { withExtras });
      if (!profile) {
        res.status(404).json({ message: "النادي غير موجود" });
        return;
      }
      res.set("Cache-Control", "public, max-age=120, s-maxage=600, stale-while-revalidate=1800");
      res.json(profile);
    } catch (error) {
      console.error("[Sports] team profile failed:", error);
      res.status(502).json({ message: "تعذر جلب صفحة النادي حاليًا" });
    }
  });

  // إحصاءات النادي الشاملة (الموجة 1) — منفصلة لمن يريد الأرقام وحدها.
  app.get("/api/sports/team/:id/stats", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.status(404).json({ message: "الإحصاءات غير متاحة" });
      return;
    }
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف نادٍ غير صحيح" });
      return;
    }
    try {
      const stats = await getTeamStats(id);
      if (!stats) {
        res.status(404).json({ message: "لا تتوفّر إحصاءات تفصيلية لهذا النادي" });
        return;
      }
      res.set("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
      res.json(stats);
    } catch (error) {
      console.error("[Sports] team stats failed:", error);
      res.status(502).json({ message: "تعذر جلب إحصاءات النادي حاليًا" });
    }
  });

  // المدرب (الموجة 1) — بطاقة المدرب الحالي للنادي.
  app.get("/api/sports/team/:id/coach", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.status(404).json({ message: "بيانات المدرب غير متاحة" });
      return;
    }
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف نادٍ غير صحيح" });
      return;
    }
    try {
      const coach = await getTeamCoach(id);
      if (!coach) {
        res.status(404).json({ message: "بيانات المدرب غير متاحة" });
        return;
      }
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      res.json(coach);
    } catch (error) {
      console.error("[Sports] team coach failed:", error);
      res.status(502).json({ message: "تعذر جلب بيانات المدرب حاليًا" });
    }
  });

  // هدّافو النادي (الموجة 1) — أعلى 5 هدّافين في صفوف النادي هذا الموسم.
  app.get("/api/sports/team/:id/scorers", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.json({ scorers: [] });
      return;
    }
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف نادٍ غير صحيح" });
      return;
    }
    try {
      const scorers = await getTeamTopScorers(id);
      res.set("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
      res.json({ scorers });
    } catch (error) {
      console.error("[Sports] team scorers failed:", error);
      res.status(502).json({ message: "تعذر جلب هدّافي النادي حاليًا" });
    }
  });

  // انتقالات النادي (الموجة 2) — آخر من وصل وغادر (نافذة الانتقالات).
  app.get("/api/sports/team/:id/transfers", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.json({ arrivals: [], departures: [] });
      return;
    }
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف نادٍ غير صحيح" });
      return;
    }
    try {
      const transfers = await getTeamTransfers(id);
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      res.json(transfers);
    } catch (error) {
      console.error("[Sports] team transfers failed:", error);
      res.status(502).json({ message: "تعذر جلب انتقالات النادي حاليًا" });
    }
  });

  // تشكيلة النادي وحدها (للاستهلاك المنفصل عند الحاجة).
  app.get("/api/sports/squad/:id", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.status(404).json({ message: "التشكيلة غير متاحة" });
      return;
    }
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف نادٍ غير صحيح" });
      return;
    }
    try {
      const squad = await getSquad(id);
      if (!squad) {
        res.status(404).json({ message: "التشكيلة غير متاحة" });
        return;
      }
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      res.json(squad);
    } catch (error) {
      console.error("[Sports] squad failed:", error);
      res.status(502).json({ message: "تعذر جلب التشكيلة حاليًا" });
    }
  });

  // بطاقة اللاعب: ملف شخصي + أرقام الموسم + مسيرة + ألقاب.
  app.get("/api/sports/player/:id", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.status(404).json({ message: "ملف اللاعب غير متاح" });
      return;
    }
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف لاعب غير صحيح" });
      return;
    }
    try {
      const player = await getPlayerCard(id);
      if (!player) {
        res.status(404).json({ message: "ملف اللاعب غير متاح" });
        return;
      }
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      // الموجة 2: عند ?with=extras تُضمَّن سلسلة المواسم + الانتقالات + الإصابات
      // في نفس الاستجابة (تقلّل طلبات صفحة اللاعب). كلها تتدهور بسلاسة إلى [].
      if (req.query.with === "extras") {
        const [history, transfers, injuries] = await Promise.all([
          getPlayerSeasonHistory(id).catch(() => []),
          getPlayerTransfers(id).catch(() => []),
          getPlayerInjuries(id).catch(() => []),
        ]);
        res.json({ ...player, history, transfers, injuries });
        return;
      }
      res.json(player);
    } catch (error) {
      console.error("[Sports] player card failed:", error);
      res.status(502).json({ message: "تعذر جلب ملف اللاعب حاليًا" });
    }
  });

  // البند 12: توقّعات المباراة (lazy) — تُعرض للمباريات غير المبدوءة فقط في الواجهة.
  app.get("/api/sports/match/:id/prediction", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.status(404).json({ message: "غير متاح" });
      return;
    }
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف مباراة غير صحيح" });
      return;
    }
    try {
      const prediction = await getFixturePrediction(id);
      if (!prediction) {
        res.status(404).json({ message: "لا تتوفّر توقّعات لهذه المباراة" });
        return;
      }
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json(prediction);
    } catch (error) {
      console.error("[Sports] prediction failed:", error);
      res.status(502).json({ message: "تعذر جلب التوقّعات حاليًا" });
    }
  });
}
