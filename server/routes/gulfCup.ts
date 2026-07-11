/**
 * قسم «خليجي 27» (كأس الخليج العربي 27 — جدة 2026) — نقاط عامة (لا تتطلب تسجيل).
 * الأساس بيانات ثابتة رسمية عبر gulfCupService، تُدمج فوقها نتائج API-Football
 * الحيّة تلقائيًّا متى توفّر موسم البطولة. Cache-Control متدرّج حسب سخونة البيانات.
 */
import type { Express } from "express";
import {
  getGcOverview,
  getGcTeams,
  getGcFixtures,
  getGcStandings,
  getGcTeamProfile,
  getGcMatchDetail,
  getGcScorers,
  getGcHistory,
  getGcStars,
  isGulfCupConfigured,
} from "../services/gulfCupService";
import {
  getTournamentBlockSettings,
  isBlockHidden,
} from "../services/tournamentBlockSettings";
import { detectCupChampion, manualCupChampion } from "../services/cupChampion";
import { getTeamOfTheWeek, isSportmonksConfigured } from "../services/sportmonksService";

const NOT_CONFIGURED = {
  configured: false,
  message: "تغطية خليجي 27 غير مفعّلة حاليًا",
};

export function registerGulfCupRoutes(app: Express) {
  const guard = (res: any): boolean => {
    if (!isGulfCupConfigured()) {
      res.status(503).json(NOT_CONFIGURED);
      return false;
    }
    return true;
  };

  app.get("/api/gulf-cup/overview", async (_req, res) => {
    if (!guard(res)) return;
    try {
      // إعدادات بلوك الرئيسية من اللوحة: blockHidden يخفي بلوك الواجهة فقط —
      // لا نفرّغ الحمولة لأن صفحة /gulf-cup نفسها تستهلك overview هذا.
      // champion يُكشف تلقائيًا من النهائي، واليدوي من اللوحة يتقدّم عليه.
      const [ov, fixtures, settings] = await Promise.all([
        getGcOverview(),
        getGcFixtures().catch(() => []),
        getTournamentBlockSettings("gulf-cup"),
      ]);
      let champion = detectCupChampion(fixtures);
      if (settings.manualChampionTeamId && champion?.team.id !== settings.manualChampionTeamId) {
        champion = manualCupChampion(fixtures, settings.manualChampionTeamId) ?? champion;
      }
      // كاش أقصر من السابق (كان 60/120) كي يصل تبديل المفتاح خلال ≤دقيقة
      res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=300");
      res.json({ ...ov, blockHidden: isBlockHidden(settings), champion });
    } catch (error) {
      console.error("[GulfCup] overview failed:", error);
      res.status(502).json({ message: "تعذر جلب نظرة خليجي 27 حاليًا" });
    }
  });

  app.get("/api/gulf-cup/teams", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      res.json({ teams: await getGcTeams() });
    } catch (error) {
      console.error("[GulfCup] teams failed:", error);
      res.status(502).json({ message: "تعذر جلب قائمة المنتخبات حاليًا" });
    }
  });

  app.get("/api/gulf-cup/fixtures", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=30, s-maxage=120, stale-while-revalidate=300");
      res.json({ fixtures: await getGcFixtures() });
    } catch (error) {
      console.error("[GulfCup] fixtures failed:", error);
      res.status(502).json({ message: "تعذر جلب جدول المباريات حاليًا" });
    }
  });

  app.get("/api/gulf-cup/standings", async (_req, res) => {
    if (!guard(res)) return;
    try {
      const groups = await getGcStandings();
      const hasLive = groups.some((g) => g.rows.some((r) => r.live));
      res.set(
        "Cache-Control",
        hasLive
          ? "public, max-age=0, s-maxage=5, stale-while-revalidate=15"
          : "public, max-age=120, s-maxage=300, stale-while-revalidate=600",
      );
      res.json({ groups });
    } catch (error) {
      console.error("[GulfCup] standings failed:", error);
      res.status(502).json({ message: "تعذر جلب ترتيب المجموعات حاليًا" });
    }
  });

  app.get("/api/gulf-cup/scorers", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=1800");
      res.json(await getGcScorers());
    } catch (error) {
      console.error("[GulfCup] scorers failed:", error);
      res.status(502).json({ message: "تعذر جلب قائمة الهدّافين حاليًا" });
    }
  });

  app.get("/api/gulf-cup/history", async (_req, res) => {
    if (!guard(res)) return;
    try {
      // سجلّ ثابت محلّي — كاش طويل
      res.set("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400");
      res.json(getGcHistory());
    } catch (error) {
      console.error("[GulfCup] history failed:", error);
      res.status(502).json({ message: "تعذر جلب سجلّ البطولة حاليًا" });
    }
  });

  // «نجم البطولة» — أغلى اللاعبين بالقيمة السوقية (TheSports). [] قبل توفر
  // بيانات الموسم؛ الواجهة تخفي القسم عندها.
  app.get("/api/gulf-cup/stars", async (_req, res) => {
    if (!guard(res)) return;
    try {
      const stars = await getGcStars();
      res.set("Cache-Control", "public, max-age=1800, s-maxage=3600, stale-while-revalidate=7200");
      res.json({ stars });
    } catch (error) {
      console.error("[GulfCup] stars failed:", error);
      res.status(502).json({ message: "تعذر جلب نجوم البطولة حاليًا" });
    }
  });

  // تشكيلة الجولة المثالية (Sportmonks) — تتفعّل بضبط SM_GULF_LEAGUE_ID متى
  // أعلن المزوّد معرّف دوري كأس الخليج. 204 = غير متاحة (الواجهة تخفي القسم).
  app.get("/api/gulf-cup/totw", async (_req, res) => {
    const leagueId = Number(process.env.SM_GULF_LEAGUE_ID || 0);
    if (!leagueId || !isSportmonksConfigured()) {
      res.status(204).end();
      return;
    }
    try {
      const totw = await getTeamOfTheWeek(leagueId);
      if (!totw?.available) {
        res.status(204).end();
        return;
      }
      res.set("Cache-Control", "public, max-age=3600, s-maxage=7200, stale-while-revalidate=14400");
      res.json(totw);
    } catch (error) {
      console.error("[GulfCup] totw failed:", error);
      res.status(204).end();
    }
  });

  app.get("/api/gulf-cup/team/:id", async (req, res) => {
    if (!guard(res)) return;
    const teamId = Number(req.params.id);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      res.status(400).json({ message: "معرّف منتخب غير صالح" });
      return;
    }
    try {
      const profile = await getGcTeamProfile(teamId);
      if (!profile) {
        res.status(404).json({ message: "المنتخب غير موجود" });
        return;
      }
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json(profile);
    } catch (error) {
      console.error(`[GulfCup] team ${teamId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب بيانات المنتخب حاليًا" });
    }
  });

  app.get("/api/gulf-cup/match/:id", async (req, res) => {
    if (!guard(res)) return;
    const fixtureId = Number(req.params.id);
    if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
      res.status(400).json({ message: "معرّف مباراة غير صالح" });
      return;
    }
    try {
      const detail = await getGcMatchDetail(fixtureId);
      if (!detail) {
        res.status(404).json({ message: "المباراة غير موجودة" });
        return;
      }
      const ttl = detail.fixture.status.live ? 15 : detail.fixture.status.finished ? 600 : 60;
      res.set("Cache-Control", `public, max-age=${ttl}, s-maxage=${ttl * 2}, stale-while-revalidate=${ttl * 4}`);
      res.json(detail);
    } catch (error) {
      console.error(`[GulfCup] match ${fixtureId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب تفاصيل المباراة حاليًا" });
    }
  });
}
