/**
 * قسم كأس العالم 2026 — نقاط عامة (لا تتطلب تسجيل دخول).
 * البيانات من API-Football عبر worldCupService خلف كاش SWR،
 * مع Cache-Control متدرّج حسب سخونة البيانات.
 */
import type { Express } from "express";
import {
  getFixtures,
  getLiveFixtures,
  getMatchDetail,
  getOverview,
  getPlayerCard,
  getSquad,
  getStandings,
  getTeamProfile,
  getTeams,
  getTopAssists,
  getTopCards,
  getTopScorers,
  isWorldCupConfigured,
} from "../services/worldCupService";
import { getWorldCupNews } from "../services/worldCupNewsGenerator";
import { getMomentum, getCommentary, isSportmonksConfigured } from "../services/sportmonksService";

const NOT_CONFIGURED = {
  configured: false,
  message: "تغطية كأس العالم غير مفعّلة حاليًا",
};

export function registerWorldCupRoutes(app: Express) {
  const guard = (res: any): boolean => {
    if (!isWorldCupConfigured()) {
      res.status(503).json(NOT_CONFIGURED);
      return false;
    }
    return true;
  };

  app.get("/api/world-cup/overview", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=10, s-maxage=15, stale-while-revalidate=30");
      res.json(await getOverview());
    } catch (error) {
      console.error("[WorldCup] overview failed:", error);
      res.status(502).json({ message: "تعذر جلب نظرة المونديال حاليًا" });
    }
  });

  // الأخبار المولّدة آليًا من بيانات المباريات (معاينات + تقارير) — تُنشر
  // في قسم الرياضة وتُعرض هنا لبلوك الواجهة وصفحة القسم
  app.get("/api/world-cup/news", async (req, res) => {
    if (!guard(res)) return;
    try {
      const limit = Number(req.query.limit) || 6;
      res.set("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300");
      res.json({ news: await getWorldCupNews(limit) });
    } catch (error) {
      console.error("[WorldCup] news failed:", error);
      res.status(502).json({ message: "تعذر جلب أخبار المونديال حاليًا" });
    }
  });

  app.get("/api/world-cup/fixtures", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
      res.json({ fixtures: await getFixtures() });
    } catch (error) {
      console.error("[WorldCup] fixtures failed:", error);
      res.status(502).json({ message: "تعذر جلب جدول المباريات حاليًا" });
    }
  });

  app.get("/api/world-cup/live", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=10, s-maxage=15, stale-while-revalidate=30");
      res.json({ fixtures: await getLiveFixtures() });
    } catch (error) {
      console.error("[WorldCup] live failed:", error);
      res.status(502).json({ message: "تعذر جلب المباريات المباشرة حاليًا" });
    }
  });

  app.get("/api/world-cup/standings", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=120, s-maxage=300, stale-while-revalidate=600");
      res.json({ groups: await getStandings() });
    } catch (error) {
      console.error("[WorldCup] standings failed:", error);
      res.status(502).json({ message: "تعذر جلب ترتيب المجموعات حاليًا" });
    }
  });

  app.get("/api/world-cup/scorers", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json({ scorers: await getTopScorers() });
    } catch (error) {
      console.error("[WorldCup] scorers failed:", error);
      res.status(502).json({ message: "تعذر جلب قائمة الهدافين حاليًا" });
    }
  });

  app.get("/api/world-cup/teams", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      res.json({ teams: await getTeams() });
    } catch (error) {
      console.error("[WorldCup] teams failed:", error);
      res.status(502).json({ message: "تعذر جلب قائمة المنتخبات حاليًا" });
    }
  });

  app.get("/api/world-cup/squad/:teamId", async (req, res) => {
    if (!guard(res)) return;
    const teamId = parseInt(String(req.params.teamId), 10);
    if (!Number.isFinite(teamId) || teamId <= 0) {
      return res.status(400).json({ message: "معرّف منتخب غير صالح" });
    }
    try {
      const squad = await getSquad(teamId);
      if (!squad) return res.status(404).json({ message: "قائمة المنتخب غير متاحة" });
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      res.json(squad);
    } catch (error) {
      console.error(`[WorldCup] squad ${teamId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب قائمة المنتخب حاليًا" });
    }
  });

  // صفحة المنتخب المتكاملة: الهوية + المجموعة والترتيب + كل المباريات + القائمة + المدرّب
  app.get("/api/world-cup/team/:teamId", async (req, res) => {
    if (!guard(res)) return;
    const teamId = parseInt(String(req.params.teamId), 10);
    if (!Number.isFinite(teamId) || teamId <= 0) {
      return res.status(400).json({ message: "معرّف منتخب غير صالح" });
    }
    try {
      const profile = await getTeamProfile(teamId);
      if (!profile) return res.status(404).json({ message: "المنتخب غير موجود" });
      res.set("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300");
      res.json(profile);
    } catch (error) {
      console.error(`[WorldCup] team ${teamId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب صفحة المنتخب حاليًا" });
    }
  });

  // بطاقة اللاعب الشاملة: ملف شخصي + مسيرة + ألقاب + أرقام البطولة + إصابة
  app.get("/api/world-cup/player/:id", async (req, res) => {
    if (!guard(res)) return;
    const playerId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(playerId) || playerId <= 0) {
      return res.status(400).json({ message: "معرّف لاعب غير صالح" });
    }
    try {
      const player = await getPlayerCard(playerId);
      if (!player) return res.status(404).json({ message: "ملف اللاعب غير متاح" });
      res.set("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
      res.json(player);
    } catch (error) {
      console.error(`[WorldCup] player ${playerId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب ملف اللاعب حاليًا" });
    }
  });

  app.get("/api/world-cup/assists", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json({ leaders: await getTopAssists() });
    } catch (error) {
      console.error("[WorldCup] assists failed:", error);
      res.status(502).json({ message: "تعذر جلب قائمة صناع الأهداف حاليًا" });
    }
  });

  app.get("/api/world-cup/cards", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json({ leaders: await getTopCards() });
    } catch (error) {
      console.error("[WorldCup] cards failed:", error);
      res.status(502).json({ message: "تعذر جلب قائمة البطاقات حاليًا" });
    }
  });

  // الزخم الهجومي عبر الزمن (من trends — إضافة Match Facts بـSportMonks).
  app.get("/api/world-cup/momentum/:id", async (req, res) => {
    if (!isSportmonksConfigured()) {
      return res
        .status(503)
        .json({ configured: false, message: "رسم الزخم غير مفعّل حاليًا", points: [] });
    }
    const fixtureId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }
    const directSmId = Number(req.query.smId) || undefined;
    try {
      const data = await getMomentum(fixtureId, { directSmId });
      res.set(
        "Cache-Control",
        data.live
          ? "public, max-age=15, s-maxage=20, stale-while-revalidate=40"
          : "public, max-age=120, s-maxage=300, stale-while-revalidate=600"
      );
      res.json(data);
    } catch (error) {
      console.error(`[WorldCup] momentum ${fixtureId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب رسم الزخم حاليًا", points: [] });
    }
  });

  // التعليق المباشر المترجم للعربية (من commentaries — إضافة Match Facts بـSportMonks).
  // يُرجّع اللحظات المهمة فقط (أهداف + أحداث بارزة)، مُعرّبة.
  app.get("/api/world-cup/commentary/:id", async (req, res) => {
    if (!isSportmonksConfigured()) {
      return res
        .status(503)
        .json({ configured: false, message: "التعليق المباشر غير مفعّل حاليًا", items: [] });
    }
    const fixtureId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }
    const directSmId = Number(req.query.smId) || undefined;
    try {
      const data = await getCommentary(fixtureId, { directSmId });
      res.set(
        "Cache-Control",
        data.live
          ? "public, max-age=15, s-maxage=20, stale-while-revalidate=40"
          : "public, max-age=120, s-maxage=300, stale-while-revalidate=600"
      );
      res.json(data);
    } catch (error) {
      console.error(`[WorldCup] commentary ${fixtureId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب التعليق المباشر حاليًا", items: [] });
    }
  });

  app.get("/api/world-cup/match/:id", async (req, res) => {
    if (!guard(res)) return;
    const fixtureId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }
    try {
      const detail = await getMatchDetail(fixtureId);
      if (!detail) return res.status(404).json({ message: "المباراة غير موجودة" });
      res.set("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=60");
      res.json(detail);
    } catch (error) {
      console.error(`[WorldCup] match ${fixtureId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب تفاصيل المباراة حاليًا" });
    }
  });
}
