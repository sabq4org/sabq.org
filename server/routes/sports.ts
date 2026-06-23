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
  generateMatchPreview,
  generateMatchStory,
  getCompetition,
  getCompetitionHistory,
  getCompetitionRounds,
  getFixtures,
  getFixturePrediction,
  getFixturesByRound,
  getSportsFixtureIdentity,
  getGlobalLiveFixtures,
  getGlobalTodayFixtures,
  getWorldLiveFixtures,
  getHeadToHead,
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
  overlayLiveBoardList,
  overlayLiveFixturesForComp,
  overlayLiveMatchDetail,
  type SaudiCompetition,
  type SplFixture,
} from "../services/saudiLeagueService";
import { getTeamOgImage } from "../services/sportsOgImage";
import {
  getXg,
  getPressure,
  getMomentum,
  getCommentary,
  getMatchFacts,
  resolveSmIdByNames,
  isSportmonksConfigured,
} from "../services/sportmonksService";
import {
  addFollow,
  isValidFollowKind,
  listFollows,
  removeFollow,
  setFollowNotify,
} from "../services/sportsFollowsService";
import {
  getLeaderboard,
  getMyPrediction,
  getUserStats,
  listMyPredictions,
  submitPrediction,
} from "../services/sportsPredictionsService";
import { requireAuth } from "../rbac";

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
  // كل بطولة تحمل status: ongoing | upcoming | finished | unknown.
  // فلتر اختياري ?status=ongoing[,upcoming] يقصر النتائج على الحالات المطلوبة.
  app.get("/api/sports/competitions", async (req, res) => {
    res.set("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400");
    const wanted = String(req.query.status || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const applyFilter = <T extends { status?: string }>(rows: T[]): T[] =>
      wanted.length ? rows.filter((c) => c.status && wanted.includes(c.status)) : rows;
    if (!isSaudiLeagueConfigured()) {
      // بدون مفتاح لا نعرف الحالة؛ نرجع القائمة الأساسية كاملة (status غير متاح).
      res.json({ configured: false, competitions: listCompetitions() });
      return;
    }
    try {
      const competitions = applyFilter(await listCompetitionsWithMeta());
      res.json({ configured: true, competitions });
    } catch (error) {
      console.error("[Sports] competitions meta failed:", error);
      // تدهور بسلاسة إلى القائمة الأساسية دون شعار/موسم/حالة.
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

  // لوحة مباشرة شاملة: كل مباريات الأندية السعودية المباشرة عبر كل البطولات.
  app.get("/api/sports/live", async (_req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.set("Cache-Control", "public, max-age=15, s-maxage=30");
      res.json({ configured: false, live: [] });
      return;
    }
    try {
      const live = await overlayLiveBoardList(await getGlobalLiveFixtures());
      res.set("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=60");
      res.json({ configured: true, live });
    } catch (error) {
      console.error("[Sports] global live failed:", error);
      res.status(502).json({ message: "تعذر جلب المباريات المباشرة حاليًا" });
    }
  });

  // البث المباشر العالمي: كل مباريات العالم المباشرة الآن (غير مفلتر على سجلّنا)
  // — لقسم «البث المباشر · العالم» المجمّع حسب الدولة ثم الدوري. الأسماء
  // المعروفة معرّبة مع fallback إنجليزي للدوريات الصغيرة.
  app.get("/api/sports/world-live", async (_req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.set("Cache-Control", "public, max-age=15, s-maxage=30");
      res.json({ configured: false, matches: [] });
      return;
    }
    try {
      const matches = await getWorldLiveFixtures();
      res.set("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=60");
      res.json({ configured: true, matches });
    } catch (error) {
      console.error("[Sports] world live failed:", error);
      res.status(502).json({ message: "تعذر جلب المباريات المباشرة حاليًا" });
    }
  });

  // مباريات اليوم عبر كل البطولات السعودية (مقرّرة/جارية/منتهية) مع اسم البطولة
  // لكل مباراة — نظرة سريعة موحّدة أعلى الصفحة، مستقلّة عن البطولة المختارة.
  app.get("/api/sports/today", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.set("Cache-Control", "public, max-age=30, s-maxage=60");
      res.json({ configured: false, today: [] });
      return;
    }
    // ?date=YYYY-MM-DD اختياري للتنقّل بين الأيام (لوحة "مباريات اليوم").
    const dateRaw = typeof req.query.date === "string" ? req.query.date.trim() : "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : undefined;
    try {
      const today = await overlayLiveBoardList(await getGlobalTodayFixtures(date));
      res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
      res.json({ configured: true, date: date ?? null, today });
    } catch (error) {
      console.error("[Sports] global today failed:", error);
      res.status(502).json({ message: "تعذر جلب مباريات اليوم حاليًا" });
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
      const mergedLive = [...liveNow, ...buckets.live.filter((f) => !liveIds.has(f.id))];
      // الطبقة اللحظية: نتيجة TheSports الفائقة على المباريات الجارية (إن أُدرجت البطولة).
      const live = await overlayLiveFixturesForComp(mergedLive, comp.slug);
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

  // لمحة النسخة السابقة: حامل اللقب + هدّاف الموسم الماضي. بيانات تاريخية ثابتة
  // فتُخزَّن طويلًا. تتدهور بسلاسة إلى null عند تعذّر جزء منها.
  app.get("/api/sports/:comp/history", async (req, res) => {
    const comp = resolve(req, res);
    if (!comp) return;
    if (!isSaudiLeagueConfigured()) {
      res.json({ configured: false, history: { previousSeason: null, champion: null, topScorer: null } });
      return;
    }
    try {
      res.set("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400");
      res.json({ configured: true, history: await getCompetitionHistory(comp) });
    } catch (error) {
      console.error("[Sports] history failed:", error);
      res.status(502).json({ message: "تعذر جلب لمحة النسخة السابقة حاليًا" });
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
      const base = await getMatchDetail(id);
      if (!base) {
        res.status(404).json({ message: "المباراة غير موجودة" });
        return;
      }
      // الطبقة اللحظية: نتيجة/أحداث/إحصاءات TheSports فوق بيانات API-Football
      // للمباريات الجارية في البطولات المُدرَجة — أفضل جهد (تتراجع بصمت).
      const detail = await overlayLiveMatchDetail(base);
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

  // ---------- إثراء SportMonks للبوابة (xG/الضغط/معطيات) — سعودي/آسيا وغيرها ----------
  // نحلّ معرّف SportMonks من هوية مباراة API-Football ثم نعيد استخدام دوال البناء
  // عبر directSmId (نفس منطق المونديال، بلا تكرار). كلها best-effort بحُرّاس توفّر.
  const resolveSportsSmId = async (id: number): Promise<number | null> => {
    const identity = await getSportsFixtureIdentity(id).catch(() => null);
    if (!identity) return null;
    return resolveSmIdByNames({
      key: `spl:${id}`,
      kickoffIso: identity.kickoffIso,
      homeNameEn: identity.homeNameEn,
      awayNameEn: identity.awayNameEn,
    });
  };

  const SM_ENRICH_CACHE = "public, max-age=30, s-maxage=120, stale-while-revalidate=300";

  app.get("/api/sports/match/:id/xg", async (req, res) => {
    if (!isSportmonksConfigured()) {
      return res
        .status(503)
        .json({ configured: false, available: false, home: { xg: 0, xgot: 0 }, away: { xg: 0, xgot: 0 }, topPlayers: [] });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "معرّف مباراة غير صحيح" });
    try {
      const smId = await resolveSportsSmId(id);
      if (!smId) {
        return res.json({ available: false, home: { xg: 0, xgot: 0 }, away: { xg: 0, xgot: 0 }, topPlayers: [] });
      }
      res.set("Cache-Control", SM_ENRICH_CACHE);
      res.json(await getXg(id, { directSmId: smId }));
    } catch (error) {
      console.error("[Sports] xg failed:", error);
      res.status(502).json({ available: false, home: { xg: 0, xgot: 0 }, away: { xg: 0, xgot: 0 }, topPlayers: [] });
    }
  });

  app.get("/api/sports/match/:id/pressure", async (req, res) => {
    if (!isSportmonksConfigured()) {
      return res.status(503).json({ configured: false, available: false, live: false, latest: null, points: [] });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "معرّف مباراة غير صحيح" });
    try {
      const smId = await resolveSportsSmId(id);
      if (!smId) return res.json({ available: false, live: false, latest: null, points: [] });
      res.set("Cache-Control", SM_ENRICH_CACHE);
      res.json(await getPressure(id, { directSmId: smId }));
    } catch (error) {
      console.error("[Sports] pressure failed:", error);
      res.status(502).json({ available: false, live: false, latest: null, points: [] });
    }
  });

  // رسم الزخم الهجومي (الهجمات الخطيرة عبر الزمن) — إثراء SportMonks، نظير المونديال.
  app.get("/api/sports/match/:id/momentum", async (req, res) => {
    if (!isSportmonksConfigured()) {
      return res.status(503).json({ configured: false, available: false, live: false, possession: null, points: [] });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "معرّف مباراة غير صحيح" });
    try {
      const smId = await resolveSportsSmId(id);
      if (!smId) return res.json({ available: false, live: false, possession: null, points: [] });
      res.set("Cache-Control", SM_ENRICH_CACHE);
      res.json(await getMomentum(id, { directSmId: smId }));
    } catch (error) {
      console.error("[Sports] momentum failed:", error);
      res.status(502).json({ available: false, live: false, possession: null, points: [] });
    }
  });

  // التعليق الحيّ (أبرز اللحظات معرَّبة) — إثراء SportMonks، نظير المونديال.
  app.get("/api/sports/match/:id/commentary", async (req, res) => {
    if (!isSportmonksConfigured()) {
      return res.status(503).json({ configured: false, available: false, live: false, items: [] });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "معرّف مباراة غير صحيح" });
    try {
      const smId = await resolveSportsSmId(id);
      if (!smId) return res.json({ available: false, live: false, items: [] });
      res.set("Cache-Control", SM_ENRICH_CACHE);
      res.json(await getCommentary(id, { directSmId: smId }));
    } catch (error) {
      console.error("[Sports] commentary failed:", error);
      res.status(502).json({ available: false, live: false, items: [] });
    }
  });

  app.get("/api/sports/match/:id/facts", async (req, res) => {
    if (!isSportmonksConfigured()) {
      return res.status(503).json({
        configured: false, available: false, statistics: [], weather: null, absentees: [], eventDetails: [], halftime: null,
      });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "معرّف مباراة غير صحيح" });
    try {
      const smId = await resolveSportsSmId(id);
      if (!smId) {
        return res.json({ available: false, statistics: [], weather: null, absentees: [], eventDetails: [], halftime: null });
      }
      res.set("Cache-Control", SM_ENRICH_CACHE);
      res.json(await getMatchFacts(id, { directSmId: smId }));
    } catch (error) {
      console.error("[Sports] facts failed:", error);
      res.status(502).json({ available: false, statistics: [], weather: null, absentees: [], eventDetails: [], halftime: null });
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

  // بطاقة المشاركة (OG) المولّدة للنادي — 1200×630 معتمة (خلفية سبق + شعار
  // النادي + اسمه + مركزه). تُستهلك من og:image في seoInjector/edgeMeta لأن
  // صور المزوّد 150×150 شفّافة يرفضها واتساب. تتدهور لصورة سبق الافتراضية.
  app.get("/api/sports/og/team/:id", async (req, res) => {
    const id = parseId(req.params.id);
    if (id == null || !isSaudiLeagueConfigured()) {
      res.redirect(302, "/branding/sabq-og-image.png");
      return;
    }
    try {
      const png = await getTeamOgImage(id);
      if (!png) {
        res.redirect(302, "/branding/sabq-og-image.png");
        return;
      }
      res.set("Content-Type", "image/png");
      res.set("Cache-Control", "public, max-age=21600, s-maxage=86400, stale-while-revalidate=86400");
      res.send(png);
    } catch (error) {
      console.error("[Sports] team OG image failed:", error);
      res.redirect(302, "/branding/sabq-og-image.png");
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

  // المرحلة 2 (ذكاء): سرد المباراة آليًا بالعربية (جارية/منتهية). lazy — تُستدعى
  // عند فتح تبويب «الملخّص الذكي». التوليد خلف كاش SWR فلا يتكرّر لكل زائر.
  app.get("/api/sports/match/:id/story", async (req, res) => {
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
      const story = await generateMatchStory(id);
      if (!story) {
        res.status(404).json({ message: "لا يتوفّر ملخّص لهذه المباراة" });
        return;
      }
      const ttl = story.live ? "max-age=30, s-maxage=60" : "max-age=600, s-maxage=3600";
      res.set("Cache-Control", `public, ${ttl}, stale-while-revalidate=120`);
      res.json(story);
    } catch (error) {
      console.error("[Sports] match story failed:", error);
      res.status(502).json({ message: "تعذر توليد ملخّص المباراة حاليًا" });
    }
  });

  // المرحلة 2 (ذكاء): معاينة ما قبل المباراة (للمباريات غير المبدوءة فقط).
  app.get("/api/sports/match/:id/preview", async (req, res) => {
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
      const preview = await generateMatchPreview(id);
      if (!preview) {
        res.status(404).json({ message: "لا تتوفّر معاينة لهذه المباراة" });
        return;
      }
      res.set("Cache-Control", "public, max-age=600, s-maxage=1800, stale-while-revalidate=1800");
      res.json(preview);
    } catch (error) {
      console.error("[Sports] match preview failed:", error);
      res.status(502).json({ message: "تعذر توليد معاينة المباراة حاليًا" });
    }
  });

  // ============================================================
  // المرحلة 3 (الشخصنة): متابعة الفِرق/البطولات
  // كلها تتطلّب جلسة ويب (requireAuth). الـ refId نصّ: معرّف فريق أو slug بطولة.
  // ============================================================

  // متابعاتي
  app.get("/api/sports/follows", requireAuth, async (req: any, res) => {
    try {
      const follows = await listFollows(req.user.id);
      res.set("Cache-Control", "private, no-store");
      res.json({ follows });
    } catch (error) {
      console.error("[Sports] list follows failed:", error);
      res.status(502).json({ message: "تعذر جلب متابعاتك حاليًا" });
    }
  });

  // إضافة متابعة
  app.post("/api/sports/follows", requireAuth, async (req: any, res) => {
    const { kind, refId, refName, refLogo } = req.body ?? {};
    if (!isValidFollowKind(kind) || !refId || !refName) {
      res.status(400).json({ message: "بيانات المتابعة غير مكتملة" });
      return;
    }
    try {
      const follow = await addFollow(req.user.id, {
        kind,
        refId: String(refId),
        refName: String(refName),
        refLogo: refLogo ? String(refLogo) : null,
      });
      res.set("Cache-Control", "private, no-store");
      res.json({ follow });
    } catch (error) {
      console.error("[Sports] add follow failed:", error);
      res.status(502).json({ message: "تعذر حفظ المتابعة حاليًا" });
    }
  });

  // تفعيل/كتم إشعارات متابعة قائمة
  app.patch("/api/sports/follows", requireAuth, async (req: any, res) => {
    const { kind, refId, notify } = req.body ?? {};
    if (!isValidFollowKind(kind) || !refId || typeof notify !== "boolean") {
      res.status(400).json({ message: "بيانات تحديث المتابعة غير مكتملة" });
      return;
    }
    try {
      await setFollowNotify(req.user.id, kind, String(refId), notify);
      res.set("Cache-Control", "private, no-store");
      res.json({ ok: true });
    } catch (error) {
      console.error("[Sports] update follow notify failed:", error);
      res.status(502).json({ message: "تعذر تحديث إعداد الإشعار حاليًا" });
    }
  });

  // إلغاء متابعة (?kind=&refId=)
  app.delete("/api/sports/follows", requireAuth, async (req: any, res) => {
    const kind = req.query.kind;
    const refId = req.query.refId;
    if (!isValidFollowKind(kind) || !refId) {
      res.status(400).json({ message: "بيانات إلغاء المتابعة غير مكتملة" });
      return;
    }
    try {
      await removeFollow(req.user.id, kind, String(refId));
      res.set("Cache-Control", "private, no-store");
      res.json({ ok: true });
    } catch (error) {
      console.error("[Sports] remove follow failed:", error);
      res.status(502).json({ message: "تعذر إلغاء المتابعة حاليًا" });
    }
  });

  // تفضيلات أنواع تنبيهات المباريات (عامّة على كل الفِرق المتابَعة): انطلاق/أهداف/
  // بطاقات/فار/نهاية. نظيرة /api/v1/sports/alert-prefs للموبايل لكن بجلسة Passport.
  app.get("/api/sports/alert-prefs", requireAuth, async (req: any, res) => {
    try {
      const { getPrefs } = await import("../services/sportsAlertPrefsService");
      const preferences = await getPrefs(req.user.id);
      res.set("Cache-Control", "private, no-store");
      res.json({ preferences });
    } catch (error) {
      console.error("[Sports] get alert-prefs failed:", error);
      res.status(502).json({ message: "تعذر جلب تفضيلات الإشعارات حاليًا" });
    }
  });

  app.put("/api/sports/alert-prefs", requireAuth, async (req: any, res) => {
    try {
      const { upsertPrefs } = await import("../services/sportsAlertPrefsService");
      const body = req.body ?? {};
      const patch: Record<string, boolean> = {};
      for (const key of ["kickoff", "goals", "cards", "varReview", "fulltime"] as const) {
        if (typeof body[key] === "boolean") patch[key] = body[key];
      }
      const preferences = await upsertPrefs(req.user.id, patch);
      res.set("Cache-Control", "private, no-store");
      res.json({ preferences });
    } catch (error) {
      console.error("[Sports] save alert-prefs failed:", error);
      res.status(502).json({ message: "تعذر حفظ تفضيلات الإشعارات حاليًا" });
    }
  });

  // المواجهات المباشرة بين فريقين (?home=&away=). تُستدعى من نافذة المباراة.
  app.get("/api/sports/h2h", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.json({ configured: false, summary: null, meetings: [] });
      return;
    }
    const home = parseId(req.query.home);
    const away = parseId(req.query.away);
    if (home == null || away == null) {
      res.status(400).json({ message: "معرّفا الفريقين مطلوبان" });
      return;
    }
    try {
      const h2h = await getHeadToHead(home, away);
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      res.json({ configured: true, ...h2h });
    } catch (error) {
      console.error("[Sports] h2h failed:", error);
      res.status(502).json({ message: "تعذر جلب المواجهات حاليًا" });
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

  // ============================================================
  // المرحلة 4 (المجتمع): توقّع النتيجة + لوحة المتصدّرين
  // الإرسال/توقّعاتي تتطلّب جلسة ويب (requireAuth)؛ اللوحة عامة.
  // النقاط: نتيجة مطابقة = 3، اتجاه صحيح = 1، خطأ = 0 (تُسوّى بعد انتهاء المباراة).
  // ============================================================

  const clampGoals = (raw: unknown): number | null => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 30) return null;
    return n;
  };

  // توقّعي لمباراة محدّدة
  app.get("/api/sports/match/:id/predict", requireAuth, async (req: any, res) => {
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف مباراة غير صحيح" });
      return;
    }
    try {
      const prediction = await getMyPrediction(req.user.id, id);
      res.set("Cache-Control", "private, no-store");
      res.json({ prediction });
    } catch (error) {
      console.error("[Sports] get my prediction failed:", error);
      res.status(502).json({ message: "تعذر جلب توقّعك حاليًا" });
    }
  });

  // إرسال/تعديل توقّع (يُقفل عند انطلاق المباراة)
  app.post("/api/sports/match/:id/predict", requireAuth, async (req: any, res) => {
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف مباراة غير صحيح" });
      return;
    }
    const { predHome, predAway, kickoffTs, competitionSlug, homeId, awayId, homeName, awayName, homeLogo, awayLogo } = req.body ?? {};
    const ph = clampGoals(predHome);
    const pa = clampGoals(predAway);
    const ko = Number(kickoffTs);
    if (ph == null || pa == null || !Number.isFinite(ko) || ko <= 0 || !homeName || !awayName) {
      res.status(400).json({ message: "بيانات التوقّع غير مكتملة" });
      return;
    }
    try {
      const result = await submitPrediction(req.user.id, {
        fixtureId: id,
        kickoffTs: ko,
        competitionSlug: competitionSlug ? String(competitionSlug) : null,
        homeId: Number.isFinite(Number(homeId)) ? Number(homeId) : null,
        awayId: Number.isFinite(Number(awayId)) ? Number(awayId) : null,
        homeName: String(homeName),
        awayName: String(awayName),
        homeLogo: homeLogo ? String(homeLogo) : null,
        awayLogo: awayLogo ? String(awayLogo) : null,
        predHome: ph,
        predAway: pa,
      });
      res.set("Cache-Control", "private, no-store");
      if (result.locked) {
        res.status(409).json({ message: "أُقفل التوقّع — انطلقت المباراة" });
        return;
      }
      res.json({ prediction: result.prediction });
    } catch (error) {
      console.error("[Sports] submit prediction failed:", error);
      res.status(502).json({ message: "تعذر حفظ توقّعك حاليًا" });
    }
  });

  // توقّعاتي (قائمة)
  app.get("/api/sports/predictions/me", requireAuth, async (req: any, res) => {
    try {
      const [predictions, stats] = await Promise.all([
        listMyPredictions(req.user.id),
        getUserStats(req.user.id),
      ]);
      res.set("Cache-Control", "private, no-store");
      res.json({ predictions, stats });
    } catch (error) {
      console.error("[Sports] my predictions failed:", error);
      res.status(502).json({ message: "تعذر جلب توقّعاتك حاليًا" });
    }
  });

  // لوحة المتصدّرين (عامة) — ?period=all|month|week
  app.get("/api/sports/leaderboard", async (req, res) => {
    const periodRaw = String(req.query.period || "all");
    const period = periodRaw === "week" || periodRaw === "month" ? periodRaw : "all";
    try {
      const leaderboard = await getLeaderboard(period, 50);
      res.set("Cache-Control", "public, max-age=60, s-maxage=180, stale-while-revalidate=600");
      res.json({ period, leaderboard });
    } catch (error) {
      console.error("[Sports] leaderboard failed:", error);
      res.status(502).json({ message: "تعذر جلب لوحة المتصدّرين حاليًا" });
    }
  });
}
