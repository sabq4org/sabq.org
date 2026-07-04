/**
 * قسم «كأس خادم الحرمين الشريفين» — نقاط عامة (لا تتطلب تسجيل دخول).
 * البيانات من API-Football (league 504) عبر kingsCupService خلف كاش SWR،
 * مع Cache-Control متدرّج حسب سخونة البيانات. التوقّعات تُخدَم من نظام
 * sports_pool الموحّد (/api/sports/*)، فلا نقاط توقّع خاصة هنا.
 */
import type { Express } from "express";
import {
  getKcOverview,
  getKcFixtures,
  getKcLiveFixtures,
  getKcBracket,
  getKcTeams,
  getKcScorers,
  getKcAssists,
  getKcYellowCards,
  getKcRedCards,
  getKcSquad,
  getKcTeamProfile,
  getKcPlayerCard,
  getKcPlayerExtras,
  getKcPlayerForm,
  getKcPlayerMarket,
  getKcMatchDetail,
  getKcMatchTv,
  getKcMatchRatings,
  getKcFixturePrediction,
  getKcHistory,
  getKcChampionsRecord,
  detectKcChampion,
  manualKcChampion,
  isKingsCupConfigured,
} from "../services/kingsCupService";
import {
  getTournamentBlockSettings,
  isBlockHidden,
} from "../services/tournamentBlockSettings";

const NOT_CONFIGURED = {
  configured: false,
  message: "تغطية كأس خادم الحرمين الشريفين غير مفعّلة حاليًا",
};

export function registerKingsCupRoutes(app: Express) {
  const guard = (res: any): boolean => {
    if (!isKingsCupConfigured()) {
      res.status(503).json(NOT_CONFIGURED);
      return false;
    }
    return true;
  };

  // نظرة عامة — تُستهلك من بانر الرئيسية ورأس صفحة القسم. blockHidden يخفي
  // بلوك الواجهة فقط (لا نفرّغ الحمولة كي تعمل صفحة /kings-cup نفسها).
  app.get("/api/kings-cup/overview", async (_req, res) => {
    if (!guard(res)) return;
    try {
      const [ov, fixtures, settings] = await Promise.all([
        getKcOverview(),
        getKcFixtures().catch(() => []),
        getTournamentBlockSettings("kings-cup"),
      ]);
      // البطل اليدوي من اللوحة يتقدّم على المكتشف تلقائيًّا
      let champion = ov.champion;
      if (settings.manualChampionTeamId && champion?.team.id !== settings.manualChampionTeamId) {
        champion = manualKcChampion(fixtures, settings.manualChampionTeamId) ?? champion;
      }
      const hasLive = (ov.live?.length ?? 0) > 0;
      // «يوم الجولة»: أدوار الكأس المبكرة تُلعب دفعة واحدة (حتى 16 مباراة في يوم)،
      // فتحتاج الواجهات ملخّصًا (عدد/دور/عدّاد مشترك) بدل إبراز مباراة اعتباطية.
      // يُحسب هنا لأن الجدول مجلوب أصلًا — بلا طلب إضافي من بانر الرئيسية.
      const anchorFx = ov.matchOfTheDay?.fixture ?? ov.nextMatch ?? null;
      const dayKey = anchorFx ? String(anchorFx.date ?? "").slice(0, 10) : null;
      const dayMatches = dayKey
        ? fixtures.filter((f) => String(f.date ?? "").slice(0, 10) === dayKey)
        : [];
      const dayUpcoming = dayMatches.filter((f) => !f.status?.live && !f.status?.finished);
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
              liveCount: dayMatches.filter((f) => f.status?.live).length,
              finishedCount: dayMatches.filter((f) => f.status?.finished).length,
            }
          : null;
      res.set(
        "Cache-Control",
        hasLive
          ? "public, max-age=0, s-maxage=10, stale-while-revalidate=30"
          : "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
      );
      res.json({ ...ov, blockHidden: isBlockHidden(settings), champion, matchday });
    } catch (error) {
      console.error("[KingsCup] overview failed:", error);
      res.status(502).json({ message: "تعذر جلب نظرة كأس الملك حاليًا" });
    }
  });

  app.get("/api/kings-cup/fixtures", async (_req, res) => {
    if (!guard(res)) return;
    try {
      const fixtures = await getKcFixtures();
      const hasLive = fixtures.some((f) => f.status?.live);
      res.set(
        "Cache-Control",
        hasLive
          ? "public, max-age=0, s-maxage=10, stale-while-revalidate=30"
          : "public, max-age=30, s-maxage=120, stale-while-revalidate=300",
      );
      res.json({ fixtures });
    } catch (error) {
      console.error("[KingsCup] fixtures failed:", error);
      res.status(502).json({ message: "تعذر جلب جدول المباريات حاليًا" });
    }
  });

  app.get("/api/kings-cup/live", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=0, s-maxage=10, stale-while-revalidate=30");
      res.json({ fixtures: await getKcLiveFixtures() });
    } catch (error) {
      console.error("[KingsCup] live failed:", error);
      res.status(502).json({ message: "تعذر جلب المباريات المباشرة حاليًا" });
    }
  });

  app.get("/api/kings-cup/bracket", async (_req, res) => {
    if (!guard(res)) return;
    try {
      const bracket = await getKcBracket();
      const hasLive = bracket.rounds.some((r) => r.matches.some((m) => m.status?.live));
      res.set(
        "Cache-Control",
        hasLive
          ? "public, max-age=0, s-maxage=10, stale-while-revalidate=30"
          : "public, max-age=120, s-maxage=300, stale-while-revalidate=600",
      );
      res.json(bracket);
    } catch (error) {
      console.error("[KingsCup] bracket failed:", error);
      res.status(502).json({ message: "تعذر جلب شجرة الأدوار الإقصائية حاليًا" });
    }
  });

  app.get("/api/kings-cup/teams", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      res.json({ teams: await getKcTeams() });
    } catch (error) {
      console.error("[KingsCup] teams failed:", error);
      res.status(502).json({ message: "تعذر جلب قائمة الأندية حاليًا" });
    }
  });

  app.get("/api/kings-cup/scorers", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json({ scorers: await getKcScorers() });
    } catch (error) {
      console.error("[KingsCup] scorers failed:", error);
      res.status(502).json({ message: "تعذر جلب قائمة الهدّافين حاليًا" });
    }
  });

  app.get("/api/kings-cup/assists", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json({ leaders: await getKcAssists() });
    } catch (error) {
      console.error("[KingsCup] assists failed:", error);
      res.status(502).json({ message: "تعذر جلب قائمة صنّاع الأهداف حاليًا" });
    }
  });

  app.get("/api/kings-cup/cards", async (_req, res) => {
    if (!guard(res)) return;
    try {
      const [yellow, red] = await Promise.all([getKcYellowCards(), getKcRedCards()]);
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json({ yellow, red });
    } catch (error) {
      console.error("[KingsCup] cards failed:", error);
      res.status(502).json({ message: "تعذر جلب قائمة البطاقات حاليًا" });
    }
  });

  app.get("/api/kings-cup/history", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400");
      res.json(await getKcHistory());
    } catch (error) {
      console.error("[KingsCup] history failed:", error);
      res.status(502).json({ message: "تعذر جلب سجلّ البطولة حاليًا" });
    }
  });

  // سجل الأبطال متعدد المواسم — بيانات تاريخية شبه ثابتة فالكاش طويل
  app.get("/api/kings-cup/record", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400");
      res.json(await getKcChampionsRecord());
    } catch (error) {
      console.error("[KingsCup] record failed:", error);
      res.status(502).json({ sinceSeason: null, editions: [], titles: [] });
    }
  });

  app.get("/api/kings-cup/squad/:teamId", async (req, res) => {
    if (!guard(res)) return;
    const teamId = parseInt(String(req.params.teamId), 10);
    if (!Number.isFinite(teamId) || teamId <= 0) {
      return res.status(400).json({ message: "معرّف نادٍ غير صالح" });
    }
    try {
      const squad = await getKcSquad(teamId);
      if (!squad) return res.status(404).json({ message: "قائمة النادي غير متاحة" });
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      res.json(squad);
    } catch (error) {
      console.error(`[KingsCup] squad ${teamId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب قائمة النادي حاليًا" });
    }
  });

  app.get("/api/kings-cup/team/:teamId", async (req, res) => {
    if (!guard(res)) return;
    const teamId = parseInt(String(req.params.teamId), 10);
    if (!Number.isFinite(teamId) || teamId <= 0) {
      return res.status(400).json({ message: "معرّف نادٍ غير صالح" });
    }
    try {
      // ?with=stats يضمّن الإثراء الثقيل (إحصائيات/مدرب/هدّافون/انتقالات/كأس) —
      // الصفحة تطلب الأساس أولًا فيرتسم فورًا ثم تجلب الإثراء بلا حجب
      const withExtras = req.query.with === "stats";
      const profile = await getKcTeamProfile(teamId, { withExtras });
      if (!profile) return res.status(404).json({ message: "النادي غير موجود" });
      res.set(
        "Cache-Control",
        withExtras
          ? "public, max-age=120, s-maxage=300, stale-while-revalidate=900"
          : "public, max-age=60, s-maxage=120, stale-while-revalidate=300",
      );
      res.json(profile);
    } catch (error) {
      console.error(`[KingsCup] team ${teamId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب صفحة النادي حاليًا" });
    }
  });

  app.get("/api/kings-cup/player/:id", async (req, res) => {
    if (!guard(res)) return;
    const playerId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(playerId) || playerId <= 0) {
      return res.status(400).json({ message: "معرّف لاعب غير صالح" });
    }
    try {
      const player = await getKcPlayerCard(playerId);
      if (!player) return res.status(404).json({ message: "ملف اللاعب غير متاح" });
      res.set("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
      // صفحة اللاعب الكاملة: ?with=extras يضمّن سلسلة المواسم + الانتقالات +
      // الإصابات في نفس الاستجابة (نفس عقد نظيرتها في البوابة /api/sports/player)
      if (req.query.with === "extras") {
        return res.json({ ...player, ...(await getKcPlayerExtras(playerId)) });
      }
      res.json(player);
    } catch (error) {
      console.error(`[KingsCup] player ${playerId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب ملف اللاعب حاليًا" });
    }
  });

  app.get("/api/kings-cup/player/:id/form", async (req, res) => {
    if (!guard(res)) return;
    const playerId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(playerId) || playerId <= 0) {
      return res.status(400).json({ message: "معرّف لاعب غير صالح" });
    }
    try {
      res.set("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
      res.json(await getKcPlayerForm(playerId));
    } catch (error) {
      console.error(`[KingsCup] player form ${playerId} failed:`, error);
      res.status(502).json({ available: false, matches: [] });
    }
  });

  app.get("/api/kings-cup/player/:id/market", async (req, res) => {
    if (!guard(res)) return;
    const playerId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(playerId) || playerId <= 0) {
      return res.status(400).json({ message: "معرّف لاعب غير صالح" });
    }
    try {
      res.set("Cache-Control", "public, max-age=3600, s-maxage=21600, stale-while-revalidate=43200");
      res.json(await getKcPlayerMarket(playerId));
    } catch (error) {
      console.error(`[KingsCup] player market ${playerId} failed:`, error);
      res.status(502).json({ available: false, marketValue: null, currency: "€", history: [] });
    }
  });

  app.get("/api/kings-cup/match/:id/tv", async (req, res) => {
    if (!guard(res)) return;
    const fixtureId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }
    try {
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      res.json(await getKcMatchTv(fixtureId));
    } catch (error) {
      console.error(`[KingsCup] tv ${fixtureId} failed:`, error);
      res.status(502).json({ available: false, channels: [] });
    }
  });

  app.get("/api/kings-cup/match/:id/player-stats", async (req, res) => {
    if (!guard(res)) return;
    const fixtureId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }
    try {
      res.set("Cache-Control", "public, max-age=60, s-maxage=180, stale-while-revalidate=600");
      res.json(await getKcMatchRatings(fixtureId));
    } catch (error) {
      console.error(`[KingsCup] match ratings ${fixtureId} failed:`, error);
      res.status(502).json({ available: false, home: null, away: null });
    }
  });

  // احتمالات الفوز (API-Football predictions) — المصدر الوحيد لكأس الملك
  // (SportMonks لا يوفّر predictions للبطولة). الحارس ضدّ العنصر الوهمي
  // 33/33/33 داخل getFixturePrediction؛ null = لا شريط احتمالات.
  app.get("/api/kings-cup/match/:id/prediction", async (req, res) => {
    if (!guard(res)) return;
    const fixtureId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }
    try {
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json({ prediction: await getKcFixturePrediction(fixtureId) });
    } catch (error) {
      console.error(`[KingsCup] prediction ${fixtureId} failed:`, error);
      res.status(502).json({ prediction: null });
    }
  });

  app.get("/api/kings-cup/match/:id", async (req, res) => {
    if (!guard(res)) return;
    const fixtureId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }
    try {
      const detail = await getKcMatchDetail(fixtureId);
      if (!detail) return res.status(404).json({ message: "المباراة غير موجودة" });
      res.set(
        "Cache-Control",
        detail.fixture.status.live
          ? "public, max-age=0, s-maxage=10, stale-while-revalidate=30"
          : "public, max-age=60, s-maxage=120, stale-while-revalidate=300",
      );
      res.json(detail);
    } catch (error) {
      console.error(`[KingsCup] match ${fixtureId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب تفاصيل المباراة حاليًا" });
    }
  });
}
