/**
 * دوري روشن السعودي — مسارات HTTP للهب والتوقّعات.
 *
 *   GET  /api/rsl/hero                        تركيبة الهيرو/بانر الرئيسية (عام)
 *   GET  /api/rsl/predictions/today           مباريات اليوم/الغد + توقّعي (اختياري الدخول)
 *   POST /api/rsl/predictions                 حفظ/تعديل توقّع (requireAuth)
 *   GET  /api/rsl/predictions/mine            سجل توقّعاتي (requireAuth)
 *   GET  /api/rsl/predictions/leaderboard     المتصدّرون (عام)
 *   GET  /api/rsl/predictions/match/:id       عدّادات + نتيجة (عام)
 *   GET/POST /api/rsl/predictions/long        البطل + الهدّاف (نظام المونديال)
 *
 * التوقّعات كلها خلف RSL_PREDICTIONS_ENABLED=true (تُفعَّل بعد زراعة جداول
 * rsl_* في قاعدة البيانات) — يعيد 503 قبل ذلك فتُخفي الواجهة الميزة بسلاسة.
 *
 * ADR-001: كل استعلامات Drizzle في خدمات rsl* — هذا المسار لا يستورد db.
 */
import { Router } from "express";
import { requireAuth } from "../rbac";
import {
  getCompetitionHistory,
  getFixtures,
  getSeasonOutlook,
  getStandings,
  isSaudiLeagueConfigured,
} from "../services/saudiLeagueService";
import {
  rslComp,
  submitPrediction,
  getMyPredictions,
  getLeaderboard,
  getLeaderboardMeta,
  getUpcomingPredictableMatches,
  getMatchPredictionsSummary,
} from "../services/rslPredictionsService";
import {
  getRslLongPredictions,
  submitRslLongPrediction,
  type RslLongKind,
} from "../services/rslLongPredictionsService";
import {
  getTournamentBlockSettings,
  isBlockHidden,
} from "../services/tournamentBlockSettings";

const router = Router();

const NOT_CONFIGURED = { configured: false, message: "تغطية دوري روشن غير مفعّلة حاليًا" };

function guard(res: any): boolean {
  if (!isSaudiLeagueConfigured()) {
    res.status(503).json(NOT_CONFIGURED);
    return false;
  }
  return true;
}

// التوقّعات كلها خلف علم مستقل — تُفعَّل بعد زراعة جداول rsl_* في قاعدة البيانات.
function predictionsEnabled(): boolean {
  return process.env.RSL_PREDICTIONS_ENABLED === "true";
}

function predictionsGuard(res: any): boolean {
  if (!guard(res)) return false;
  if (!predictionsEnabled()) {
    res.status(503).json({ enabled: false, message: "مسابقة توقّعات روشن قيد الإطلاق" });
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

// ── أندية الدوري ─────────────────────────────────────────────────────────────
// قائمة {teams} موحّدة الشكل مع بقية البطولات — تغذّي خيار «تعيين البطل يدويًا»
// في لوحة النظام. من الجدول إن نُشر، وإلا من ترتيب الموسم الأحدث.
router.get("/api/rsl/teams", async (_req, res) => {
  if (!guard(res)) return;
  try {
    const comp = rslComp();
    const byId = new Map<number, { id: number; name: string; logo: string }>();
    const fixtures = await getFixtures(comp).catch(() => []);
    for (const f of fixtures) {
      for (const t of [f.home, f.away]) {
        if (t.id > 0 && !byId.has(t.id)) byId.set(t.id, { id: t.id, name: t.name, logo: t.logo });
      }
    }
    if (byId.size === 0) {
      const standings = await getStandings(comp).catch(() => []);
      for (const r of standings) {
        if (r.team.id > 0 && !byId.has(r.team.id)) {
          byId.set(r.team.id, { id: r.team.id, name: r.team.name, logo: r.team.logo });
        }
      }
    }
    res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
    res.json({ teams: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "ar")) });
  } catch (error) {
    console.error("[RSL] teams failed:", error);
    res.status(502).json({ message: "تعذر جلب قائمة الأندية حاليًا" });
  }
});

// ── تركيبة الهيرو/البانر ─────────────────────────────────────────────────────
// طلب واحد مكاش يخدم هيرو /roshn وبانر الرئيسية: حالة الموسم (outlook) +
// مباريات اليوم/الحية + ملخّص «يوم الجولة» + إرث الموسم الماضي + مفتاح الإخفاء.
router.get("/api/rsl/hero", async (_req, res) => {
  if (!guard(res)) return;
  try {
    const comp = rslComp();
    const [outlook, fixtures, history, settings] = await Promise.all([
      getSeasonOutlook(comp),
      getFixtures(comp).catch(() => []),
      getCompetitionHistory(comp).catch(() => null),
      getTournamentBlockSettings("pro-league"),
    ]);

    const todayKey = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const live = fixtures.filter((f) => f.status.live);
    const today = fixtures.filter((f) => (f.date ?? "").slice(0, 10) === todayKey);
    const upcoming = fixtures
      .filter((f) => !f.status.live && !f.status.finished)
      .sort((a, b) => a.timestamp - b.timestamp);
    const nextMatch = live[0] ?? today.find((f) => !f.status.finished) ?? upcoming[0] ?? null;

    // «يوم الجولة» — نفس شكل كأس الملك (جولة الدوري تمتد أيامًا فالملخّص يُحسب ليوم المرساة).
    const anchorFx = nextMatch;
    const dayKey = anchorFx ? String(anchorFx.date ?? "").slice(0, 10) : null;
    const dayMatches = dayKey
      ? fixtures.filter((f) => String(f.date ?? "").slice(0, 10) === dayKey)
      : [];
    const dayUpcoming = dayMatches.filter((f) => !f.status.live && !f.status.finished);
    const matchday =
      anchorFx && dayMatches.length > 0
        ? {
            count: dayMatches.length,
            round: dayMatches.every((f) => f.round === dayMatches[0].round)
              ? dayMatches[0].round
              : null,
            date: anchorFx.date,
            nextKickoffTs:
              dayUpcoming.length > 0 ? Math.min(...dayUpcoming.map((f) => f.timestamp)) : null,
            sameKickoff:
              dayUpcoming.length > 1 &&
              dayUpcoming.every((f) => f.timestamp === dayUpcoming[0].timestamp),
            liveCount: dayMatches.filter((f) => f.status.live).length,
            finishedCount: dayMatches.filter((f) => f.status.finished).length,
          }
        : null;

    // البطل اليدوي من لوحة النظام يتقدّم على المكتشف تلقائيًا (احتياط تأخّر المزوّد)
    let outlookOut = outlook;
    if (settings.manualChampionTeamId && outlook.champion?.id !== settings.manualChampionTeamId) {
      const pool = new Map<number, { id: number; name: string; logo: string }>();
      for (const f of fixtures) {
        for (const t of [f.home, f.away]) if (t.id > 0) pool.set(t.id, { id: t.id, name: t.name, logo: t.logo });
      }
      if (!pool.has(settings.manualChampionTeamId)) {
        const standings = await getStandings(comp).catch(() => []);
        for (const r of standings) if (r.team.id > 0) pool.set(r.team.id, { id: r.team.id, name: r.team.name, logo: r.team.logo });
      }
      const manual = pool.get(settings.manualChampionTeamId);
      if (manual) outlookOut = { ...outlook, champion: manual };
    }

    res.set(
      "Cache-Control",
      live.length > 0
        ? "public, max-age=0, s-maxage=10, stale-while-revalidate=30"
        : "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
    );
    res.json({
      outlook: outlookOut,
      live,
      today,
      nextMatch,
      matchday,
      lastSeason: history,
      blockHidden: isBlockHidden(settings),
      predictionsEnabled: predictionsEnabled(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[RSL] hero failed:", error);
    res.status(502).json({ message: "تعذر جلب نظرة دوري روشن حاليًا" });
  }
});

// ── توقّعات المباريات (محرّك المونديال) ─────────────────────────────────────

router.get("/api/rsl/predictions/today", async (req: any, res) => {
  if (!predictionsGuard(res)) return;
  try {
    const userId = req.isAuthenticated?.() && req.user ? req.user.id : undefined;
    const matches = await getUpcomingPredictableMatches(userId);
    if (userId) {
      noStore(res);
    } else {
      res.set("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=60");
    }
    res.json({ matches });
  } catch (error) {
    console.error("[RSL Predictions] today error:", error);
    res.status(502).json({ message: "تعذر جلب مباريات اليوم حاليًا" });
  }
});

router.post("/api/rsl/predictions", requireAuth, async (req: any, res) => {
  if (!predictionsGuard(res)) return;
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
    console.error("[RSL Predictions] submit error:", error);
    res.status(500).json({ message: "تعذر حفظ التوقّع" });
  }
});

router.get("/api/rsl/predictions/mine", requireAuth, async (req: any, res) => {
  if (!predictionsGuard(res)) return;
  noStore(res);
  try {
    res.json({ predictions: await getMyPredictions(req.user.id) });
  } catch (error) {
    console.error("[RSL Predictions] mine error:", error);
    res.status(502).json({ message: "تعذر جلب توقّعاتك حاليًا" });
  }
});

router.get("/api/rsl/predictions/leaderboard", async (req: any, res) => {
  if (!predictionsGuard(res)) return;
  try {
    const userId = req.isAuthenticated?.() && req.user ? req.user.id : undefined;
    if (userId) noStore(res);
    else res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
    const limit = parseLeaderboardLimit(req.query?.limit);
    const [leaders, meta] = await Promise.all([
      getLeaderboard(limit, userId),
      getLeaderboardMeta(userId),
    ]);
    res.json({ leaders, total: meta.total, viewer: meta.viewer });
  } catch (error) {
    console.error("[RSL Predictions] leaderboard error:", error);
    res.status(502).json({ message: "تعذر جلب المتصدّرين حاليًا" });
  }
});

router.get("/api/rsl/predictions/match/:fixtureId", async (req, res) => {
  if (!predictionsGuard(res)) return;
  const fixtureId = Number(req.params.fixtureId);
  if (!Number.isFinite(fixtureId)) {
    return res.status(400).json({ message: "معرّف مباراة غير صالح" });
  }
  try {
    res.set("Cache-Control", "public, max-age=10, s-maxage=15, stale-while-revalidate=30");
    res.json(await getMatchPredictionsSummary(fixtureId));
  } catch (error) {
    console.error("[RSL Predictions] match summary error:", error);
    res.status(502).json({ message: "تعذر جلب ملخص المباراة حاليًا" });
  }
});

// ── توقّعات الموسم طويلة المدى (البطل + الهدّاف) ────────────────────────────

router.get("/api/rsl/predictions/long", async (req: any, res) => {
  if (!predictionsGuard(res)) return;
  try {
    const userId = req.isAuthenticated?.() && req.user ? req.user.id : undefined;
    if (userId) noStore(res);
    else res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
    res.json(await getRslLongPredictions(userId));
  } catch (error) {
    console.error("[RSL Predictions] long error:", error);
    res.status(502).json({ message: "تعذر جلب توقّعات الموسم حاليًا" });
  }
});

router.post("/api/rsl/predictions/long", requireAuth, async (req: any, res) => {
  if (!predictionsGuard(res)) return;
  noStore(res);
  try {
    const kind = String(req.body?.kind) as RslLongKind;
    const teamId = req.body?.teamId != null ? Number(req.body.teamId) : undefined;
    const playerId = req.body?.playerId != null ? Number(req.body.playerId) : undefined;
    const result = await submitRslLongPrediction(req.user.id, kind, { teamId, playerId });
    if (!result.ok) {
      const map = {
        LOCKED: { code: 409, message: "أُغلق هذا التوقّع — تجاوزنا موعده في الموسم" },
        INVALID: { code: 400, message: "اختيار غير صالح" },
      } as const;
      const m = map[result.reason];
      return res.status(m.code).json({ message: m.message });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error("[RSL Predictions] long submit error:", error);
    res.status(500).json({ message: "تعذر حفظ التوقّع" });
  }
});

export default router;
