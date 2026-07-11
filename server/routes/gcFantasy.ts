/**
 * «فانتازي خليجي المصغّر» — مسارات HTTP (خلف علم المسابقة نفسه).
 *
 *   GET  /api/gulf-cup/fantasy/pool          مجموعة اللاعبين بالأسعار (عام)
 *   GET  /api/gulf-cup/fantasy/mine          تشكيلتي + نقاطها (requireAuth)
 *   POST /api/gulf-cup/fantasy               حفظ تشكيلة {playerIds[7], captainId}
 *   GET  /api/gulf-cup/fantasy/leaderboard   ترتيب الفانتازي (عام)
 *
 * ADR-001: كل استعلامات Drizzle في gcFantasyService — هذا المسار لا يستورد db.
 */
import { Router } from "express";
import { requireAuth } from "../rbac";
import { isGcPredictionsEnabled } from "../services/gcPredictionsService";
import {
  FANTASY_BUDGET,
  FANTASY_SQUAD_SIZE,
  getFantasyLeaderboard,
  getFantasyPool,
  getMyFantasy,
  saveFantasySquad,
} from "../services/gcFantasyService";

const router = Router();

const SAVE_REASONS: Record<string, string> = {
  SIZE: `اختر ${FANTASY_SQUAD_SIZE} لاعبين بالضبط`,
  DUPLICATE: "لا تكرّر اللاعب نفسه",
  CAPTAIN: "اختر قائدًا من ضمن تشكيلتك",
  POOL_EMPTY: "قائمة اللاعبين غير متاحة بعد",
  UNKNOWN_PLAYER: "أحد اللاعبين خارج قائمة البطولة",
  OVER_BUDGET: `تجاوزت الميزانية (${FANTASY_BUDGET} نقطة)`,
};

function guard(res: any): boolean {
  if (!isGcPredictionsEnabled()) {
    res.status(503).json({ configured: false, message: "فانتازي خليجي 27 غير مفعّل حاليًا" });
    return false;
  }
  return true;
}

const noStore = (res: any) => res.set("Cache-Control", "private, no-store");
const publicCache = (res: any) =>
  res.set("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=1200");

router.get("/api/gulf-cup/fantasy/pool", async (_req, res) => {
  if (!guard(res)) return;
  try {
    publicCache(res);
    res.json({ budget: FANTASY_BUDGET, squadSize: FANTASY_SQUAD_SIZE, players: await getFantasyPool() });
  } catch (error) {
    console.error("[GC Fantasy] pool error:", error);
    res.status(502).json({ message: "تعذّر جلب قائمة اللاعبين حاليًا" });
  }
});

router.get("/api/gulf-cup/fantasy/mine", requireAuth, async (req: any, res) => {
  if (!guard(res)) return;
  try {
    noStore(res);
    res.json({ squad: await getMyFantasy(req.user.id) });
  } catch (error) {
    console.error("[GC Fantasy] mine error:", error);
    res.status(502).json({ message: "تعذّر جلب تشكيلتك حاليًا" });
  }
});

router.post("/api/gulf-cup/fantasy", requireAuth, async (req: any, res) => {
  if (!guard(res)) return;
  try {
    const result = await saveFantasySquad(req.user.id, req.body?.playerIds, req.body?.captainId);
    if (!result.ok) {
      res.status(400).json({ message: SAVE_REASONS[result.reason] ?? "تعذّر حفظ التشكيلة", reason: result.reason });
      return;
    }
    noStore(res);
    res.json({ saved: true, spent: result.data.spent });
  } catch (error) {
    console.error("[GC Fantasy] save error:", error);
    res.status(502).json({ message: "تعذّر حفظ التشكيلة حاليًا" });
  }
});

router.get("/api/gulf-cup/fantasy/leaderboard", async (_req, res) => {
  if (!guard(res)) return;
  try {
    publicCache(res);
    res.json({ leaders: await getFantasyLeaderboard() });
  } catch (error) {
    console.error("[GC Fantasy] leaderboard error:", error);
    res.status(502).json({ message: "تعذّر جلب ترتيب الفانتازي حاليًا" });
  }
});

export default router;
