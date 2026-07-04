/**
 * مسابقة توقّعات «خليجي 27» — مسارات HTTP.
 *
 *   GET  /api/gulf-cup/predictions/today             مباريات اليوم + احتمالات + إجماع + توقّعي + إحصاءاتي + الجائزة المتراكمة
 *   POST /api/gulf-cup/predictions                   حفظ/تعديل توقّع (requireAuth)
 *   GET  /api/gulf-cup/predictions/mine              سجل توقّعاتي (requireAuth)
 *   GET  /api/gulf-cup/predictions/leaderboard       المتصدّرون (عام)
 *   GET  /api/gulf-cup/predictions/match/:fixtureId  عدّادات + إجماع + نتيجة + حساب البركة (عام)
 *   GET  /api/gulf-cup/predictions/long              توقّعات طويلة المدى (البطل/الهدّاف) + توقّعي
 *   POST /api/gulf-cup/predictions/long              حفظ توقّع طويل المدى (requireAuth)
 *
 * ADR-001: كل استعلامات Drizzle في gcPredictionsService — هذا المسار لا يستورد db.
 */
import { Router } from "express";
import { requireAuth } from "../rbac";
import {
  isGcPredictionsEnabled,
  submitPrediction,
  getMyPredictions,
  getLeaderboard,
  getLeaderboardMeta,
  getUpcomingPredictableMatches,
  getMatchPredictionsSummary,
  getLongPredictions,
  submitLongPrediction,
  type GcLongKind,
} from "../services/gcPredictionsService";

const router = Router();

const NOT_CONFIGURED = { configured: false, message: "مسابقة توقّعات خليجي 27 غير مفعّلة حاليًا" };

function guard(res: any): boolean {
  if (!isGcPredictionsEnabled()) {
    res.status(503).json(NOT_CONFIGURED);
    return false;
  }
  return true;
}

const noStore = (res: any) => res.set("Cache-Control", "private, no-store");

/** limit اختياري من الاستعلام — الافتراضي 100 ويُقصّ إلى [10..500]. */
const parseLeaderboardLimit = (raw: unknown): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.max(Math.trunc(n), 10), 500) : 100;
};

router.get("/api/gulf-cup/predictions/today", async (req: any, res) => {
  if (!guard(res)) return;
  try {
    const userId = req.isAuthenticated?.() && req.user ? req.user.id : undefined;
    const payload = await getUpcomingPredictableMatches(userId);
    if (userId) noStore(res);
    else res.set("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=60");
    res.json(payload);
  } catch (error) {
    console.error("[GC Predictions] today error:", error);
    res.status(502).json({ message: "تعذر جلب مباريات اليوم حاليًا" });
  }
});

router.post("/api/gulf-cup/predictions", requireAuth, async (req: any, res) => {
  if (!guard(res)) return;
  noStore(res);
  try {
    const fixtureId = Number(req.body?.fixtureId);
    const predHome = Number(req.body?.predHome);
    const predAway = Number(req.body?.predAway);
    if (!Number.isFinite(fixtureId)) return res.status(400).json({ message: "معرّف مباراة غير صالح" });

    const result = await submitPrediction(req.user.id, fixtureId, predHome, predAway);
    if (!result.ok) {
      const map = {
        NOT_FOUND: { code: 404, message: "المباراة غير متاحة للتوقّع" },
        LOCKED: { code: 409, message: "أُغلق التوقّع — انطلقت المباراة" },
        INVALID: { code: 400, message: "نتيجة غير صالحة" },
      } as const;
      const m = map[result.reason];
      return res.status(m.code).json({ message: m.message });
    }
    res.json({ prediction: result.prediction });
  } catch (error) {
    console.error("[GC Predictions] submit error:", error);
    res.status(500).json({ message: "تعذر حفظ التوقّع" });
  }
});

router.get("/api/gulf-cup/predictions/mine", requireAuth, async (req: any, res) => {
  if (!guard(res)) return;
  noStore(res);
  try {
    res.json({ predictions: await getMyPredictions(req.user.id) });
  } catch (error) {
    console.error("[GC Predictions] mine error:", error);
    res.status(502).json({ message: "تعذر جلب توقّعاتك حاليًا" });
  }
});

router.get("/api/gulf-cup/predictions/leaderboard", async (req: any, res) => {
  if (!guard(res)) return;
  try {
    const userId = req.isAuthenticated?.() && req.user ? req.user.id : undefined;
    // رد المستخدم المسجَّل يحمل صفّه الخاص (viewer) فلا يجوز مشاركته في كاش الحافة.
    if (userId) noStore(res);
    else res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
    const limit = parseLeaderboardLimit(req.query?.limit);
    const [leaders, meta] = await Promise.all([getLeaderboard(limit), getLeaderboardMeta(userId)]);
    res.json({ leaders, total: meta.total, viewer: meta.viewer });
  } catch (error) {
    console.error("[GC Predictions] leaderboard error:", error);
    res.status(502).json({ message: "تعذر جلب المتصدّرين حاليًا" });
  }
});

router.get("/api/gulf-cup/predictions/match/:fixtureId", async (req, res) => {
  if (!guard(res)) return;
  const fixtureId = Number(req.params.fixtureId);
  if (!Number.isFinite(fixtureId)) return res.status(400).json({ message: "معرّف مباراة غير صالح" });
  try {
    res.set("Cache-Control", "public, max-age=10, s-maxage=15, stale-while-revalidate=30");
    res.json(await getMatchPredictionsSummary(fixtureId));
  } catch (error) {
    console.error("[GC Predictions] match summary error:", error);
    res.status(502).json({ message: "تعذر جلب ملخص المباراة حاليًا" });
  }
});

router.get("/api/gulf-cup/predictions/long", async (req: any, res) => {
  if (!guard(res)) return;
  try {
    const userId = req.isAuthenticated?.() && req.user ? req.user.id : undefined;
    if (userId) noStore(res);
    else res.set("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300");
    res.json(await getLongPredictions(userId));
  } catch (error) {
    console.error("[GC Predictions] long error:", error);
    res.status(502).json({ message: "تعذر جلب التوقّعات طويلة المدى حاليًا" });
  }
});

router.post("/api/gulf-cup/predictions/long", requireAuth, async (req: any, res) => {
  if (!guard(res)) return;
  noStore(res);
  try {
    const kind = String(req.body?.kind) as GcLongKind;
    const teamId = req.body?.teamId != null ? Number(req.body.teamId) : undefined;
    const playerName = req.body?.playerName != null ? String(req.body.playerName) : undefined;
    const result = await submitLongPrediction(req.user.id, kind, { teamId, playerName });
    if (!result.ok) {
      const map = {
        LOCKED: { code: 409, message: "أُغلقت التوقّعات طويلة المدى — انطلقت البطولة" },
        INVALID: { code: 400, message: "اختيار غير صالح" },
      } as const;
      const m = map[result.reason];
      return res.status(m.code).json({ message: m.message });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error("[GC Predictions] long submit error:", error);
    res.status(500).json({ message: "تعذر حفظ التوقّع" });
  }
});

export default router;
