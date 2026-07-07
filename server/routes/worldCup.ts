/**
 * قسم كأس العالم 2026 — نقاط عامة (لا تتطلب تسجيل دخول).
 * البيانات من API-Football عبر worldCupService خلف كاش SWR،
 * مع Cache-Control متدرّج حسب سخونة البيانات.
 */
import type { Express } from "express";
import {
  getTournamentBlockSettings,
  isBlockHidden,
} from "../services/tournamentBlockSettings";
import {
  getFixtures,
  getLiveFixtures,
  getMatchDetail,
  getOverview,
  getPlayerCard,
  getPlayerIdentityEn,
  getSquad,
  getStandings,
  buildGroupStandings,
  buildBracket,
  getTeamProfile,
  getWcCompetitionFacts,
  getWcMatchTv,
  getWcMatchTeamStats,
  getWcMatchPlayerStats,
  getWcMomentumTs,
  getWcPressureTs,
  getPlayerMarket,
  getTeamsRanked,
  getTopAssists,
  getTopCards,
  getTopScorers,
  getManualChampion,
  isWorldCupConfigured,
  type WcFixture,
  type WcMatchDetail,
  type WcMatchEvent,
  type WcStatistic,
} from "../services/worldCupService";
import { getWorldCupNews } from "../services/worldCupNewsGenerator";
import { resolveNames } from "../services/worldCupNameTranslator";
import {
  getMomentum,
  getCommentary,
  getPressure,
  getForecast,
  getMatchFacts,
  getXg,
  getExpectedLineups,
  getMatchReferee,
  getTeamOfTheWeek,
  getLiveScore,
  getPlayerForm,
  isSportmonksConfigured,
  WC_LEAGUE_ID as SM_WC_LEAGUE_ID,
} from "../services/sportmonksService";
import {
  getTheSportsFastScore,
  getTheSportsMatchLive,
  isTheSportsConfigured,
  resolveTsNames,
  TS_I18N_TYPE,
  TS_VAR_RESULT_AR,
  type TsEvent,
  type TsEventType,
  type TsLiveStats,
} from "../services/theSportsService";

const NOT_CONFIGURED = {
  configured: false,
  message: "تغطية كأس العالم غير مفعّلة حاليًا",
};

// تركيب النتيجة اللحظية من SportMonks على أي مباراة حيّة (أفضل جهد) — يتجاوز
// تأخّر كاش API-Football فتظهر النتيجة/الدقيقة في الوقت الحقيقي في كل النقاط
// (نظرة عامة، مباشر، جدول، مركز المباراة). لا نُحوّر كائنات الكاش: نُرجّع نسخًا.
async function overlayLiveScore(fx: WcFixture): Promise<WcFixture> {
  if (!fx?.status?.live) return fx;

  // 1) TheSports أولًا — النتيجة الفائقة (sub-minute). أفضل جهد: يرجع null في
  //    الإنتاج حتى يُدرَج عنوان Railway ويُضبط THESPORTS_* فنتراجع لـSportMonks.
  //    نُبقي الدقيقة من المصدر التالي (detail_live لا يعطي دقيقة موثوقة مباشرة).
  try {
    const ts = await getTheSportsFastScore(fx.id, fx.timestamp);
    if (ts && (ts.live || ts.finished)) {
      return {
        ...fx,
        goals: { home: ts.home, away: ts.away },
        // الركلات الترجيحية (أدوار خروج المغلوب) — نُبقيها من المصدر الحالي
        // ما لم يرصدها TheSports، فلا نمحو نتيجة ركلات موجودة بقيمة فارغة.
        penalties:
          ts.penHome != null || ts.penAway != null
            ? { home: ts.penHome, away: ts.penAway }
            : fx.penalties,
        status: {
          ...fx.status,
          live: ts.live,
          finished: ts.finished || fx.status.finished,
        },
      };
    }
  } catch {
    /* تراجع لـSportMonks */
  }

  // 2) SportMonks — النتيجة الحيّة + الدقيقة (المصدر الحالي)
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

// ─────────── تركيب أحداث/إحصاءات TheSports اللحظية على تفاصيل المباراة ───────────
// أثناء اللعب فقط: أحداث TheSports (هدف باسم الهدّاف/الصانع، بطاقة، فار، تبديل)
// وإحصاءاتها الحيّة أسرع وأغنى من API-Football. المنتهية تبقى من API-Football
// (أحداث قابلة للنقر تفتح بطاقة اللاعب + تقييمات + إحصاءات كاملة). أفضل جهد.

// نوع/تسمية الحدث بمفردات الواجهة نفسها (نطابق localizeEvent كي لا يتغيّر التصميم).
const TS_EVENT_LABEL: Record<TsEventType, { type: string; label: string } | null> = {
  goal: { type: "goal", label: "هدف" },
  penalty_goal: { type: "goal", label: "هدف من ركلة جزاء" },
  own_goal: { type: "goal", label: "هدف عكسي" },
  penalty_missed: { type: "missed-penalty", label: "ركلة جزاء ضائعة" },
  yellow: { type: "yellow-card", label: "بطاقة صفراء" },
  red: { type: "red-card", label: "بطاقة حمراء" },
  yellow_red: { type: "red-card", label: "بطاقة حمراء (إنذاران)" },
  sub: { type: "substitution", label: "تبديل" },
  var: { type: "var", label: "مراجعة الفار" },
  injury_time: null, // وقت بدل ضائع — لا يُعرَض كسطر حدث
  other: null,
};

function mapTsEventsToWc(
  events: TsEvent[],
  fx: WcFixture,
  tr: (n: string | null | undefined) => string,
  arById: (id: string | null | undefined) => string | null,
): WcMatchEvent[] {
  const out: WcMatchEvent[] = [];
  for (const e of events) {
    const meta = TS_EVENT_LABEL[e.type];
    if (!meta) continue;
    const teamId = e.team === "home" ? fx.home.id : e.team === "away" ? fx.away.id : 0;
    if (e.type === "sub") {
      out.push({
        minute: e.minute,
        extraMinute: null,
        teamId,
        type: meta.type,
        label: meta.label,
        detail: "Substitution",
        // الاسم بمعرّف اللاعب (name_aa الكامل) أولًا لتفادي تصادم الاختصارات
        // ("H. Hassan" للاعبين مختلفين)؛ يتراجع لتعريب سلسلة الاسم.
        player: arById(e.playerId) ?? tr(e.inPlayer), // الداخل
        playerId: null, // معرّف TheSports نصّي لا يطابق بطاقة اللاعب (API-Football)
        assist: e.outPlayer ? tr(e.outPlayer) : null, // «بديلًا عن»
        assistId: null,
      });
    } else {
      // حدث فار محسوم → التسمية بنتيجة المراجعة (إلغاء هدف/احتساب جزاء...).
      const label =
        e.type === "var" && e.varResult != null && TS_VAR_RESULT_AR[e.varResult]
          ? TS_VAR_RESULT_AR[e.varResult]
          : meta.label;
      out.push({
        minute: e.minute,
        extraMinute: null,
        teamId,
        type: meta.type,
        label,
        detail:
          e.type === "penalty_goal"
            ? "Penalty"
            : e.type === "own_goal"
              ? "Own Goal"
              : e.type === "yellow_red"
                ? "Second Yellow card"
                : "",
        // الاسم بمعرّف اللاعب (name_aa الكامل) أولًا — يحلّ تصادم الاختصارات.
        player: arById(e.playerId) ?? tr(e.player),
        playerId: null,
        assist: e.assist ? tr(e.assist) : null,
        assistId: null,
      });
    }
  }
  return out;
}

const TS_STAT_LABEL: Record<keyof TsLiveStats, string> = {
  possession: "الاستحواذ",
  shotsOnTarget: "تسديدات على المرمى",
  shotsOffTarget: "تسديدات خارج المرمى",
  attacks: "الهجمات",
  dangerousAttacks: "الهجمات الخطرة",
  corners: "الركنيات",
  yellow: "البطاقات الصفراء",
  red: "البطاقات الحمراء",
};
const TS_STAT_ORDER: (keyof TsLiveStats)[] = [
  "possession",
  "shotsOnTarget",
  "shotsOffTarget",
  "attacks",
  "dangerousAttacks",
  "corners",
  "yellow",
  "red",
];

function mapTsStatsToWc(stats: TsLiveStats): WcStatistic[] {
  const out: WcStatistic[] = [];
  for (const key of TS_STAT_ORDER) {
    const v = stats[key];
    if (!v) continue;
    const suffix = key === "possession" ? "%" : "";
    out.push({
      key: `ts:${key}`,
      label: TS_STAT_LABEL[key],
      home: `${v[0]}${suffix}`,
      away: `${v[1]}${suffix}`,
    });
  }
  return out;
}

// تفاصيل مباراة مُركَّبة: النتيجة (TheSports→SportMonks) + الأحداث/الإحصاءات
// اللحظية من TheSports أثناء اللعب فقط. أفضل جهد: أي فشل → تفاصيل API-Football.
async function overlayLiveDetail(detail: WcMatchDetail): Promise<WcMatchDetail> {
  const fixture = await overlayLiveScore(detail.fixture);
  if (!fixture.status.live) return { ...detail, fixture };
  try {
    const ts = await getTheSportsMatchLive(detail.fixture.id, detail.fixture.timestamp);
    if (!ts || !ts.live) return { ...detail, fixture };
    const raw: (string | null | undefined)[] = [];
    for (const e of ts.events) raw.push(e.player, e.assist, e.inPlayer, e.outPlayer);
    const tr = await resolveNames(raw);
    // اسم عربيّ كامل بمعرّف اللاعب (قاموس TheSports name_aa) — فريدٌ لكل لاعب فيمنع
    // تصادم الأسماء المختصرة؛ يتراجع mapTsEventsToWc إلى تعريب السلسلة عند غيابه.
    const arById = await resolveTsNames(TS_I18N_TYPE.player, ts.events.map((e) => e.playerId));
    const events = mapTsEventsToWc(ts.events, fixture, tr, arById);
    const statistics = ts.stats ? mapTsStatsToWc(ts.stats) : [];
    return {
      ...detail,
      fixture,
      events: events.length > 0 ? events : detail.events,
      statistics: statistics.length > 0 ? statistics : detail.statistics,
    };
  } catch {
    return { ...detail, fixture };
  }
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
      // إعدادات البلوك من لوحة التحكم — الإخفاء (بالمفتاح أو خارج نافذة
      // التوقيت) يعمل على الويب والتطبيقات المثبّتة معًا لأن الجميع يقرأ من
      // overview: نُرجع حمولة صالحة فارغة فتختفي الواجهات دون تحديث متجر.
      const settings = await getTournamentBlockSettings("world-cup");
      if (isBlockHidden(settings)) {
        // s-maxage=30: إعادة تفعيل المفتاح من اللوحة تصل الواجهات خلال ≤30ث
        res.set("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=60");
        return res.json({
          hidden: true,
          live: [],
          today: [],
          matchOfTheDay: null,
          matchOfDayPeers: [],
          predictions: {},
          saudi: { next: null, fixtures: [], group: null },
          champion: null,
          updatedAt: new Date().toISOString(),
        });
      }

      const ov = await getOverview();

      // البطل اليدوي من اللوحة يتقدّم على المكتشف تلقائيًا — إلا إذا تطابقا
      // فنُبقي التلقائي لأنه أغنى (نتيجة النهائي + الوصيف + الترجيح)
      let champion = ov.champion;
      if (settings.manualChampionTeamId) {
        if (champion?.team.id !== settings.manualChampionTeamId) {
          champion = (await getManualChampion(settings.manualChampionTeamId)) ?? champion;
        }
      }
      ov.champion = champion;
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
      const fixtures = await overlayLiveList(await getFixtures());
      // مباراة جارية → كاش لحظي (5ث على الـCDN، يُعاد التحقّق دومًا على المتصفح)
      // وإلا فكاش أطول. بدون هذا يبتلع كاش المتصفح (max-age) نداءات الـpolling
      // فتتجمّد النتائج أثناء البثّ حتى تحديث الصفحة يدويًا.
      const hasLive = fixtures.some((f) => f.status?.live);
      res.set(
        "Cache-Control",
        hasLive
          ? "public, max-age=0, s-maxage=5, stale-while-revalidate=15"
          : "public, max-age=15, s-maxage=30, stale-while-revalidate=120",
      );
      res.json({ fixtures });
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
      // نبني الجدول من المباريات نفسها (مصدر واحد متّسق): مباريات مُركّبة بأحدث
      // نتيجة من TheSports — المنتهية تُحتسب نهائيًّا فور الصافرة (لا فجوة انتظار)
      // والجارية تُطبَّق مبدئيًّا فيتحرّك الجدول مع كل هدف.
      const [baseGroups, fixtures] = await Promise.all([
        getStandings(),
        overlayLiveList(await getFixtures()),
      ]);
      const groups = buildGroupStandings(baseGroups, fixtures);
      // ترتيب لحظي مفعّل (صفّ live) → كاش قصير ليتطازج الجدول أثناء المباراة.
      const hasLive = groups.some((g) => (g.rows ?? []).some((r) => r.live));
      res.set(
        "Cache-Control",
        hasLive
          ? "public, max-age=0, s-maxage=5, stale-while-revalidate=15"
          : "public, max-age=120, s-maxage=300, stale-while-revalidate=600",
      );
      res.json({ groups });
    } catch (error) {
      console.error("[WorldCup] standings failed:", error);
      res.status(502).json({ message: "تعذر جلب ترتيب المجموعات حاليًا" });
    }
  });
  // شجرة الأدوار الإقصائية (Bracket) — تُبنى من المباريات نفسها مع تركيب أحدث
  // نتيجة لحظية فتتحرّك مع المباريات الجارية. (TheSports bracket/season سيُضاف
  // لاحقًا كمصدر بنية أساسي بعد إدراج عنوان الخروج والتحقّق من شكل الاستجابة.)
  app.get("/api/world-cup/bracket", async (_req, res) => {
    if (!guard(res)) return;
    try {
      const fixtures = await overlayLiveList(await getFixtures());
      const bracket = buildBracket(fixtures);
      const hasLive = bracket.rounds.some((r) => r.matches.some((m) => m.status?.live));
      res.set(
        "Cache-Control",
        hasLive
          ? "public, max-age=0, s-maxage=5, stale-while-revalidate=15"
          : "public, max-age=120, s-maxage=300, stale-while-revalidate=600",
      );
      res.json(bracket);
    } catch (error) {
      console.error("[WorldCup] bracket failed:", error);
      res.status(502).json({ message: "تعذر جلب شجرة الأدوار الإقصائية حاليًا" });
    }
  });

  // حقائق البطولة (حامل اللقب + الأكثر تتويجًا + الدول المضيفة) — إثراء TheSports.
  app.get("/api/world-cup/facts", async (_req, res) => {
    if (!guard(res)) return;
    try {
      res.set("Cache-Control", "public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400");
      res.json(await getWcCompetitionFacts());
    } catch (error) {
      console.error("[WorldCup] facts failed:", error);
      res.status(502).json({ message: "تعذر جلب حقائق البطولة حاليًا" });
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
      res.json({ teams: await getTeamsRanked() });
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

  // القيمة السوقية وتاريخها للاعب (TheSports) — جسر بالاسم الإنجليزي/الرقم عبر منتخبه.
  app.get("/api/world-cup/player/:id/market", async (req, res) => {
    if (!isTheSportsConfigured()) {
      return res.status(503).json({ available: false, marketValue: null, currency: "€", history: [] });
    }
    const playerId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(playerId) || playerId <= 0) {
      return res.status(400).json({ message: "معرّف لاعب غير صالح" });
    }
    try {
      const data = await getPlayerMarket(playerId);
      res.set("Cache-Control", "public, max-age=3600, s-maxage=21600, stale-while-revalidate=43200");
      res.json(data);
    } catch (error) {
      console.error(`[WorldCup] player market ${playerId} failed:`, error);
      res.status(502).json({ available: false, marketValue: null, currency: "€", history: [] });
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

  // الزخم الهجومي عبر الزمن — TheSports أولًا (لحظي أدقّ/أسرع)، وإلا SportMonks.
  app.get("/api/world-cup/momentum/:id", async (req, res) => {
    if (!isTheSportsConfigured() && !isSportmonksConfigured()) {
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
      let data = await getWcMomentumTs(fixtureId).catch(() => null);
      if ((!data || !data.available) && isSportmonksConfigured()) {
        data = await getMomentum(fixtureId, { directSmId });
      }
      if (!data) data = { available: false, live: false, possession: null, points: [] };
      res.set(
        "Cache-Control",
        data.live
          ? "public, max-age=8, s-maxage=10, stale-while-revalidate=30"
          : "public, max-age=120, s-maxage=300, stale-while-revalidate=600"
      );
      res.json(data);
    } catch (error) {
      console.error(`[WorldCup] momentum ${fixtureId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب رسم الزخم حاليًا", points: [] });
    }
  });

  // مؤشّر الضغط لحظة بلحظة — TheSports أولًا (Attack Momentum)، وإلا SportMonks.
  app.get("/api/world-cup/pressure/:id", async (req, res) => {
    if (!isTheSportsConfigured() && !isSportmonksConfigured()) {
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
      let data = await getWcPressureTs(fixtureId).catch(() => null);
      if ((!data || !data.available) && isSportmonksConfigured()) {
        data = await getPressure(fixtureId, { directSmId });
      }
      if (!data) data = { available: false, live: false, latest: null, points: [] };
      res.set(
        "Cache-Control",
        data.live
          ? "public, max-age=8, s-maxage=10, stale-while-revalidate=30"
          : "public, max-age=120, s-maxage=300, stale-while-revalidate=600"
      );
      res.json(data);
    } catch (error) {
      console.error(`[WorldCup] pressure ${fixtureId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب مؤشّر الضغط حاليًا", points: [] });
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
      // تعريب أسماء المغيبين (تأتي إنجليزية من SportMonks) — نفس نمط مسار /sports
      if (data.absentees.length > 0) {
        const tr = await resolveNames(data.absentees.map((a) => a.name)).catch(() => null);
        if (tr) data.absentees = data.absentees.map((a) => ({ ...a, name: tr(a.name) || a.name }));
      }
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

  // تشكيلة الجولة (SportMonks Team of the Week) — الأعلى تقييمًا في آخر جولة.
  app.get("/api/world-cup/totw", async (_req, res) => {
    if (!isSportmonksConfigured()) {
      return res.status(503).json({ configured: false, available: false });
    }
    try {
      // نسخة عميقة قبل التعريب كي لا نلوّث النسخة المكاشة بالخدمة
      const data = structuredClone(await getTeamOfTheWeek(SM_WC_LEAGUE_ID));
      if (data.available) {
        const tr = await resolveNames(
          data.players.flatMap((p) => [p.name, p.teamName])
        );
        for (const p of data.players) {
          p.name = tr(p.name);
          p.teamName = tr(p.teamName);
        }
      }
      res.set("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
      res.json(data);
    } catch (error) {
      console.error("[WorldCup] totw failed:", error);
      res.status(502).json({ message: "تعذر جلب تشكيلة الجولة حاليًا", available: false });
    }
  });

  // حكم المباراة + صرامته بالأرقام في البطولة (SportMonks referees).
  app.get("/api/world-cup/match/:id/referee", async (req, res) => {
    if (!isSportmonksConfigured()) {
      return res.status(503).json({ configured: false, available: false });
    }
    const fixtureId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }
    try {
      // نسخة عميقة قبل التعريب كي لا نلوّث النسخة المكاشة بالخدمة
      const data = structuredClone(await getMatchReferee(fixtureId));
      if (data.available) {
        const tr = await resolveNames([data.name, data.countryName]);
        data.name = tr(data.name);
        if (data.countryName) data.countryName = tr(data.countryName);
      }
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=3600");
      res.json(data);
    } catch (error) {
      console.error(`[WorldCup] referee ${fixtureId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب بيانات الحكم حاليًا", available: false });
    }
  });

  // التشكيلة المتوقعة قبل المباراة (SportMonks expectedLineups) — تُعرض حتى
  // صدور التشكيلة الرسمية. الأسماء تُعرَّب بنفس مسار تعريب أسماء المونديال.
  app.get("/api/world-cup/match/:id/expected-lineup", async (req, res) => {
    if (!isSportmonksConfigured()) {
      return res.status(503).json({ configured: false, available: false });
    }
    const fixtureId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }
    try {
      const raw = await getExpectedLineups(fixtureId);
      // نسخة عميقة قبل التعريب كي لا نلوّث النسخة المكاشة بالخدمة
      const data = structuredClone(raw);
      if (data.available) {
        const players = [data.home, data.away]
          .filter(Boolean)
          .flatMap((side) => [...side!.starters, ...side!.bench]);
        const tr = await resolveNames(players.map((p) => p.name));
        for (const p of players) p.name = tr(p.name);
      }
      res.set("Cache-Control", "public, max-age=60, s-maxage=180, stale-while-revalidate=600");
      res.json(data);
    } catch (error) {
      console.error(`[WorldCup] expected-lineup ${fixtureId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب التشكيلة المتوقعة حاليًا", available: false });
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

  // قنوات بثّ المباراة (TheSports عبر جسر المباراة) — «أين تُشاهد».
  app.get("/api/world-cup/match/:id/tv", async (req, res) => {
    if (!guard(res)) return;
    const fixtureId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }
    try {
      const channels = await getWcMatchTv(fixtureId);
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      res.json({ available: channels.length > 0, channels });
    } catch (error) {
      console.error(`[WorldCup] tv ${fixtureId} failed:`, error);
      res.status(502).json({ available: false, channels: [] });
    }
  });

  // إحصاء الفريقين المفصّل (TheSports عبر جسر المباراة) — احتياط للمباريات المنتهية.
  app.get("/api/world-cup/match/:id/stats", async (req, res) => {
    if (!guard(res)) return;
    const fixtureId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }
    try {
      const team = await getWcMatchTeamStats(fixtureId);
      res.set(
        "Cache-Control",
        "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      );
      res.json({ available: team.length > 0, team });
    } catch (error) {
      console.error(`[WorldCup] match stats ${fixtureId} failed:`, error);
      res.status(502).json({ available: false, team: [] });
    }
  });

  // تقييمات/إحصاء اللاعبين لكل مباراة (TheSports عبر جسر المباراة) — للمباريات
  // الجارية/المنتهية. كاش قصير أثناء المباراة (التقييمات تتغيّر) وأطول بعدها.
  app.get("/api/world-cup/match/:id/player-stats", async (req, res) => {
    if (!guard(res)) return;
    const fixtureId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }
    try {
      const data = await getWcMatchPlayerStats(fixtureId);
      res.set(
        "Cache-Control",
        "public, max-age=60, s-maxage=180, stale-while-revalidate=600",
      );
      res.json(data);
    } catch (error) {
      console.error(`[WorldCup] match player-stats ${fixtureId} failed:`, error);
      res.status(502).json({ available: false, home: null, away: null });
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
      // نتيجة/دقيقة لحظية + أحداث/إحصاءات TheSports اللحظية فوق تفاصيل API-Football
      const overlaid = await overlayLiveDetail(detail);
      // مباراة حيّة: s-maxage=5 للنتيجة اللحظية؛ المنتهية/القادمة تبقى قابلة للكاش لدقائق
      res.set(
        "Cache-Control",
        overlaid.fixture.status.live
          ? "public, max-age=0, s-maxage=5, stale-while-revalidate=15"
          : "public, max-age=60, s-maxage=120, stale-while-revalidate=300"
      );
      res.json(overlaid);
    } catch (error) {
      console.error(`[WorldCup] match ${fixtureId} failed:`, error);
      res.status(502).json({ message: "تعذر جلب تفاصيل المباراة حاليًا" });
    }
  });
}
