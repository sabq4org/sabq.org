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
  getPlayerCard,
  getPlayerIdentityEn,
  getSquad,
  getStandings,
  getTeamProfile,
  getTeams,
  getTopAssists,
  getTopCards,
  getTopScorers,
  isWorldCupConfigured,
  type WcFixture,
} from "../services/worldCupService";
import { getWorldCupNews } from "../services/worldCupNewsGenerator";
import {
  getMomentum,
  getCommentary,
  getPressure,
  getForecast,
  getMatchFacts,
  getXg,
  getLiveScore,
  getPlayerForm,
  isSportmonksConfigured,
} from "../services/sportmonksService";

const NOT_CONFIGURED = {
  configured: false,
  message: "تغطية كأس العالم غير مفعّلة حاليًا",
};

// تركيب النتيجة اللحظية من SportMonks على أي مباراة حيّة (أفضل جهد) — يتجاوز
// تأخّر كاش API-Football فتظهر النتيجة/الدقيقة في الوقت الحقيقي في كل النقاط
// (نظرة عامة، مباشر، جدول، مركز المباراة). لا نُحوّر كائنات الكاش: نُرجّع نسخًا.
async function overlayLiveScore(fx: WcFixture): Promise<WcFixture> {
  if (!fx?.status?.live) return fx;
  try {
    const live = await getLiveScore(fx.id);
    if (!live || (!live.live && !live.finished)) return fx;
    return {
      ...fx,
      goals: { home: live.home, away: live.away },
      status: {
        ...fx.status,
        elapsed: live.minute > 0 ? live.minute : fx.status.elapsed,
        live: live.live,
        finished: live.finished || fx.status.finished,
      },
    };
  } catch {
    return fx;
  }
}

async function overlayLiveList(list: WcFixture[]): Promise<WcFixture[]> {
  return Promise.all((list ?? []).map(overlayLiveScore));
}

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
      const ov = await getOverview();
      // تركيب النتيجة اللحظية على كل المباريات الحيّة في النظرة العامة
      const [live, today, saudiFixtures] = await Promise.all([
        overlayLiveList(ov.live),
        overlayLiveList(ov.today),
        overlayLiveList(ov.saudi.fixtures),
      ]);
      const overlaid = {
        ...ov,
        live,
        today,
        matchOfTheDay: ov.matchOfTheDay
          ? { ...ov.matchOfTheDay, fixture: await overlayLiveScore(ov.matchOfTheDay.fixture) }
          : ov.matchOfTheDay,
        saudi: {
          ...ov.saudi,
          next: ov.saudi.next ? await overlayLiveScore(ov.saudi.next) : ov.saudi.next,
          fixtures: saudiFixtures,
        },
      };
      // s-maxage=5: النتيجة الحيّة لحظية، فلا نُبقيها على الـCDN أكثر من ٥ ثوانٍ
      res.set("Cache-Control", "public, max-age=0, s-maxage=5, stale-while-revalidate=15");
      res.json(overlaid);
    } catch (error) {
      console.error("[WorldCup] overview failed:", error);
      res.status(502).json({ message: "تعذر جلب نظرة المونديال حاليًا" });
    }
  });

  // الأخبار المولّدة آليًا من بيانات المباريات (معاينات + تقارير) — تُنشر
  // في قسم الرياضة وتُعرض هنا لبلوك الواجهة وصفحة القسم
  app.get("/api/world-cup/news", async (req, res) => {
    if (!guard(res)) return;
    try {
      const limit = Number(req.query.limit) || 6;
      res.set("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300");
      res.json({ news: await getWorldCupNews(limit) });
    } catch (error) {
      console.error("[WorldCup] news failed:", error);
      res.status(502).json({ message: "تعذر جلب أخبار المونديال حاليًا" });
    }
  });

  app.get("/api/world-cup/fixtures", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=120");
      res.json({ fixtures: await overlayLiveList(await getFixtures()) });
    } catch (error) {
      console.error("[WorldCup] fixtures failed:", error);
      res.status(502).json({ message: "تعذر جلب جدول المباريات حاليًا" });
    }
  });

  app.get("/api/world-cup/live", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=0, s-maxage=5, stale-while-revalidate=15");
      res.json({ fixtures: await overlayLiveList(await getLiveFixtures()) });
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

  app.get("/api/world-cup/teams", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      res.json({ teams: await getTeams() });
    } catch (error) {
      console.error("[WorldCup] teams failed:", error);
      res.status(502).json({ message: "تعذر جلب قائمة المنتخبات حاليًا" });
    }
  });

  app.get("/api/world-cup/squad/:teamId", async (req, res) => {
    if (!guard(res)) return;
    const teamId = parseInt(String(req.params.teamId), 10);
    if (!Number.isFinite(teamId) || teamId <= 0) {
      return res.status(400).json({ message: "معرّف منتخب غير صالح" });
    }
    try {
      const squad = await getSquad(teamId);
      if (!squad) return res.status(404).json({ message: "قائمة المنتخب غير متاحة" });
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      res.json(squad);
    } catch (error) {
      console.error(`[WorldCup] squad ${teamId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب قائمة المنتخب حاليًا" });
    }
  });

  // صفحة المنتخب المتكاملة: الهوية + المجموعة والترتيب + كل المباريات + القائمة + المدرّب
  app.get("/api/world-cup/team/:teamId", async (req, res) => {
    if (!guard(res)) return;
    const teamId = parseInt(String(req.params.teamId), 10);
    if (!Number.isFinite(teamId) || teamId <= 0) {
      return res.status(400).json({ message: "معرّف منتخب غير صالح" });
    }
    try {
      const profile = await getTeamProfile(teamId);
      if (!profile) return res.status(404).json({ message: "المنتخب غير موجود" });
      res.set("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300");
      res.json(profile);
    } catch (error) {
      console.error(`[WorldCup] team ${teamId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب صفحة المنتخب حاليًا" });
    }
  });

  // بطاقة اللاعب الشاملة: ملف شخصي + مسيرة + ألقاب + أرقام البطولة + إصابة
  app.get("/api/world-cup/player/:id", async (req, res) => {
    if (!guard(res)) return;
    const playerId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(playerId) || playerId <= 0) {
      return res.status(400).json({ message: "معرّف لاعب غير صالح" });
    }
    try {
      const player = await getPlayerCard(playerId);
      if (!player) return res.status(404).json({ message: "ملف اللاعب غير متاح" });
      res.set("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
      res.json(player);
    } catch (error) {
      console.error(`[WorldCup] player ${playerId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب ملف اللاعب حاليًا" });
    }
  });

  // فورمة اللاعب + xG (آخر ٥ مباريات) — SportMonks، جسر بالاسم الإنجليزي + الميلاد.
  app.get("/api/world-cup/player/:id/form", async (req, res) => {
    if (!isSportmonksConfigured()) {
      return res.status(503).json({ configured: false, available: false, matches: [] });
    }
    const playerId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(playerId) || playerId <= 0) {
      return res.status(400).json({ message: "معرّف لاعب غير صالح" });
    }
    try {
      const identity = await getPlayerIdentityEn(playerId);
      if (!identity) return res.json({ available: false, matches: [] });
      const data = await getPlayerForm(identity);
      res.set("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
      res.json(data);
    } catch (error) {
      console.error(`[WorldCup] player form ${playerId} failed:`, error);
      res.status(502).json({ available: false, matches: [] });
    }
  });

  app.get("/api/world-cup/assists", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json({ leaders: await getTopAssists() });
    } catch (error) {
      console.error("[WorldCup] assists failed:", error);
      res.status(502).json({ message: "تعذر جلب قائمة صناع الأهداف حاليًا" });
    }
  });

  app.get("/api/world-cup/cards", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json({ leaders: await getTopCards() });
    } catch (error) {
      console.error("[WorldCup] cards failed:", error);
      res.status(502).json({ message: "تعذر جلب قائمة البطاقات حاليًا" });
    }
  });

  // الزخم الهجومي عبر الزمن (من trends — إضافة Match Facts بـSportMonks).
  app.get("/api/world-cup/momentum/:id", async (req, res) => {
    if (!isSportmonksConfigured()) {
      return res
        .status(503)
        .json({ configured: false, message: "رسم الزخم غير مفعّل حاليًا", points: [] });
    }
    const fixtureId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }
    const directSmId = Number(req.query.smId) || undefined;
    try {
      const data = await getMomentum(fixtureId, { directSmId });
      res.set(
        "Cache-Control",
        data.live
          ? "public, max-age=15, s-maxage=20, stale-while-revalidate=40"
          : "public, max-age=120, s-maxage=300, stale-while-revalidate=600"
      );
      res.json(data);
    } catch (error) {
      console.error(`[WorldCup] momentum ${fixtureId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب رسم الزخم حاليًا", points: [] });
    }
  });

  // مؤشّر الضغط لحظة بلحظة (Pressure Index — إضافة SportMonks).
  app.get("/api/world-cup/pressure/:id", async (req, res) => {
    if (!isSportmonksConfigured()) {
      return res
        .status(503)
        .json({ configured: false, message: "مؤشّر الضغط غير مفعّل حاليًا", points: [] });
    }
    const fixtureId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }
    const directSmId = Number(req.query.smId) || undefined;
    try {
      const data = await getPressure(fixtureId, { directSmId });
      res.set(
        "Cache-Control",
        data.live
          ? "public, max-age=15, s-maxage=20, stale-while-revalidate=40"
          : "public, max-age=120, s-maxage=300, stale-while-revalidate=600"
      );
      res.json(data);
    } catch (error) {
      console.error(`[WorldCup] pressure ${fixtureId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب مؤشّر الضغط حاليًا", points: [] });
    }
  });

  // نبض المباراة: حزمة خفيفة للودجت الحيّ (نتيجة + دقيقة + زخم + آخر VAR) بنداء واحد.
  app.get("/api/world-cup/pulse/:id", async (req, res) => {
    if (!guard(res)) return;
    const fixtureId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }
    try {
      const detail = await getMatchDetail(fixtureId);
      if (!detail) return res.status(404).json({ message: "المباراة غير موجودة" });
      const fixture = await overlayLiveScore(detail.fixture); // نتيجة/دقيقة لحظية

      // الزخم من مؤشّر الضغط (أفضل جهد — صفر إن لم يتوفّر)
      const momentum = { home: 0, away: 0, leader: null as null | "home" | "away", value: 0 };
      if (isSportmonksConfigured()) {
        const pr = await getPressure(fixtureId).catch(() => null);
        const last = pr?.points?.[pr.points.length - 1];
        if (last) {
          momentum.home = Math.round(last.home);
          momentum.away = Math.round(Math.abs(last.away));
        }
        if (pr?.latest && pr.latest.side !== "even") {
          momentum.leader = pr.latest.side as "home" | "away";
          momentum.value = Math.round(pr.latest.value);
        }
      }

      const varEv = [...detail.events].reverse().find((e) => e.type === "var");
      const lastVar = varEv
        ? { minute: varEv.minute, team: varEv.teamId === fixture.home.id ? "home" : "away" }
        : null;

      res.set(
        "Cache-Control",
        fixture.status.live
          ? "public, max-age=0, s-maxage=5, stale-while-revalidate=15"
          : "public, max-age=30, s-maxage=120, stale-while-revalidate=300"
      );
      res.json({
        id: fixtureId,
        home: { name: fixture.home.name, logo: fixture.home.logo },
        away: { name: fixture.away.name, logo: fixture.away.logo },
        score: { home: fixture.goals.home ?? 0, away: fixture.goals.away ?? 0 },
        status: {
          live: fixture.status.live,
          finished: fixture.status.finished,
          elapsed: fixture.status.elapsed,
          extra: fixture.status.extra,
          label: fixture.status.label,
        },
        kickoff: fixture.date,
        timestamp: fixture.timestamp,
        round: fixture.round,
        momentum,
        lastVar,
      });
    } catch (error) {
      console.error(`[WorldCup] pulse ${fixtureId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب نبض المباراة حاليًا" });
    }
  });

  // التوقعات الاحتمالية للمباراة (Predictions — احتمالات SportMonks).
  // نتيجة المباراة + الفريقان يسجلان + أوفر/أندر + الفرصة المزدوجة + أرجح النتائج.
  app.get("/api/world-cup/forecast/:id", async (req, res) => {
    if (!isSportmonksConfigured()) {
      return res
        .status(503)
        .json({ configured: false, message: "التوقعات غير مفعّلة حاليًا", available: false });
    }
    const fixtureId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }
    const directSmId = Number(req.query.smId) || undefined;
    try {
      const data = await getForecast(fixtureId, { directSmId });
      // التوقعات مستقرّة — كاش أطول، تُحدَّث مع اقتراب المباراة
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json(data);
    } catch (error) {
      console.error(`[WorldCup] forecast ${fixtureId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب التوقعات حاليًا", available: false });
    }
  });

  // معطيات المباراة من SportMonks: إحصائيات أعمق + طقس + غيابات.
  app.get("/api/world-cup/match-facts/:id", async (req, res) => {
    if (!isSportmonksConfigured()) {
      return res.status(503).json({
        configured: false,
        message: "معطيات المباراة غير مفعّلة حاليًا",
        available: false,
        statistics: [],
        weather: null,
        absentees: [],
      });
    }
    const fixtureId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }
    const directSmId = Number(req.query.smId) || undefined;
    try {
      const data = await getMatchFacts(fixtureId, { directSmId });
      // الإحصائيات تسخن أثناء اللعب؛ الطقس/الغيابات أبطأ — كاش متوسط يكفي
      res.set("Cache-Control", "public, max-age=30, s-maxage=120, stale-while-revalidate=300");
      res.json(data);
    } catch (error) {
      console.error(`[WorldCup] match-facts ${fixtureId} failed:`, error);
      res.status(502).json({
        message: "تعذر جلب معطيات المباراة حاليًا",
        available: false,
        statistics: [],
        weather: null,
        absentees: [],
      });
    }
  });

  // الأهداف المتوقعة (xG) للفريقين + أبرز صانعي الخطورة (من lineups.details).
  app.get("/api/world-cup/xg/:id", async (req, res) => {
    if (!isSportmonksConfigured()) {
      return res
        .status(503)
        .json({ configured: false, message: "xG غير مفعّل حاليًا", available: false });
    }
    const fixtureId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }
    const directSmId = Number(req.query.smId) || undefined;
    try {
      const data = await getXg(fixtureId, { directSmId });
      res.set("Cache-Control", "public, max-age=30, s-maxage=120, stale-while-revalidate=300");
      res.json(data);
    } catch (error) {
      console.error(`[WorldCup] xg ${fixtureId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب xG حاليًا", available: false });
    }
  });

  // التعليق المباشر المترجم للعربية (من commentaries — إضافة Match Facts بـSportMonks).
  // يُرجّع اللحظات المهمة فقط (أهداف + أحداث بارزة)، مُعرّبة.
  app.get("/api/world-cup/commentary/:id", async (req, res) => {
    if (!isSportmonksConfigured()) {
      return res
        .status(503)
        .json({ configured: false, message: "التعليق المباشر غير مفعّل حاليًا", items: [] });
    }
    const fixtureId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }
    const directSmId = Number(req.query.smId) || undefined;
    try {
      const data = await getCommentary(fixtureId, { directSmId });
      res.set(
        "Cache-Control",
        data.live
          ? "public, max-age=15, s-maxage=20, stale-while-revalidate=40"
          : "public, max-age=120, s-maxage=300, stale-while-revalidate=600"
      );
      res.json(data);
    } catch (error) {
      console.error(`[WorldCup] commentary ${fixtureId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب التعليق المباشر حاليًا", items: [] });
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
      // نتيجة/دقيقة لحظية من SportMonks فوق تفاصيل API-Football
      const fixture = await overlayLiveScore(detail.fixture);
      // مباراة حيّة: s-maxage=5 للنتيجة اللحظية؛ المنتهية/القادمة تبقى قابلة للكاش لدقائق
      res.set(
        "Cache-Control",
        fixture.status.live
          ? "public, max-age=0, s-maxage=5, stale-while-revalidate=15"
          : "public, max-age=60, s-maxage=120, stale-while-revalidate=300"
      );
      res.json({ ...detail, fixture });
    } catch (error) {
      console.error(`[WorldCup] match ${fixtureId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب تفاصيل المباراة حاليًا" });
    }
  });
}
