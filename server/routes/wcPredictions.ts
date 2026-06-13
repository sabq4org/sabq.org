/**
 * مسابقة توقّعات كأس العالم — مسارات HTTP.
 *
 *   GET  /api/world-cup/predictions/today            مباريات اليوم + توقّعي (اختياري الدخول)
 *   POST /api/world-cup/predictions                  حفظ/تعديل توقّع (requireAuth)
 *   GET  /api/world-cup/predictions/mine             سجل توقّعاتي (requireAuth)
 *   GET  /api/world-cup/predictions/leaderboard      المتصدّرون (عام)
 *   GET  /api/world-cup/predictions/match/:fixtureId عدّادات + نتيجة (عام)
 *
 * ADR-001: كل استعلامات Drizzle في wcPredictionsService — هذا المسار لا يستورد db.
 */
import { Router } from "express";
import { requireAuth } from "../rbac";
import { isWorldCupConfigured } from "../services/worldCupService";
import {
  submitPrediction,
  getMyPredictions,
  getLeaderboard,
  getTodayPredictableMatches,
  getMatchPredictionsSummary,
} from "../services/wcPredictionsService";

const router = Router();

const NOT_CONFIGURED = { configured: false, message: "مسابقة التوقّعات غير مفعّلة حاليًا" };

function guard(res: any): boolean {
  if (!isWorldCupConfigured()) {
    res.status(503).json(NOT_CONFIGURED);
    return false;
  }
  return true;
}

const noStore = (res: any) => res.set("Cache-Control", "private, no-store");

// مباريات اليوم — قائمة عامة، لكن متى رُفق مستخدم يحوي الردّ توقّعه الشخصي
// (myPrediction) فيجب ألا يُشارَك في كاش الحافة. نفرّع الهيدر تبعًا.
router.get("/api/world-cup/predictions/today", async (req: any, res) => {
  if (!guard(res)) return;
  try {
    const userId = req.isAuthenticated?.() && req.user ? req.user.id : undefined;
    const matches = await getTodayPredictableMatches(userId);
    if (userId) {
      noStore(res);
    } else {
      res.set("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=60");
    }
    res.json({ matches });
  } catch (error) {
    console.error("[WC Predictions] today error:", error);
    res.status(502).json({ message: "تعذر جلب مباريات اليوم حاليًا" });
  }
});

router.post("/api/world-cup/predictions", requireAuth, async (req: any, res) => {
  if (!guard(res)) return;
  noStore(res);
  try {
    const fixtureId = Number(req.body?.fixtureId);
    const predHome = Number(req.body?.predHome);
    const predAway = Number(req.body?.predAway);
    if (!Number.isFinite(fixtureId)) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }

    const result = await submitPrediction(req.user.id, fixtureId, predHome, predAway);
    if (!result.ok) {
      const map = {
        NOT_FOUND: { code: 404, message: "المباراة غير موجودة" },
        LOCKED: { code: 409, message: "أُغلق التوقّع — انطلقت المباراة" },
        INVALID: { code: 400, message: "نتيجة غير صالحة" },
      } as const;
      const m = map[result.reason];
      return res.status(m.code).json({ message: m.message });
    }
    res.json({ prediction: result.prediction });
  } catch (error) {
    console.error("[WC Predictions] submit error:", error);
    res.status(500).json({ message: "تعذر حفظ التوقّع" });
  }
});

router.get("/api/world-cup/predictions/mine", requireAuth, async (req: any, res) => {
  if (!guard(res)) return;
  noStore(res);
  try {
    res.json({ predictions: await getMyPredictions(req.user.id) });
  } catch (error) {
    console.error("[WC Predictions] mine error:", error);
    res.status(502).json({ message: "تعذر جلب توقّعاتك حاليًا" });
  }
});

router.get("/api/world-cup/predictions/leaderboard", async (_req, res) => {
  if (!guard(res)) return;
  try {
    res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
    res.json({ leaders: await getLeaderboard() });
  } catch (error) {
    console.error("[WC Predictions] leaderboard error:", error);
    res.status(502).json({ message: "تعذر جلب المتصدّرين حاليًا" });
  }
});

router.get("/api/world-cup/predictions/match/:fixtureId", async (req, res) => {
  if (!guard(res)) return;
  const fixtureId = Number(req.params.fixtureId);
  if (!Number.isFinite(fixtureId)) {
    return res.status(400).json({ message: "معرّف مباراة غير صالح" });
  }
  try {
    res.set("Cache-Control", "public, max-age=10, s-maxage=15, stale-while-revalidate=30");
    res.json(await getMatchPredictionsSummary(fixtureId));
  } catch (error) {
    console.error("[WC Predictions] match summary error:", error);
    res.status(502).json({ message: "تعذر جلب ملخص المباراة حاليًا" });
  }
});

export default router;
