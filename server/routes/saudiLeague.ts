/**
 * قسم البطولات السعودية — نقاط عامة (لا تتطلب تسجيل دخول).
 * البيانات من API-Football عبر saudiLeagueService خلف كاش SWR.
 *
 * يغطّي كل البطولات في السجل (دوري روشن، الدرجة الأولى/الثانية، كأس الملك،
 * السوبر، دوري السيدات). البطولة تُمرَّر في المسار: /api/saudi-league/:comp/...
 *
 * القسم مخفي قيد التطوير: كل النقاط ترد 404 ما لم يكن SAUDI_LEAGUE_ENABLED=true.
 * لا يمسّ قسم المونديال.
 */
import type { Express, Request, Response } from "express";
import {
  getCompetition,
  getFixtures,
  getLiveFixtures,
  getMatchDetail,
  getStandings,
  getTopScorers,
  isSaudiLeagueConfigured,
  isSaudiLeagueEnabled,
  listCompetitions,
  type SaudiCompetition,
} from "../services/saudiLeagueService";

const NOT_FOUND = { message: "غير موجود" };
const NOT_CONFIGURED = { configured: false, message: "تغطية البطولات السعودية غير مفعّلة حاليًا" };

export function registerSaudiLeagueRoutes(app: Express) {
  // البوابة: مخفي → 404 ما لم يُرفع العلم، و503 لو رُفع العلم بلا مفتاح API
  const guard = (res: Response): boolean => {
    if (!isSaudiLeagueEnabled()) {
      res.status(404).json(NOT_FOUND);
      return false;
    }
    if (!isSaudiLeagueConfigured()) {
      res.status(503).json(NOT_CONFIGURED);
      return false;
    }
    return true;
  };

  // يحوّل :comp إلى بطولة معروفة، أو يرد 404
  const resolve = (req: Request, res: Response): SaudiCompetition | null => {
    const comp = getCompetition(String(req.params.comp));
    if (!comp) {
      res.status(404).json({ message: "بطولة غير معروفة" });
      return null;
    }
    return comp;
  };

  // قائمة البطولات المتاحة (لمبدّل البطولات في الواجهة)
  app.get("/api/saudi-league/competitions", (_req, res) => {
    if (!guard(res)) return;
    res.set("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400");
    res.json({ competitions: listCompetitions() });
  });

  app.get("/api/saudi-league/:comp/fixtures", async (req, res) => {
    if (!guard(res)) return;
    const comp = resolve(req, res);
    if (!comp) return;
    try {
      res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
      res.json({ fixtures: await getFixtures(comp) });
    } catch (error) {
      console.error("[SaudiLeague] fixtures failed:", error);
      res.status(502).json({ message: "تعذر جلب جدول المباريات حاليًا" });
    }
  });

  app.get("/api/saudi-league/:comp/live", async (req, res) => {
    if (!guard(res)) return;
    const comp = resolve(req, res);
    if (!comp) return;
    try {
      res.set("Cache-Control", "public, max-age=10, s-maxage=15, stale-while-revalidate=30");
      res.json({ fixtures: await getLiveFixtures(comp) });
    } catch (error) {
      console.error("[SaudiLeague] live failed:", error);
      res.status(502).json({ message: "تعذر جلب المباريات المباشرة حاليًا" });
    }
  });

  app.get("/api/saudi-league/:comp/standings", async (req, res) => {
    if (!guard(res)) return;
    const comp = resolve(req, res);
    if (!comp) return;
    try {
      res.set("Cache-Control", "public, max-age=120, s-maxage=300, stale-while-revalidate=600");
      res.json({ standings: await getStandings(comp) });
    } catch (error) {
      console.error("[SaudiLeague] standings failed:", error);
      res.status(502).json({ message: "تعذر جلب الترتيب حاليًا" });
    }
  });

  app.get("/api/saudi-league/:comp/scorers", async (req, res) => {
    if (!guard(res)) return;
    const comp = resolve(req, res);
    if (!comp) return;
    try {
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json({ scorers: await getTopScorers(comp) });
    } catch (error) {
      console.error("[SaudiLeague] scorers failed:", error);
      res.status(502).json({ message: "تعذر جلب قائمة الهدافين حاليًا" });
    }
  });

  // تفاصيل مباراة — معرّف المباراة عام عند المزود فلا يحتاج تحديد البطولة
  app.get("/api/saudi-league/match/:id", async (req, res) => {
    if (!guard(res)) return;
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
      console.error("[SaudiLeague] match detail failed:", error);
      res.status(502).json({ message: "تعذر جلب تفاصيل المباراة حاليًا" });
    }
  });
}
