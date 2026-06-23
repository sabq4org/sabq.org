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
}
