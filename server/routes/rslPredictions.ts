/**
 * دوري روشن السعودي — مسارات هب /roshn (الهيرو وقائمة الأندية).
 *
 *   GET  /api/rsl/hero    تركيبة الهيرو/بانر الرئيسية (عام)
 *   GET  /api/rsl/teams   قائمة الأندية (عام)
 *
 * توقّعات روشن انتقلت إلى المنصة المركزية: /predictions?competition=rsl-2026
 * (routes/predictionsCore.ts + predictionsMobile.ts).
 *
 * ADR-001: كل استعلامات Drizzle في خدمات rsl* — هذا المسار لا يستورد db.
 */
import { Router } from "express";
import {
  getCompetition,
  getCompetitionHistory,
  getFixtures,
  getSeasonOutlook,
  getStandings,
  isSaudiLeagueConfigured,
} from "../services/saudiLeagueService";

// دوري روشن في سجل بطولات saudiLeagueService (كان يصدَّر من خدمة التوقعات المتقاعدة)
const rslComp = () => getCompetition("pro-league")!;
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
      // توقعات روشن صارت في المنصة المركزية — الحقل باقٍ لثبات العقد
      predictionsEnabled: process.env.PREDICTION_CORE_ENABLED === "true",
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[RSL] hero failed:", error);
    res.status(502).json({ message: "تعذر جلب نظرة دوري روشن حاليًا" });
  }
});

export default router;
