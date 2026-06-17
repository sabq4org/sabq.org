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
  getFixtures,
  getLiveFixtures,
  getMatchDetail,
  getPlayerCard,
  getSquad,
  getStandings,
  getTeamProfile,
  getTopScorers,
  isSaudiLeagueConfigured,
  listCompetitions,
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
  app.get("/api/sports/competitions", (_req, res) => {
    res.set("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400");
    res.json({ configured: isSaudiLeagueConfigured(), competitions: listCompetitions() });
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

  const parseId = (raw: unknown): number | null => {
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  };

  // صفحة النادي: هوية + ترتيب + مباريات + تشكيلة — المعرّف عام عند المزود.
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
      const profile = await getTeamProfile(id);
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
      res.json(player);
    } catch (error) {
      console.error("[Sports] player card failed:", error);
      res.status(502).json({ message: "تعذر جلب ملف اللاعب حاليًا" });
    }
  });
}
