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
  isGulfCupConfigured,
} from "../services/gulfCupService";

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
      res.set("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=600");
      res.json(await getGcOverview());
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
      res.set("Cache-Control", "public, max-age=120, s-maxage=300, stale-while-revalidate=600");
      res.json({ groups: await getGcStandings() });
    } catch (error) {
      console.error("[GulfCup] standings failed:", error);
      res.status(502).json({ message: "تعذر جلب ترتيب المجموعات حاليًا" });
    }
  });
}
