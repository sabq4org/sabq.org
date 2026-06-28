/**
 * قسم كأس آسيا 2027 — نقاط عامة (لا تتطلب تسجيل دخول).
 * البيانات من API-Football عبر asianCupService خلف كاش SWR، مع Cache-Control
 * متدرّج حسب سخونة البيانات. البطولة في يناير 2027 (وضع معاينة/عدّ تنازلي الآن).
 */
import type { Express } from "express";
import {
  getAcOverview,
  getAcTeams,
  getAcFixtures,
  getAcStandings,
  getAcTopScorers,
  getAcBracket,
  getAcTeamProfile,
  getAcMatchDetail,
  isAsianCupConfigured,
} from "../services/asianCupService";

const NOT_CONFIGURED = {
  configured: false,
  message: "تغطية كأس آسيا غير مفعّلة حاليًا",
};

export function registerAsianCupRoutes(app: Express) {
  const guard = (res: any): boolean => {
    if (!isAsianCupConfigured()) {
      res.status(503).json(NOT_CONFIGURED);
      return false;
    }
    return true;
  };

  app.get("/api/asian-cup/overview", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=600");
      res.json(await getAcOverview());
    } catch (error) {
      console.error("[AsianCup] overview failed:", error);
      res.status(502).json({ message: "تعذر جلب نظرة كأس آسيا حاليًا" });
    }
  });

  app.get("/api/asian-cup/teams", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      res.json({ teams: await getAcTeams() });
    } catch (error) {
      console.error("[AsianCup] teams failed:", error);
      res.status(502).json({ message: "تعذر جلب قائمة المنتخبات حاليًا" });
    }
  });

  app.get("/api/asian-cup/fixtures", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=30, s-maxage=120, stale-while-revalidate=300");
      res.json({ fixtures: await getAcFixtures() });
    } catch (error) {
      console.error("[AsianCup] fixtures failed:", error);
      res.status(502).json({ message: "تعذر جلب جدول المباريات حاليًا" });
    }
  });

  app.get("/api/asian-cup/standings", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=120, s-maxage=300, stale-while-revalidate=600");
      res.json({ groups: await getAcStandings() });
    } catch (error) {
      console.error("[AsianCup] standings failed:", error);
      res.status(502).json({ message: "تعذر جلب ترتيب المجموعات حاليًا" });
    }
  });

  app.get("/api/asian-cup/scorers", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json({ scorers: await getAcTopScorers() });
    } catch (error) {
      console.error("[AsianCup] scorers failed:", error);
      res.status(502).json({ message: "تعذر جلب قائمة الهدّافين حاليًا" });
    }
  });

  app.get("/api/asian-cup/bracket", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
      res.json(await getAcBracket());
    } catch (error) {
      console.error("[AsianCup] bracket failed:", error);
      res.status(502).json({ message: "تعذر جلب شجرة الأدوار حاليًا" });
    }
  });

  app.get("/api/asian-cup/team/:id", async (req, res) => {
    if (!guard(res)) return;
    const teamId = Number(req.params.id);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      res.status(400).json({ message: "معرّف منتخب غير صالح" });
      return;
    }
    try {
      const profile = await getAcTeamProfile(teamId);
      if (!profile) {
        res.status(404).json({ message: "المنتخب غير موجود" });
        return;
      }
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json(profile);
    } catch (error) {
      console.error(`[AsianCup] team ${teamId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب بيانات المنتخب حاليًا" });
    }
  });

  app.get("/api/asian-cup/match/:id", async (req, res) => {
    if (!guard(res)) return;
    const fixtureId = Number(req.params.id);
    if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
      res.status(400).json({ message: "معرّف مباراة غير صالح" });
      return;
    }
    try {
      const detail = await getAcMatchDetail(fixtureId);
      if (!detail) {
        res.status(404).json({ message: "المباراة غير موجودة" });
        return;
      }
      // كاش قصير للمباريات الحيّة، أطول للمنتهية/القادمة
      const ttl = detail.fixture.status.live ? 15 : detail.fixture.status.finished ? 600 : 60;
      res.set("Cache-Control", `public, max-age=${ttl}, s-maxage=${ttl * 2}, stale-while-revalidate=${ttl * 4}`);
      res.json(detail);
    } catch (error) {
      console.error(`[AsianCup] match ${fixtureId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب تفاصيل المباراة حاليًا" });
    }
  });
}
