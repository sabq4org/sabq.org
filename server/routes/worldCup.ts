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
  getStandings,
  getTopScorers,
  isWorldCupConfigured,
} from "../services/worldCupService";

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
