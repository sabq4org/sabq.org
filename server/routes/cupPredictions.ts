/**
 * الكؤوس المحلية (كأس الملك + كأس السوبر) — مسارات HTTP لتوقّعاتها على محرّك
 * المونديال المُعمّم الموحّد. مصنع واحد يُركّب راوترًا لكل بطولة على مسارها:
 *
 *   GET  /api/{cup}/predictions/today          مباريات اليوم/الغد + توقّعي (اختياري الدخول)
 *   POST /api/{cup}/predictions                حفظ/تعديل توقّع (requireAuth)
 *   GET  /api/{cup}/predictions/mine           سجل توقّعاتي (requireAuth)
 *   GET  /api/{cup}/predictions/leaderboard    المتصدّرون (عام)
 *   GET  /api/{cup}/predictions/match/:id      عدّادات + نتيجة (عام)
 *   GET/POST /api/{cup}/predictions/long       البطل + الهدّاف (النظام الموحّد sports_pool_long)
 *
 * حيث {cup} = kings-cup | super-cup. كل بطولة خلف علمها المستقل:
 *   KINGS_CUP_PREDICTIONS_ENABLED=true / SUPER_CUP_PREDICTIONS_ENABLED=true
 * (تُفعَّل بعد زراعة جداول cup_* في قاعدة البيانات) — يعيد 503 قبل ذلك فتُخفي
 * الواجهة الميزة بسلاسة.
 *
 * ADR-001: كل استعلامات Drizzle في الخدمات (cupPredictionsService +
 * sportsPoolPredictionsService) — هذا المسار لا يستورد db.
 */
import { Router, type Express } from "express";
import { requireAuth } from "../rbac";
import { isSaudiLeagueConfigured } from "../services/saudiLeagueService";
import {
  submitPrediction,
  getMyPredictions,
  getLeaderboard,
  getUpcomingPredictableMatches,
  getMatchPredictionsSummary,
} from "../services/cupPredictionsService";
import {
  getLongPredictions,
  submitLongPrediction,
  type SpLongKind,
} from "../services/sportsPoolPredictionsService";

interface CupConfig {
  /** سلَق البطولة كما في سجلّ saudiLeagueService (kings-cup | super-cup). */
  slug: string;
  /** جزء المسار (kings-cup | super-cup) — يطابق السلَق عادةً. */
  base: string;
  /** اسم متغيّر البيئة المُفعِّل للعلم. */
  flagEnv: string;
  /** الاسم المعروض في رسائل التعطيل. */
  label: string;
}

const CUPS: CupConfig[] = [
  { slug: "kings-cup", base: "kings-cup", flagEnv: "KINGS_CUP_PREDICTIONS_ENABLED", label: "كأس الملك" },
  { slug: "super-cup", base: "super-cup", flagEnv: "SUPER_CUP_PREDICTIONS_ENABLED", label: "كأس السوبر" },
];

const noStore = (res: any) => res.set("Cache-Control", "private, no-store");

function buildCupRouter(cfg: CupConfig): Router {
  const router = Router();
  const p = (suffix: string) => `/api/${cfg.base}/predictions${suffix}`;

  const enabled = (): boolean =>
    isSaudiLeagueConfigured() && process.env[cfg.flagEnv] === "true";

  function guard(res: any): boolean {
    if (!isSaudiLeagueConfigured()) {
      res.status(503).json({ configured: false, message: `تغطية ${cfg.label} غير مفعّلة حاليًا` });
      return false;
    }
    if (process.env[cfg.flagEnv] !== "true") {
      res.status(503).json({ enabled: false, message: `مسابقة توقّعات ${cfg.label} قيد الإطلاق` });
      return false;
    }
    return true;
  }

  // ── توقّعات المباريات (محرّك المونديال المُعمّم) ────────────────────────────
  router.get(p("/today"), async (req: any, res) => {
    if (!guard(res)) return;
    try {
      const userId = req.isAuthenticated?.() && req.user ? req.user.id : undefined;
      const matches = await getUpcomingPredictableMatches(cfg.slug, userId);
      if (userId) noStore(res);
      else res.set("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=60");
      res.json({ matches });
    } catch (error) {
      console.error(`[Cup Predictions:${cfg.slug}] today error:`, error);
      res.status(502).json({ message: "تعذر جلب مباريات اليوم حاليًا" });
    }
  });

  router.post(p(""), requireAuth, async (req: any, res) => {
    if (!guard(res)) return;
    noStore(res);
    try {
      const fixtureId = Number(req.body?.fixtureId);
      const predHome = Number(req.body?.predHome);
      const predAway = Number(req.body?.predAway);
      if (!Number.isFinite(fixtureId)) {
        return res.status(400).json({ message: "معرّف مباراة غير صالح" });
      }
      const result = await submitPrediction(cfg.slug, req.user.id, fixtureId, predHome, predAway);
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
      console.error(`[Cup Predictions:${cfg.slug}] submit error:`, error);
      res.status(500).json({ message: "تعذر حفظ التوقّع" });
    }
  });

  router.get(p("/mine"), requireAuth, async (req: any, res) => {
    if (!guard(res)) return;
    noStore(res);
    try {
      res.json({ predictions: await getMyPredictions(cfg.slug, req.user.id) });
    } catch (error) {
      console.error(`[Cup Predictions:${cfg.slug}] mine error:`, error);
      res.status(502).json({ message: "تعذر جلب توقّعاتك حاليًا" });
    }
  });

  router.get(p("/leaderboard"), async (req: any, res) => {
    if (!guard(res)) return;
    try {
      const userId = req.isAuthenticated?.() && req.user ? req.user.id : undefined;
      if (userId) noStore(res);
      else res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
      res.json({ leaders: await getLeaderboard(cfg.slug, 100, userId) });
    } catch (error) {
      console.error(`[Cup Predictions:${cfg.slug}] leaderboard error:`, error);
      res.status(502).json({ message: "تعذر جلب المتصدّرين حاليًا" });
    }
  });

  router.get(p("/match/:fixtureId"), async (req, res) => {
    if (!guard(res)) return;
    const fixtureId = Number(req.params.fixtureId);
    if (!Number.isFinite(fixtureId)) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }
    try {
      res.set("Cache-Control", "public, max-age=10, s-maxage=15, stale-while-revalidate=30");
      res.json(await getMatchPredictionsSummary(fixtureId));
    } catch (error) {
      console.error(`[Cup Predictions:${cfg.slug}] match summary error:`, error);
      res.status(502).json({ message: "تعذر جلب ملخص المباراة حاليًا" });
    }
  });

  // ── توقّعات طويلة المدى (البطل + الهدّاف) — النظام الموحّد ────────────────────
  router.get(p("/long"), async (req: any, res) => {
    if (!guard(res)) return;
    try {
      const userId = req.isAuthenticated?.() && req.user ? req.user.id : undefined;
      if (userId) noStore(res);
      else res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
      res.json(await getLongPredictions(cfg.slug, userId));
    } catch (error) {
      console.error(`[Cup Predictions:${cfg.slug}] long error:`, error);
      res.status(502).json({ message: "تعذر جلب توقّعات الموسم حاليًا" });
    }
  });

  router.post(p("/long"), requireAuth, async (req: any, res) => {
    if (!guard(res)) return;
    noStore(res);
    try {
      const kind = String(req.body?.kind) as SpLongKind;
      const teamId = req.body?.teamId != null ? Number(req.body.teamId) : undefined;
      const playerName = req.body?.playerName != null ? String(req.body.playerName) : undefined;
      const result = await submitLongPrediction(req.user.id, cfg.slug, kind, { teamId, playerName });
      if (!result.ok) {
        const map = {
          LOCKED: { code: 409, message: "أُغلق هذا التوقّع — تجاوزنا موعده" },
          INVALID: { code: 400, message: "اختيار غير صالح" },
        } as const;
        const m = map[result.reason];
        return res.status(m.code).json({ message: m.message });
      }
      res.json({ ok: true });
    } catch (error) {
      console.error(`[Cup Predictions:${cfg.slug}] long submit error:`, error);
      res.status(500).json({ message: "تعذر حفظ التوقّع" });
    }
  });

  return router;
}

/** يُركّب مسارات توقّعات كل الكؤوس المحلية (kings-cup + super-cup). */
export function registerCupPredictionRoutes(app: Express): void {
  for (const cfg of CUPS) {
    app.use(buildCupRouter(cfg));
  }
}

/** الكؤوس المُدارة على هذا المحرّك — يستهلكها كرون التسوية. */
export const CUP_PREDICTION_CONFIGS = CUPS;
