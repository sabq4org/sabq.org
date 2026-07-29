/**
 * البوابة الرياضية العامة — تُغذّي قسم /sports في الويب.
 *
 * تعيد استخدام saudiLeagueService بالكامل (نفس مزوّد API-Football وكاش SWR)
 * لكنها — على عكس راوتر /api/saudi-league المخفي خلف SAUDI_LEAGUE_ENABLED —
 * نقاطٌ عامة جاهزة للإنتاج. البوابة الوحيدة هي توفّر مفتاح API:
 *   - مفتاح متوفّر  → بيانات حيّة.
 *   - مفتاح غير متوفّر → 200 ببيانات فارغة و configured:false، فتُخفي الواجهة
 *     بلوكات المباريات/الترتيب/الهدّافين بسلاسة بدل أن تتعطّل.
 *
 * لا يستورد db (ملتزم بـ ADR-001) — كل الوصول للبيانات عبر الخدمة فقط.
 */
import type { Express, Request, Response } from "express";
import { applyProvisionalTable } from "../services/liveStandings";
import { bestEffortWithin } from "../utils/bestEffortDeadline";
import { warnThrottled } from "../utils/throttledWarn";
import {
  generateMatchPreview,
  generateMatchStory,
  getCompetition,
  getCompetitionHistory,
  getCompetitionRounds,
  getFixtures,
  getFixturePrediction,
  getFixturesByRound,
  getSportsFixtureIdentity,
  getGlobalLiveFixtures,
  getGlobalTodayFixtures,
  getWorldLiveFixtures,
  getWorldLiveMatchDetail,
  getWorldLiveMatchLite,
  getHeadToHead,
  getLiveFixtures,
  getMatchDetail,
  getMatchLite,
  getMatchPlayerRatings,
  getMatchPlayerStatsTs,
  getMatchTeamStats,
  getMatchTvChannels,
  getPlayerForm,
  getPlayerMarketValue,
  getTeamInjuries,
  getPlayerCard,
  getPlayerInjuries,
  getPlayerSeasonHistory,
  getPlayerTransfers,
  getLeagueTransfers,
  getSeasonOutlook,
  getSquad,
  getStandings,
  getTeamProfile,
  getTeamStats,
  getTeamCoach,
  getTeamTopScorers,
  getTeamTransfers,
  getTopAssists,
  getTopRedCards,
  getTopScorers,
  getTopYellowCards,
  getUnifiedFixtures,
  isSaudiLeagueConfigured,
  listCompetitions,
  listCompetitionsWithMeta,
  overlayLiveBoardList,
  overlayLiveFixturesForComp,
  overlayLiveMatchDetail,
  startCompetitionsMetaWarmer,
  type SaudiCompetition,
  type SplFixture,
} from "../services/saudiLeagueService";
import { clockStartEpochFor } from "../services/matchClock";
import { getTeamOgImage } from "../services/sportsOgImage";
import {
  getXg,
  getPressure,
  getMomentum,
  getCommentary,
  getMatchFacts,
  getForecast,
  getExpectedLineups,
  getMatchReferee,
  getTeamOfTheWeek,
  resolveSmIdByNames,
  getSmLeaguesByDate,
  isSportmonksConfigured,
} from "../services/sportmonksService";
import { isTheSportsConfigured } from "../services/theSportsService";
import { resolveNames } from "../services/worldCupNameTranslator";
import {
  addFollow,
  isValidFollowKind,
  listFollows,
  removeFollow,
  setFollowNotify,
} from "../services/sportsFollowsService";
import { getSportsSummary } from "../services/sportsSummaryService";
import { requireAuth, userHasPermission, type PermissionCode } from "../rbac";
import type { NextFunction } from "express";

/**
 * حماية معاينة/سرد المباراة للتحرير فقط — لكن بـ403 لا 401 عند غياب جلسة الويب.
 *
 * لماذا: تطبيق VARA يُرفق Bearer عضوية `/api/v1` على طلبات `/api/sports/*` العامة،
 * و`requireAnyPermission` الافتراضي يرد 401 لمن بلا Passport، فيفسّر العميل ذلك
 * كـ«انتهت الجلسة» ويمسح الدخول (ظهر فجأة بعد 866af4b في 2026-07-26).
 */
function requireSportsAiEditor(...codes: PermissionCode[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated?.() || !(req as any).user?.id) {
      return res.status(403).json({
        message: "غير مصرح",
        messageEn: "Forbidden",
      });
    }
    const userId = (req as any).user.id as string;
    const ok = (await Promise.all(codes.map((c) => userHasPermission(userId, c)))).some(Boolean);
    if (!ok) {
      return res.status(403).json({
        message: "لا توجد لديك صلاحيات للوصول إلى هذه الخدمة",
        messageEn: "You don't have permission to access this service",
        required: codes,
      });
    }
    next();
  };
}
import { runWithSportsLang, sportsLangFromReq } from "../services/sportsLang";

const RIYADH_TZ = "Asia/Riyadh";
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: RIYADH_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** مفتاح يوم بتوقيت الرياض (YYYY-MM-DD) لتصنيف "مباريات اليوم" بدقة محلية. */
function riyadhDayKey(ts: number): string {
  return dayKeyFmt.format(new Date(ts * 1000));
}

/**
 * موسم أرشيفي اختياري عبر ?season=YYYY — لإبقاء بيانات موسم منتهٍ (مثل 2025/2026)
 * متاحةً بعد أن يحوّل المزوّد "الموسم الحالي" تلقائيًا للموسم الجديد في أغسطس.
 * إضافيٌّ بحت: غيابه يبقي السلوك الافتراضي (الموسم الحالي). يتجاهل القيم غير
 * الصالحة. عند تمريره نخدم بيانات ثابتة (دون تركيب الطبقة اللحظية).
 */
function parseSeason(req: Request): number | undefined {
  const raw = String(req.query.season || "").trim();
  if (!/^\d{4}$/.test(raw)) return undefined;
  const n = Number(raw);
  return n >= 2000 && n <= 2100 ? n : undefined;
}

/**
 * يحقن مرساة الساعة الموحّدة (matchClock) في حالة المباراة — منها يشتق التطبيق
 * عدّادًا ذاتيًّا مطابقًا لما تدفعه Live Activity عبر APNs (نفس الوحدة والتثبيت).
 */
function withClockAnchor<T extends SplFixture>(f: T): T {
  return {
    ...f,
    status: {
      ...f.status,
      clockStartEpoch: f.status.clockStartEpoch ?? clockStartEpochFor(f.id, f.status),
    },
  };
}

/**
 * «ساخنة» = تستحق كاش الحافة القصير (5ث): جارية فعلًا، أو حان انطلاقها ولم يقلبها
 * المزوّد بعد، أو على وشك الانطلاق (≤10 دقائق). قبل هذا كانت استجابة ما قبل
 * الانطلاق تُخزَّن على الحافة بـ s-maxage طويل فيرى الجمهور «لم تبدأ» دقائق
 * بعد صافرة البداية.
 */
const KICKOFF_HOT_BEFORE_SEC = 10 * 60;
const KICKOFF_HOT_AFTER_SEC = 3 * 3600;
function isHotFixture(f: Pick<SplFixture, "timestamp" | "status">): boolean {
  if (f.status.live) return true;
  if (f.status.finished) return false;
  const now = Math.floor(Date.now() / 1000);
  return now >= f.timestamp - KICKOFF_HOT_BEFORE_SEC && now <= f.timestamp + KICKOFF_HOT_AFTER_SEC;
}

/** مباشر → قادمة → منتهية (يمنع ظهور «انتهت» فوق «مباشر» داخل نفس القائمة). */
function compareByMatchPhase(
  a: Pick<SplFixture, "timestamp" | "status">,
  b: Pick<SplFixture, "timestamp" | "status">,
): number {
  const rank = (f: Pick<SplFixture, "status">) =>
    f.status.live ? 0 : f.status.finished ? 2 : 1;
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 2) return b.timestamp - a.timestamp;
  return a.timestamp - b.timestamp;
}

/** يقسّم جدول البطولة إلى مباشر/اليوم/قادمة/نتائج جاهزة للعرض. */
function bucketFixtures(fixtures: SplFixture[]) {
  const todayKey = riyadhDayKey(Math.floor(Date.now() / 1000));

  const live = fixtures.filter((f) => f.status.live).sort(compareByMatchPhase);
  const today = fixtures
    .filter((f) => !f.status.live && riyadhDayKey(f.timestamp) === todayKey)
    .sort(compareByMatchPhase);
  // 54 ≈ 6 جولات × 9 مباريات (روشن) — السقف السابق 20 كان يقطع منتصف الجولة
  // الثالثة. الجدول الكامل يبقى عبر /rounds + /round لا عبر هذه المعاينة.
  const upcoming = fixtures
    .filter((f) => !f.status.live && !f.status.finished && riyadhDayKey(f.timestamp) !== todayKey)
    .sort(compareByMatchPhase)
    .slice(0, 54);
  const results = fixtures
    .filter((f) => f.status.finished && riyadhDayKey(f.timestamp) !== todayKey)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 54);

  return { live, today, upcoming, results };
}

export function registerSportsRoutes(app: Express) {
  // تسخين كاش معلومات البطولات على كل pod — يمنع دفع أول مستخدم بعد deploy
  // كلفة المسار البارد (~35 نداء AF) في شاشة «الأقسام». no-op بلا مفتاح API.
  startCompetitionsMetaWarmer();

  // Middleware: يضبط لغة الاستجابة (ar/en) لكل الطلب عبر AsyncLocalStorage —
  // فتقرؤها دوال التعريب المنخفضة، ويفصل withSWR كاش الإنجليزية تلقائيًا (:en).
  // نضيف Vary: Accept-Language كي تُفصل الوسائط بين اللغتين. مسجَّل قبل تعريفات
  // المسارات فيغطّي كل /api/sports (الجدول/روشن/الترتيب/الهدّافون + مركز
  // المباراة/الفريق/اللاعب).
  const withLang = (req: Request, res: Response, next: () => void) => {
    res.vary("Accept-Language");
    runWithSportsLang(sportsLangFromReq(req), () => next());
  };
  app.use("/api/sports", withLang);

  // يحوّل :comp إلى بطولة معروفة (افتراضيًا دوري روشن)، أو يرد 404.
  const resolve = (req: Request, res: Response): SaudiCompetition | null => {
    const slug = String(req.params.comp || "pro-league");
    const comp = getCompetition(slug);
    if (!comp) {
      res.status(404).json({ message: "بطولة غير معروفة" });
      return null;
    }
    return comp;
  };

  // قائمة البطولات المتاحة (لمبدّل البطولات في الواجهة).
  // الموجة 2: تُثرى بالشعار والموسم الحالي لكل بطولة (ترويسة ديناميكية).
  // كل بطولة تحمل status: ongoing | upcoming | finished | unknown.
  // فلتر اختياري ?status=ongoing[,upcoming] يقصر النتائج على الحالات المطلوبة.
  app.get("/api/sports/competitions", async (req, res) => {
    res.set("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400");
    const wanted = String(req.query.status || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const applyFilter = <T extends { status?: string }>(rows: T[]): T[] =>
      wanted.length ? rows.filter((c) => c.status && wanted.includes(c.status)) : rows;
    if (!isSaudiLeagueConfigured()) {
      // بدون مفتاح لا نعرف الحالة؛ نرجع القائمة الأساسية كاملة (status غير متاح).
      res.json({ configured: false, competitions: listCompetitions() });
      return;
    }
    try {
      const competitions = applyFilter(await listCompetitionsWithMeta());
      res.json({ configured: true, competitions });
    } catch (error) {
      console.error("[Sports] competitions meta failed:", error);
      // تدهور بسلاسة إلى القائمة الأساسية دون شعار/موسم/حالة.
      res.json({ configured: true, competitions: listCompetitions() });
    }
  });

  // موجز البطولات: لقطة موحّدة لكل بطولة (متصدّر/هدّاف/بطل/عدّاد/مباراة قادمة)
  // تغذّي رفّ «موجز البطولات» في /sports. نداء واحد مخزّن بدل عشرات النداءات.
  app.get("/api/sports/summary", async (_req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.set("Cache-Control", "public, max-age=60, s-maxage=120");
      res.json({ configured: false, competitions: [] });
      return;
    }
    try {
      const competitions = await getSportsSummary();
      const hasLive = competitions.some((c) => c.liveCount > 0);
      res.set(
        "Cache-Control",
        hasLive
          ? "public, max-age=0, s-maxage=15, stale-while-revalidate=60"
          : "public, max-age=120, s-maxage=300, stale-while-revalidate=600",
      );
      res.json({ configured: true, competitions });
    } catch (error) {
      console.error("[Sports] summary failed:", error);
      res.status(502).json({ message: "تعذر جلب موجز البطولات حاليًا" });
    }
  });

  // نظرة الموسم: جاهزية ما قبل الموسم/العطلة (بطل الموسم المنتهي + عدّ تنازلي
  // للموسم القادم + افتتاحياته فور نشر الجدول). يتحوّل تلقائيًا إلى in-season.
  app.get("/api/sports/:comp/outlook", async (req, res) => {
    const comp = resolve(req, res);
    if (!comp) return;
    if (!isSaudiLeagueConfigured()) {
      res.json({ configured: false, outlook: null });
      return;
    }
    try {
      const outlook = await getSeasonOutlook(comp);
      res.set("Cache-Control", "public, max-age=600, s-maxage=1800, stale-while-revalidate=3600");
      res.json({ configured: true, outlook });
    } catch (error) {
      console.error("[Sports] outlook failed:", error);
      res.json({ configured: true, outlook: null });
    }
  });

  // إضافة: متصدّرو البطاقات (إنذارات + طرد) في طلب واحد لتبويب الواجهة.
  app.get("/api/sports/:comp/cards", async (req, res) => {
    const comp = resolve(req, res);
    if (!comp) return;
    if (!isSaudiLeagueConfigured()) {
      res.json({ configured: false, yellow: [], red: [] });
      return;
    }
    try {
      const season = parseSeason(req);
      let timedOut = false;
      const board = await bestEffortWithin(
        Promise.all([
          getTopYellowCards(comp, season).catch(() => []),
          getTopRedCards(comp, season).catch(() => []),
        ]).then(([yellow, red]) => ({ yellow, red })),
        {
          fallback: null,
          timeoutMs: 3_000,
          onTimeout: () => {
            timedOut = true;
            warnThrottled(`deadline:cards:${comp.slug}`, `[Sports] cards deadline exceeded for ${comp.slug}`);
          },
        },
      );
      if (board == null) {
        if (timedOut) {
          res.set("Cache-Control", "private, no-store");
          res.set("Retry-After", "2");
          res.status(503).json({ message: "متصدّرو البطاقات يُحمَّلون حاليًا" });
          return;
        }
        res.status(502).json({ message: "تعذر جلب متصدّري البطاقات حاليًا" });
        return;
      }
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json({ configured: true, yellow: board.yellow, red: board.red });
    } catch (error) {
      console.error("[Sports] cards failed:", error);
      res.status(502).json({ message: "تعذر جلب متصدّري البطاقات حاليًا" });
    }
  });

  // لوحة مباشرة شاملة: كل مباريات الأندية السعودية المباشرة عبر كل البطولات.
  app.get("/api/sports/live", async (_req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.set("Cache-Control", "public, max-age=15, s-maxage=30");
      res.json({ configured: false, live: [] });
      return;
    }
    try {
      const live = (await overlayLiveBoardList(await getGlobalLiveFixtures())).map(withClockAnchor);
      // نقطة مباشرة بحتة: لا نُبقيها في كاش المتصفح (يبتلع الـpolling) أثناء وجود
      // مباريات جارية أو على وشك الانطلاق؛ خلاف ذلك كاش قصير يكفي.
      res.set(
        "Cache-Control",
        live.some(isHotFixture)
          ? "public, max-age=0, s-maxage=5, stale-while-revalidate=15"
          : "public, max-age=15, s-maxage=30, stale-while-revalidate=60",
      );
      res.json({ configured: true, live });
    } catch (error) {
      console.error("[Sports] global live failed:", error);
      res.status(502).json({ message: "تعذر جلب المباريات المباشرة حاليًا" });
    }
  });

  // البث المباشر العالمي: كل مباريات العالم المباشرة الآن (غير مفلتر على سجلّنا)
  // — لقسم «البث المباشر · العالم» المجمّع حسب الدولة ثم الدوري. الأسماء
  // المعروفة معرّبة مع fallback إنجليزي للدوريات الصغيرة.
  app.get("/api/sports/world-live", async (_req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.set("Cache-Control", "public, max-age=15, s-maxage=30");
      res.json({ configured: false, matches: [] });
      return;
    }
    try {
      const matches = (await getWorldLiveFixtures()).map(withClockAnchor);
      // أثناء وجود مباريات جارية: كاش حافة قصير جدًّا (5ث) فلا يبتلع CDN استطلاع
      // العميل (8ث) — مطابق لـ/api/sports/live. خلاف ذلك كاش أطول يكفي.
      res.set(
        "Cache-Control",
        matches.some(isHotFixture)
          ? "public, max-age=0, s-maxage=5, stale-while-revalidate=15"
          : "public, max-age=15, s-maxage=30, stale-while-revalidate=60",
      );
      res.json({ configured: true, matches });
    } catch (error) {
      console.error("[Sports] world live failed:", error);
      res.status(502).json({ message: "تعذر جلب المباريات المباشرة حاليًا" });
    }
  });

  // تجربة: مباريات يوم مجمّعة حسب الدوري عبر SportMonks leagues/date
  // ?date=YYYY-MM-DD & ?all=1 (بدون فلتر فئة). الواجهة: /sports/sm-today
  app.get("/api/sports/sm-today", async (req, res) => {
    if (!isSportmonksConfigured()) {
      res.set("Cache-Control", "public, max-age=30, s-maxage=60");
      res.json({ available: false, date: null, leagues: [], filteredOut: 0 });
      return;
    }
    const dateRaw = typeof req.query.date === "string" ? req.query.date.trim() : "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : undefined;
    const includeAll =
      req.query.all === "1" || req.query.all === "true" || req.query.all === "yes";
    try {
      const board = await getSmLeaguesByDate(date, includeAll);
      const hot = board.leagues.some((l) => l.fixtures.some((f) => f.status.live));
      res.set(
        "Cache-Control",
        hot
          ? "public, max-age=0, s-maxage=10, stale-while-revalidate=30"
          : "public, max-age=30, s-maxage=60, stale-while-revalidate=120",
      );
      res.json(board);
    } catch (error) {
      console.error("[Sports] sm-today failed:", error);
      res.status(502).json({ message: "تعذر جلب مباريات SportMonks لهذا اليوم" });
    }
  });

  // مباريات اليوم عبر كل البطولات السعودية (مقرّرة/جارية/منتهية) مع اسم البطولة
  // لكل مباراة — نظرة سريعة موحّدة أعلى الصفحة، مستقلّة عن البطولة المختارة.
  app.get("/api/sports/today", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.set("Cache-Control", "public, max-age=30, s-maxage=60");
      res.json({ configured: false, today: [] });
      return;
    }
    // ?date=YYYY-MM-DD اختياري للتنقّل بين الأيام (لوحة "مباريات اليوم").
    const dateRaw = typeof req.query.date === "string" ? req.query.date.trim() : "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : undefined;
    try {
      const today = (await overlayLiveBoardList(await getGlobalTodayFixtures(date))).map(withClockAnchor);
      res.set(
        "Cache-Control",
        today.some(isHotFixture)
          ? "public, max-age=0, s-maxage=5, stale-while-revalidate=15"
          : "public, max-age=30, s-maxage=60, stale-while-revalidate=120",
      );
      res.json({ configured: true, date: date ?? null, today });
    } catch (error) {
      console.error("[Sports] global today failed:", error);
      res.status(502).json({ message: "تعذر جلب مباريات اليوم حاليًا" });
    }
  });

  // الجدول الموحّد متعدد البطولات — عماد «مركز المباريات» في التطبيق.
  // ?comps=slugs مفصولة بفواصل (إلزامي، حد 8) + ?from/?to بصيغة YYYY-MM-DD
  // (الافتراضي: أسبوع للخلف حتى 45 يومًا للأمام — نافذة شريط التواريخ).
  app.get("/api/sports/fixtures", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.set("Cache-Control", "public, max-age=30, s-maxage=60");
      res.json({ configured: false, fixtures: [] });
      return;
    }
    const known = new Set(listCompetitions().map((c) => c.slug));
    const comps = String(req.query.comps ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => known.has(s));
    if (comps.length === 0) {
      return res.status(400).json({ message: "حدّد بطولة واحدة على الأقل عبر ?comps=" });
    }
    if (comps.length > 8) {
      return res.status(400).json({ message: "الحد الأقصى 8 بطولات في الطلب الواحد" });
    }
    const dayKey = (v: unknown): string | null =>
      typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null;
    const riyadhDay = (offsetDays: number) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(
        new Date(Date.now() + offsetDays * 86_400_000),
      );
    const from = dayKey(req.query.from) ?? riyadhDay(-7);
    const to = dayKey(req.query.to) ?? riyadhDay(45);
    if (from > to) return res.status(400).json({ message: "نطاق تواريخ غير صالح" });
    try {
      const fixtures = (await overlayLiveBoardList(await getUnifiedFixtures(comps, from, to))).map(withClockAnchor);
      res.set(
        "Cache-Control",
        fixtures.some(isHotFixture)
          ? "public, max-age=0, s-maxage=5, stale-while-revalidate=15"
          : "public, max-age=30, s-maxage=60, stale-while-revalidate=120",
      );
      res.json({ configured: true, from, to, fixtures });
    } catch (error) {
      console.error("[Sports] unified fixtures failed:", error);
      res.status(502).json({ message: "تعذر جلب الجدول الموحّد حاليًا" });
    }
  });

  // مركز المباريات لبطولة: مباشر/اليوم/قادمة/نتائج في طلب واحد.
  app.get("/api/sports/:comp/matches", async (req, res) => {
    const comp = resolve(req, res);
    if (!comp) return;
    if (!isSaudiLeagueConfigured()) {
      res.set("Cache-Control", "public, max-age=30, s-maxage=60");
      res.json({ configured: false, live: [], today: [], upcoming: [], results: [] });
      return;
    }
    try {
      // أرشيف: موسم سابق ثابت — كله نتائج، بلا طبقة لحظية، وكاش طويل.
      const season = parseSeason(req);
      if (season) {
        const buckets = bucketFixtures(await getFixtures(comp, season));
        res.set("Cache-Control", "public, max-age=600, s-maxage=86400, stale-while-revalidate=86400");
        res.json({ configured: true, live: [], today: buckets.today, upcoming: buckets.upcoming, results: buckets.results });
        return;
      }
      const [fixtures, liveNow] = await Promise.all([getFixtures(comp), getLiveFixtures(comp)]);
      const buckets = bucketFixtures(fixtures);
      // دمج المباشر من نقطة live (أدقّ) مع ما التُقط من الجدول.
      const liveIds = new Set(liveNow.map((f) => f.id));
      const mergedLive = [...liveNow, ...buckets.live.filter((f) => !liveIds.has(f.id))];
      // الطبقة اللحظية: نتيجة TheSports الفائقة على المباريات الجارية (إن أُدرجت البطولة).
      const live = (await overlayLiveFixturesForComp(mergedLive, comp.slug)).map(withClockAnchor);
      res.set(
        "Cache-Control",
        live.some(isHotFixture) || buckets.today.some(isHotFixture)
          ? "public, max-age=0, s-maxage=5, stale-while-revalidate=15"
          : "public, max-age=15, s-maxage=30, stale-while-revalidate=60",
      );
      res.json({ configured: true, live, today: buckets.today, upcoming: buckets.upcoming, results: buckets.results });
    } catch (error) {
      console.error("[Sports] matches failed:", error);
      res.status(502).json({ message: "تعذر جلب المباريات حاليًا" });
    }
  });

  // متصفّح الجولات: قائمة الجولات + الجولة الحالية (للدوريات).
  app.get("/api/sports/:comp/rounds", async (req, res) => {
    const comp = resolve(req, res);
    if (!comp) return;
    if (!isSaudiLeagueConfigured()) {
      res.json({ configured: false, rounds: [], current: null });
      return;
    }
    try {
      const { rounds, current } = await getCompetitionRounds(comp, parseSeason(req));
      res.set("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
      res.json({ configured: true, rounds, current });
    } catch (error) {
      console.error("[Sports] rounds failed:", error);
      res.status(502).json({ message: "تعذر جلب الجولات حاليًا" });
    }
  });

  // مباريات جولة محدّدة (?name=الجولة الخام). تُستخدم مع /rounds للتصفّح.
  app.get("/api/sports/:comp/round", async (req, res) => {
    const comp = resolve(req, res);
    if (!comp) return;
    const name = String(req.query.name || "").trim();
    if (!name) {
      res.status(400).json({ message: "اسم الجولة مطلوب" });
      return;
    }
    if (!isSaudiLeagueConfigured()) {
      res.json({ configured: false, fixtures: [] });
      return;
    }
    try {
      const fixtures = [...(await getFixturesByRound(comp, name, parseSeason(req)))].sort(
        compareByMatchPhase,
      );
      res.set("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300");
      res.json({ configured: true, fixtures });
    } catch (error) {
      console.error("[Sports] round fixtures failed:", error);
      res.status(502).json({ message: "تعذر جلب مباريات الجولة حاليًا" });
    }
  });

  // الترتيب (يرد [] للكؤوس ومن لا يدعمه).
  app.get("/api/sports/:comp/standings", async (req, res) => {
    const comp = resolve(req, res);
    if (!comp) return;
    if (!isSaudiLeagueConfigured()) {
      res.json({ configured: false, standings: [] });
      return;
    }
    try {
      // أرشيف: جدول موسم سابق نهائي — بلا طبقة لحظية، كاش طويل.
      const season = parseSeason(req);
      if (season) {
        res.set("Cache-Control", "public, max-age=600, s-maxage=86400, stale-while-revalidate=86400");
        res.json({ configured: true, standings: await getStandings(comp, season) });
        return;
      }
      // ترتيب مبدئي لحظي: نطبّق نتائج مباريات البطولة الجارية فوق الجدول فيتحرّك
      // مع كل هدف. كاش واعٍ للبثّ: قصير أثناء وجود مباراة جارية وإلا أطول.
      const [base, liveNow] = await Promise.all([
        getStandings(comp),
        getLiveFixtures(comp).catch(() => []),
      ]);
      const standings = applyProvisionalTable(base, liveNow);
      const hasLive = standings.some((r) => r.live);
      res.set(
        "Cache-Control",
        hasLive
          ? "public, max-age=0, s-maxage=5, stale-while-revalidate=15"
          : "public, max-age=120, s-maxage=300, stale-while-revalidate=600",
      );
      res.json({ configured: true, standings });
    } catch (error) {
      console.error("[Sports] standings failed:", error);
      res.status(502).json({ message: "تعذر جلب الترتيب حاليًا" });
    }
  });

  // الهدّافون (أعلى 15؛ يرد [] لمن لا يدعمها).
  // مهلة أفضل جهد: كاش بارد + طابور API-Football كان يعلّق الطلب ~5ث (APM).
  // عند المهلة 503 + Retry-After حتى يعيد العميل بعد امتلاء SWR — لا نكاش قائمة فارغة.
  app.get("/api/sports/:comp/scorers", async (req, res) => {
    const comp = resolve(req, res);
    if (!comp) return;
    if (!isSaudiLeagueConfigured()) {
      res.json({ configured: false, scorers: [] });
      return;
    }
    try {
      let timedOut = false;
      const scorers = await bestEffortWithin(getTopScorers(comp, parseSeason(req)), {
        fallback: null,
        timeoutMs: 3_000,
        onTimeout: () => {
          timedOut = true;
          warnThrottled(`deadline:scorers:${comp.slug}`, `[Sports] scorers deadline exceeded for ${comp.slug}`);
        },
      });
      if (scorers == null) {
        if (timedOut) {
          res.set("Cache-Control", "private, no-store");
          res.set("Retry-After", "2");
          res.status(503).json({ message: "قائمة الهدافين تُحمَّل حاليًا" });
          return;
        }
        res.status(502).json({ message: "تعذر جلب قائمة الهدافين حاليًا" });
        return;
      }
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json({ configured: true, scorers });
    } catch (error) {
      console.error("[Sports] scorers failed:", error);
      res.status(502).json({ message: "تعذر جلب قائمة الهدافين حاليًا" });
    }
  });

  // لمحة النسخة السابقة: حامل اللقب + هدّاف الموسم الماضي. بيانات تاريخية ثابتة
  // فتُخزَّن طويلًا. تتدهور بسلاسة إلى null عند تعذّر جزء منها.
  app.get("/api/sports/:comp/history", async (req, res) => {
    const comp = resolve(req, res);
    if (!comp) return;
    if (!isSaudiLeagueConfigured()) {
      res.json({ configured: false, history: { previousSeason: null, champion: null, topScorer: null } });
      return;
    }
    try {
      res.set("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400");
      res.json({ configured: true, history: await getCompetitionHistory(comp) });
    } catch (error) {
      console.error("[Sports] history failed:", error);
      res.status(502).json({ message: "تعذر جلب لمحة النسخة السابقة حاليًا" });
    }
  });

  // صنّاع الأهداف (الموجة 1) — أعلى 15 صانع هدف؛ يرد [] لمن لا يدعمها.
  app.get("/api/sports/:comp/assists", async (req, res) => {
    const comp = resolve(req, res);
    if (!comp) return;
    if (!isSaudiLeagueConfigured()) {
      res.json({ configured: false, assists: [] });
      return;
    }
    try {
      let timedOut = false;
      const assists = await bestEffortWithin(getTopAssists(comp, parseSeason(req)), {
        fallback: null,
        timeoutMs: 3_000,
        onTimeout: () => {
          timedOut = true;
          warnThrottled(`deadline:assists:${comp.slug}`, `[Sports] assists deadline exceeded for ${comp.slug}`);
        },
      });
      if (assists == null) {
        if (timedOut) {
          res.set("Cache-Control", "private, no-store");
          res.set("Retry-After", "2");
          res.status(503).json({ message: "قائمة صنّاع الأهداف تُحمَّل حاليًا" });
          return;
        }
        res.status(502).json({ message: "تعذر جلب قائمة صنّاع الأهداف حاليًا" });
        return;
      }
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json({ configured: true, assists });
    } catch (error) {
      console.error("[Sports] assists failed:", error);
      res.status(502).json({ message: "تعذر جلب قائمة صنّاع الأهداف حاليًا" });
    }
  });

  // تفاصيل مباراة — المعرّف عام عند المزود فلا يحتاج تحديد البطولة.
  app.get("/api/sports/match/:id", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.status(404).json({ message: "المباراة غير موجودة" });
      return;
    }
    const id = Number(req.params.id);
    // المعرّف السالب = مباراة «عالمية» من لوحة TheSports (لا مقابل لها في AF).
    if (!Number.isFinite(id) || id === 0) {
      res.status(400).json({ message: "معرّف مباراة غير صحيح" });
      return;
    }
    try {
      // مباريات عالمية (id سالب): تُحلّ من لوحة البث الحيّة نفسها — نتيجة/أحداث/
      // إحصاءات detail_live — بلا نداء API-Football (لا مقابل لها هناك).
      const detail =
        id < 0
          ? await getWorldLiveMatchDetail(id)
          : await (async () => {
              const base = await getMatchDetail(id);
              if (!base) return null;
              // الطبقة اللحظية: نتيجة/أحداث/إحصاءات TheSports فوق بيانات API-Football
              // للمباريات الجارية في البطولات المُدرَجة — أفضل جهد (تتراجع بصمت).
              return overlayLiveMatchDetail(base);
            })();
      if (!detail) {
        res.status(404).json({ message: "المباراة غير موجودة" });
        return;
      }
      const fixture = withClockAnchor(detail.fixture);
      // «ساخنة» تشمل نافذة الانطلاق (±) — استجابة ما قبل البدء كانت تُخزَّن على
      // الحافة 300ث فيرى الجمهور «لم تبدأ» دقائق بعد الصافرة.
      const ttl = isHotFixture(fixture) ? "max-age=10, s-maxage=15" : "max-age=120, s-maxage=300";
      res.set("Cache-Control", `public, ${ttl}, stale-while-revalidate=120`);
      res.json({ ...detail, fixture });
    } catch (error) {
      console.error("[Sports] match detail failed:", error);
      res.status(502).json({ message: "تعذر جلب تفاصيل المباراة حاليًا" });
    }
  });

  // لقطة خفيفة (fixture فقط) — لتحديث «مبارياتي» بلا events/stats/lineups.
  app.get("/api/sports/match/:id/lite", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.status(404).json({ message: "المباراة غير موجودة" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id === 0) {
      res.status(400).json({ message: "معرّف مباراة غير صحيح" });
      return;
    }
    try {
      // مباراة عالمية (id سالب) → لقطة من لوحة TheSports؛ غيرها → API-Football.
      const raw = id < 0 ? await getWorldLiveMatchLite(id) : await getMatchLite(id);
      if (!raw) {
        res.status(404).json({ message: "المباراة غير موجودة" });
        return;
      }
      const fixture = withClockAnchor(raw);
      const ttl = isHotFixture(fixture) ? "max-age=10, s-maxage=15" : "max-age=60, s-maxage=120";
      res.set("Cache-Control", `public, ${ttl}, stale-while-revalidate=60`);
      res.json({ fixture });
    } catch (error) {
      console.error("[Sports] match lite failed:", error);
      res.status(502).json({ message: "تعذر جلب المباراة حاليًا" });
    }
  });

  // تقييمات لاعبي المباراة (lazy) — نقطة منفصلة عن /match/:id تُستدعى فقط عند فتح
  // تبويب «التقييمات»، لأن fixtures/players ثقيلة (22+ لاعبًا) ولا داعي لها على كل فتح.
  app.get("/api/sports/match/:id/players", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.status(404).json({ message: "غير متاح" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ message: "معرّف مباراة غير صحيح" });
      return;
    }
    try {
      const ratings = await getMatchPlayerRatings(id);
      if (!ratings) {
        res.status(404).json({ message: "لا تتوفّر تقييمات لهذه المباراة" });
        return;
      }
      res.set("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=120");
      res.json(ratings);
    } catch (error) {
      console.error("[Sports] match player ratings failed:", error);
      res.status(502).json({ message: "تعذر جلب تقييمات اللاعبين حاليًا" });
    }
  });

  // قنوات بثّ المباراة («أين تُشاهد») — TheSports، أفضل جهد. تُخفى الواجهة إن فرغت.
  app.get("/api/sports/match/:id/tv", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.json({ available: false, channels: [] });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ message: "معرّف مباراة غير صحيح" });
      return;
    }
    try {
      const tv = await getMatchTvChannels(id);
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400");
      res.json(tv);
    } catch (error) {
      console.error("[Sports] match tv failed:", error);
      res.json({ available: false, channels: [] });
    }
  });

  // إحصاء الفريقين المفصّل (TheSports) — احتياط لتبويب الأرقام، أفضل جهد.
  app.get("/api/sports/match/:id/stats", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.json({ available: false, rows: [] });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ message: "معرّف مباراة غير صحيح" });
      return;
    }
    try {
      const stats = await getMatchTeamStats(id);
      res.set("Cache-Control", "public, max-age=120, s-maxage=600, stale-while-revalidate=3600");
      res.json(stats);
    } catch (error) {
      console.error("[Sports] match team stats failed:", error);
      res.json({ available: false, rows: [] });
    }
  });

  // تقييمات لاعبين احتياطية (TheSports) — تملأ تبويب «التقييمات» حين لا يرسل
  // API-Football بيانات لاعبين (نفس احتياط المونديال معمّمًا). أفضل جهد.
  app.get("/api/sports/match/:id/player-stats", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.json({ available: false, home: null, away: null });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ message: "معرّف مباراة غير صحيح" });
      return;
    }
    try {
      const stats = await getMatchPlayerStatsTs(id);
      res.set("Cache-Control", "public, max-age=120, s-maxage=600, stale-while-revalidate=3600");
      res.json(stats);
    } catch (error) {
      console.error("[Sports] match player stats failed:", error);
      res.json({ available: false, home: null, away: null });
    }
  });

  // ---------- إثراء SportMonks للبوابة (xG/الضغط/معطيات) — سعودي/آسيا وغيرها ----------
  // نحلّ معرّف SportMonks من هوية مباراة API-Football ثم نعيد استخدام دوال البناء
  // عبر directSmId (نفس منطق المونديال، بلا تكرار). كلها best-effort بحُرّاس توفّر.
  const resolveSportsSmId = async (id: number): Promise<number | null> => {
    const identity = await getSportsFixtureIdentity(id).catch(() => null);
    if (!identity) return null;
    return resolveSmIdByNames({
      key: `spl:${id}`,
      kickoffIso: identity.kickoffIso,
      homeNameEn: identity.homeNameEn,
      awayNameEn: identity.awayNameEn,
    });
  };

  const percent = (n: number | null | undefined) =>
    typeof n === "number" && Number.isFinite(n) ? `${Math.round(n)}%` : null;

  const topBy = <T,>(rows: T[], score: (row: T) => number): T | null =>
    rows.length ? rows.reduce((best, row) => (score(row) > score(best) ? row : best), rows[0]) : null;

  const bottomBy = <T,>(rows: T[], score: (row: T) => number): T | null =>
    rows.length ? rows.reduce((best, row) => (score(row) < score(best) ? row : best), rows[0]) : null;

  // ملخص مركّب لروشن: يختصر بيانات الاشتراكات في لقطة واحدة خفيفة للواجهة.
  app.get("/api/sports/:comp/insights", async (req, res) => {
    const comp = resolve(req, res);
    if (!comp) return;
    if (!isSaudiLeagueConfigured()) {
      res.json({
        configured: false,
        generatedAt: Date.now(),
        summary: null,
        featured: null,
        signals: [],
        providers: [
          { key: "api-football", label: "الجدول والهدافون", available: false },
          { key: "thesports", label: "اللحظية والإصابات", available: isTheSportsConfigured() },
          { key: "sportmonks", label: "التحليل والطقس", available: isSportmonksConfigured() },
        ],
      });
      return;
    }

    try {
      const season = parseSeason(req);
      const [fixtures, liveNow, baseStandings, scorers, assists] = await Promise.all([
        getFixtures(comp, season),
        season ? Promise.resolve([]) : getLiveFixtures(comp).catch(() => []),
        getStandings(comp, season).catch(() => []),
        getTopScorers(comp, season).catch(() => []),
        getTopAssists(comp, season).catch(() => []),
      ]);

      const buckets = bucketFixtures(fixtures);
      const liveIds = new Set(liveNow.map((f) => f.id));
      const mergedLive = [...liveNow, ...buckets.live.filter((f) => !liveIds.has(f.id))];
      const live = season ? [] : await overlayLiveFixturesForComp(mergedLive, comp.slug).catch(() => mergedLive);
      const standings = season ? baseStandings : applyProvisionalTable(baseStandings, liveNow);
      const featured = live[0] ?? buckets.today[0] ?? buckets.upcoming[0] ?? buckets.results[0] ?? null;

      const leader = standings[0] ?? null;
      const runnerUp = standings[1] ?? null;
      const gap = leader && runnerUp ? leader.points - runnerUp.points : null;
      const bestAttack = topBy(standings, (r) => r.goalsFor);
      const bestDefense = bottomBy(standings, (r) => r.goalsAgainst);
      const mostWins = topBy(standings, (r) => r.win);
      const topScorer = scorers[0] ?? null;
      const topAssist = assists[0] ?? null;

      let xg: Awaited<ReturnType<typeof getXg>> | null = null;
      let momentum: Awaited<ReturnType<typeof getMomentum>> | null = null;
      let pressure: Awaited<ReturnType<typeof getPressure>> | null = null;
      let facts: Awaited<ReturnType<typeof getMatchFacts>> | null = null;
      let forecast: Awaited<ReturnType<typeof getForecast>> | null = null;

      if (featured && isSportmonksConfigured()) {
        const smId = await resolveSportsSmId(featured.id).catch(() => null);
        if (smId) {
          [xg, momentum, pressure, facts, forecast] = await Promise.all([
            getXg(featured.id, { directSmId: smId }).catch(() => null),
            getMomentum(featured.id, { directSmId: smId }).catch(() => null),
            getPressure(featured.id, { directSmId: smId }).catch(() => null),
            getMatchFacts(featured.id, { directSmId: smId }).catch(() => null),
            getForecast(featured.id, { directSmId: smId }).catch(() => null),
          ]);
          if (xg?.topPlayers?.length) {
            const tr = await resolveNames(xg.topPlayers.map((p) => p.name)).catch(() => null);
            if (tr) xg = { ...xg, topPlayers: xg.topPlayers.map((p) => ({ ...p, name: tr(p.name) || p.name })) };
          }
        }
      }

      const forecastPick = (() => {
        const ft = forecast?.fulltime;
        if (!ft || !featured) return null;
        const options = [
          { label: featured.home.name, value: ft.home },
          { label: "تعادل", value: ft.draw },
          { label: featured.away.name, value: ft.away },
        ].sort((a, b) => b.value - a.value);
        return options[0]?.value > 0 ? options[0] : null;
      })();

      const signals = [
        leader && {
          key: "leader",
          label: "صدارة الدوري",
          title: leader.team.name,
          value: `${leader.points} نقطة`,
          subtitle: gap == null ? "ترتيب الموسم" : gap === 0 ? "الصدارة متساوية" : `فارق ${gap} عن الوصيف`,
          logo: leader.team.logo,
          teamId: leader.team.id,
        },
        topScorer && {
          key: "top-scorer",
          label: "الهداف",
          title: topScorer.name,
          value: `${topScorer.goals} هدف`,
          subtitle: topScorer.team.name,
          logo: topScorer.team.logo,
          playerId: topScorer.id,
          teamId: topScorer.team.id,
        },
        bestAttack && {
          key: "attack",
          label: "أقوى هجوم",
          title: bestAttack.team.name,
          value: `${bestAttack.goalsFor} هدف`,
          subtitle: `${bestAttack.win} فوز`,
          logo: bestAttack.team.logo,
          teamId: bestAttack.team.id,
        },
        bestDefense && {
          key: "defense",
          label: "أمتن دفاع",
          title: bestDefense.team.name,
          value: `${bestDefense.goalsAgainst} عليه`,
          subtitle: `${bestDefense.played} مباراة`,
          logo: bestDefense.team.logo,
          teamId: bestDefense.team.id,
        },
        topAssist && {
          key: "assist",
          label: "صانع اللعب",
          title: topAssist.name,
          value: `${topAssist.assists} صناعة`,
          subtitle: topAssist.team.name,
          logo: topAssist.team.logo,
          playerId: topAssist.id,
          teamId: topAssist.team.id,
        },
        mostWins && {
          key: "wins",
          label: "الأكثر فوزًا",
          title: mostWins.team.name,
          value: `${mostWins.win} فوز`,
          subtitle: `${mostWins.goalsDiff > 0 ? "+" : ""}${mostWins.goalsDiff} فارق`,
          logo: mostWins.team.logo,
          teamId: mostWins.team.id,
        },
      ].filter(Boolean);

      const analysis = featured
        ? {
            xg: xg?.available ? { home: xg.home, away: xg.away, topPlayers: xg.topPlayers.slice(0, 3) } : null,
            pressure: pressure?.available
              ? {
                  live: pressure.live,
                  latest: pressure.latest,
                  points: pressure.points.slice(-12),
                }
              : null,
            momentum: momentum?.available
              ? {
                  live: momentum.live,
                  possession: momentum.possession,
                  points: momentum.points.slice(-12),
                }
              : null,
            weather: facts?.available ? facts.weather : null,
            absentees: facts?.available ? facts.absentees.slice(0, 6) : [],
            forecast: forecast?.available
              ? {
                  fulltime: forecast.fulltime,
                  btts: forecast.btts,
                  goals: forecast.goals,
                  correctScores: forecast.correctScores.slice(0, 3),
                  pick: forecastPick,
                }
              : null,
          }
        : null;

      const providers = [
        {
          key: "api-football",
          label: "الجدول والهدافون",
          available: true,
          summary: `${standings.length} فريق · ${scorers.length} هداف`,
        },
        {
          key: "thesports",
          label: "اللحظية والإصابات",
          available: isTheSportsConfigured(),
          summary: live.length ? `${live.length} مباراة مباشرة` : "جاهز للتحديث اللحظي",
        },
        {
          key: "sportmonks",
          label: "التحليل والطقس",
          available: isSportmonksConfigured(),
          summary: [
            xg?.available ? "xG" : null,
            pressure?.available ? "ضغط" : null,
            momentum?.available ? "زخم" : null,
            facts?.weather ? "طقس" : null,
            forecast?.available ? "توقع" : null,
          ].filter(Boolean).join(" · ") || "يتوفر حسب المباراة",
        },
      ];

      const hasLive = live.some((f) => f.status.live) || standings.some((r) => r.live);
      res.set(
        "Cache-Control",
        hasLive
          ? "public, max-age=0, s-maxage=10, stale-while-revalidate=20"
          : "public, max-age=60, s-maxage=180, stale-while-revalidate=600",
      );
      res.json({
        configured: true,
        generatedAt: Date.now(),
        competition: { slug: comp.slug, name: comp.name },
        summary: {
          title: leader ? `${leader.team.name} في الصدارة` : comp.name,
          subtitle: [
            gap == null ? null : gap === 0 ? "فارق الصدارة متساوٍ" : `فارق الصدارة ${gap} نقطة`,
            topScorer ? `الهداف ${topScorer.name}` : null,
          ].filter(Boolean).join(" · "),
          leader,
          runnerUp,
          gap,
          bestAttack,
          bestDefense,
          mostWins,
          topScorer,
          topAssist,
        },
        featured: featured ? { fixture: featured, analysis } : null,
        signals,
        providers,
      });
    } catch (error) {
      console.error("[Sports] insights failed:", error);
      res.status(502).json({ message: "تعذر جلب رؤية الدوري حاليًا" });
    }
  });

  const SM_ENRICH_CACHE = "public, max-age=30, s-maxage=120, stale-while-revalidate=300";

  app.get("/api/sports/match/:id/xg", async (req, res) => {
    if (!isSportmonksConfigured()) {
      return res
        .status(503)
        .json({ configured: false, available: false, home: { xg: 0, xgot: 0 }, away: { xg: 0, xgot: 0 }, topPlayers: [] });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "معرّف مباراة غير صحيح" });
    try {
      const smId = await resolveSportsSmId(id);
      if (!smId) {
        return res.json({ available: false, home: { xg: 0, xgot: 0 }, away: { xg: 0, xgot: 0 }, topPlayers: [] });
      }
      const xg = await getXg(id, { directSmId: smId });
      // تعريب أسماء «الأعلى خطورة» (تأتي إنجليزية من SportMonks) أفضل جهد.
      if (xg.topPlayers.length > 0) {
        const tr = await resolveNames(xg.topPlayers.map((tp) => tp.name)).catch(() => null);
        if (tr) xg.topPlayers = xg.topPlayers.map((tp) => ({ ...tp, name: tr(tp.name) || tp.name }));
      }
      res.set("Cache-Control", SM_ENRICH_CACHE);
      res.json(xg);
    } catch (error) {
      console.error("[Sports] xg failed:", error);
      res.status(502).json({ available: false, home: { xg: 0, xgot: 0 }, away: { xg: 0, xgot: 0 }, topPlayers: [] });
    }
  });

  // تشكيلة الجولة (SportMonks TOTW) للبطولات المغطاة باشتراكنا — الأعلى تقييمًا
  // في آخر جولة مكتملة. معرّفات SportMonks متحقَّقة من /v3/football/leagues.
  const SM_TOTW_LEAGUES: Record<string, number> = {
    "pro-league": 944,
    "kings-cup": 950,
    "afc-champions-league": 1085,
    "premier-league": 8,
    "la-liga": 564,
    "bundesliga": 82,
    "ligue-1": 301,
  };
  app.get("/api/sports/:comp/totw", async (req, res) => {
    const empty = { available: false, formation: null, players: [] };
    const leagueId = SM_TOTW_LEAGUES[String(req.params.comp)];
    if (!leagueId || !isSportmonksConfigured()) {
      res.json(empty);
      return;
    }
    try {
      // نسخة عميقة قبل التعريب كي لا نلوّث النسخة المكاشة بالخدمة
      const data = structuredClone(await getTeamOfTheWeek(leagueId));
      if (data.available) {
        const tr = await resolveNames(
          data.players.flatMap((p) => [p.name, p.teamName])
        ).catch(() => null);
        if (tr) {
          for (const p of data.players) {
            p.name = tr(p.name) || p.name;
            p.teamName = tr(p.teamName) || p.teamName;
          }
        }
      }
      res.set("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
      res.json(data);
    } catch (error) {
      console.error("[Sports] totw failed:", error);
      res.status(502).json(empty);
    }
  });

  // حكم المباراة + صرامته بالأرقام في البطولة (SportMonks referees).
  app.get("/api/sports/match/:id/referee", async (req, res) => {
    const empty = { available: false, name: "", photo: null, countryName: null, countryFlag: null, stats: null };
    if (!isSportmonksConfigured()) {
      res.json(empty);
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "معرّف مباراة غير صحيح" });
    try {
      const smId = await resolveSportsSmId(id);
      if (!smId) return res.json(empty);
      // نسخة عميقة قبل التعريب كي لا نلوّث النسخة المكاشة بالخدمة
      const data = structuredClone(await getMatchReferee(id, { directSmId: smId }));
      if (data.available) {
        const tr = await resolveNames([data.name, data.countryName]).catch(() => null);
        if (tr) {
          data.name = tr(data.name) || data.name;
          if (data.countryName) data.countryName = tr(data.countryName) || data.countryName;
        }
      }
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=3600");
      res.json(data);
    } catch (error) {
      console.error("[Sports] referee failed:", error);
      res.status(502).json(empty);
    }
  });

  // التشكيلة المتوقعة قبل المباراة (SportMonks) — تُعرض حتى صدور الرسمية.
  app.get("/api/sports/match/:id/expected-lineup", async (req, res) => {
    const empty = { available: false, home: null, away: null };
    if (!isSportmonksConfigured()) {
      res.json(empty);
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "معرّف مباراة غير صحيح" });
    try {
      const smId = await resolveSportsSmId(id);
      if (!smId) return res.json(empty);
      // نسخة عميقة قبل التعريب كي لا نلوّث النسخة المكاشة بالخدمة
      const data = structuredClone(await getExpectedLineups(id, { directSmId: smId }));
      if (data.available) {
        const players = [data.home, data.away]
          .filter(Boolean)
          .flatMap((side) => [...side!.starters, ...side!.bench]);
        const tr = await resolveNames(players.map((p) => p.name)).catch(() => null);
        if (tr) for (const p of players) p.name = tr(p.name) || p.name;
      }
      res.set("Cache-Control", "public, max-age=60, s-maxage=180, stale-while-revalidate=600");
      res.json(data);
    } catch (error) {
      console.error("[Sports] expected-lineup failed:", error);
      res.status(502).json(empty);
    }
  });

  // توقّعات احتمالية متقدّمة (SportMonks) — فرصة مزدوجة/BTTS/أكثر-أقل/أرجح النتائج.
  app.get("/api/sports/match/:id/forecast", async (req, res) => {
    const empty = { available: false, fulltime: null, btts: null, doubleChance: null, goals: [], correctScores: [] };
    if (!isSportmonksConfigured()) {
      res.json(empty);
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "معرّف مباراة غير صحيح" });
    try {
      const smId = await resolveSportsSmId(id);
      if (!smId) return res.json(empty);
      res.set("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
      res.json(await getForecast(id, { directSmId: smId }));
    } catch (error) {
      console.error("[Sports] forecast failed:", error);
      res.json(empty);
    }
  });

  app.get("/api/sports/match/:id/pressure", async (req, res) => {
    if (!isSportmonksConfigured()) {
      return res.status(503).json({ configured: false, available: false, live: false, latest: null, points: [] });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "معرّف مباراة غير صحيح" });
    try {
      const smId = await resolveSportsSmId(id);
      if (!smId) return res.json({ available: false, live: false, latest: null, points: [] });
      res.set("Cache-Control", SM_ENRICH_CACHE);
      res.json(await getPressure(id, { directSmId: smId }));
    } catch (error) {
      console.error("[Sports] pressure failed:", error);
      res.status(502).json({ available: false, live: false, latest: null, points: [] });
    }
  });

  // رسم الزخم الهجومي (الهجمات الخطيرة عبر الزمن) — إثراء SportMonks، نظير المونديال.
  app.get("/api/sports/match/:id/momentum", async (req, res) => {
    if (!isSportmonksConfigured()) {
      return res.status(503).json({ configured: false, available: false, live: false, possession: null, points: [] });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "معرّف مباراة غير صحيح" });
    try {
      const smId = await resolveSportsSmId(id);
      if (!smId) return res.json({ available: false, live: false, possession: null, points: [] });
      res.set("Cache-Control", SM_ENRICH_CACHE);
      res.json(await getMomentum(id, { directSmId: smId }));
    } catch (error) {
      console.error("[Sports] momentum failed:", error);
      res.status(502).json({ available: false, live: false, possession: null, points: [] });
    }
  });

  // التعليق الحيّ (أبرز اللحظات معرَّبة) — إثراء SportMonks، نظير المونديال.
  app.get("/api/sports/match/:id/commentary", async (req, res) => {
    if (!isSportmonksConfigured()) {
      return res.status(503).json({ configured: false, available: false, live: false, items: [] });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "معرّف مباراة غير صحيح" });
    try {
      const smId = await resolveSportsSmId(id);
      if (!smId) return res.json({ available: false, live: false, items: [] });
      res.set("Cache-Control", SM_ENRICH_CACHE);
      res.json(await getCommentary(id, { directSmId: smId }));
    } catch (error) {
      console.error("[Sports] commentary failed:", error);
      res.status(502).json({ available: false, live: false, items: [] });
    }
  });

  app.get("/api/sports/match/:id/facts", async (req, res) => {
    if (!isSportmonksConfigured()) {
      return res.status(503).json({
        configured: false, available: false, statistics: [], weather: null, absentees: [], eventDetails: [], halftime: null,
      });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "معرّف مباراة غير صحيح" });
    try {
      const smId = await resolveSportsSmId(id);
      if (!smId) {
        return res.json({ available: false, statistics: [], weather: null, absentees: [], eventDetails: [], halftime: null });
      }
      const facts = await getMatchFacts(id, { directSmId: smId });
      // تعريب أسماء المغيبين (تأتي إنجليزية من SportMonks، تُحلّ غالبًا للمباريات القادمة) أفضل جهد.
      if (facts.absentees.length > 0) {
        const tr = await resolveNames(facts.absentees.map((a) => a.name)).catch(() => null);
        if (tr) facts.absentees = facts.absentees.map((a) => ({ ...a, name: tr(a.name) || a.name }));
      }
      res.set("Cache-Control", SM_ENRICH_CACHE);
      res.json(facts);
    } catch (error) {
      console.error("[Sports] facts failed:", error);
      res.status(502).json({ available: false, statistics: [], weather: null, absentees: [], eventDetails: [], halftime: null });
    }
  });

  const parseId = (raw: unknown): number | null => {
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  };

  // صفحة النادي: هوية + ترتيب + مباريات + تشكيلة — المعرّف عام عند المزود.
  // الموجة 1: عند ?with=stats تُضمَّن إحصاءات النادي + المدرب + هدّافوه في نفس
  // الاستجابة (واجهة صفحة النادي تستخدمها لتقليل الطلبات).
  app.get("/api/sports/team/:id", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.status(404).json({ message: "النادي غير موجود" });
      return;
    }
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف نادٍ غير صحيح" });
      return;
    }
    try {
      const withExtras = req.query.with === "stats";
      let timedOut = false;
      const profile = await bestEffortWithin(getTeamProfile(id, { withExtras }), {
        fallback: null,
        // بعد SWR على الملف الكامل: 3ث كافية؛ أطول من ذلك = طابور مزوّد محتجز.
        timeoutMs: 3_000,
        onTimeout: () => {
          timedOut = true;
          warnThrottled(`deadline:team-profile:${id}`, `[Sports] team profile deadline exceeded for ${id}`);
        },
      });
      if (!profile) {
        if (timedOut) {
          res.status(503).json({ message: "صفحة النادي تُحمَّل حاليًا" });
          return;
        }
        res.status(404).json({ message: "النادي غير موجود" });
        return;
      }
      res.set("Cache-Control", "public, max-age=120, s-maxage=600, stale-while-revalidate=1800");
      res.json(profile);
    } catch (error) {
      console.error("[Sports] team profile failed:", error);
      res.status(502).json({ message: "تعذر جلب صفحة النادي حاليًا" });
    }
  });

  // بطاقة المشاركة (OG) المولّدة للنادي — 1200×630 معتمة (خلفية سبق + شعار
  // النادي + اسمه + مركزه). تُستهلك من og:image في seoInjector/edgeMeta لأن
  // صور المزوّد 150×150 شفّافة يرفضها واتساب. تتدهور لصورة سبق الافتراضية.
  app.get("/api/sports/og/team/:id", async (req, res) => {
    const id = parseId(req.params.id);
    if (id == null || !isSaudiLeagueConfigured()) {
      res.redirect(302, "/branding/sabq-og-image.png");
      return;
    }
    try {
      const png = await getTeamOgImage(id);
      if (!png) {
        res.redirect(302, "/branding/sabq-og-image.png");
        return;
      }
      res.set("Content-Type", "image/png");
      res.set("Cache-Control", "public, max-age=21600, s-maxage=86400, stale-while-revalidate=86400");
      res.send(png);
    } catch (error) {
      console.error("[Sports] team OG image failed:", error);
      res.redirect(302, "/branding/sabq-og-image.png");
    }
  });

  // إحصاءات النادي الشاملة (الموجة 1) — منفصلة لمن يريد الأرقام وحدها.
  app.get("/api/sports/team/:id/stats", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.status(404).json({ message: "الإحصاءات غير متاحة" });
      return;
    }
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف نادٍ غير صحيح" });
      return;
    }
    try {
      const stats = await getTeamStats(id);
      if (!stats) {
        res.status(404).json({ message: "لا تتوفّر إحصاءات تفصيلية لهذا النادي" });
        return;
      }
      res.set("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
      res.json(stats);
    } catch (error) {
      console.error("[Sports] team stats failed:", error);
      res.status(502).json({ message: "تعذر جلب إحصاءات النادي حاليًا" });
    }
  });

  // المدرب (الموجة 1) — بطاقة المدرب الحالي للنادي.
  app.get("/api/sports/team/:id/coach", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.status(404).json({ message: "بيانات المدرب غير متاحة" });
      return;
    }
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف نادٍ غير صحيح" });
      return;
    }
    try {
      const coach = await getTeamCoach(id);
      if (!coach) {
        res.status(404).json({ message: "بيانات المدرب غير متاحة" });
        return;
      }
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      res.json(coach);
    } catch (error) {
      console.error("[Sports] team coach failed:", error);
      res.status(502).json({ message: "تعذر جلب بيانات المدرب حاليًا" });
    }
  });

  // هدّافو النادي (الموجة 1) — أعلى 5 هدّافين في صفوف النادي هذا الموسم.
  app.get("/api/sports/team/:id/scorers", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.json({ scorers: [] });
      return;
    }
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف نادٍ غير صحيح" });
      return;
    }
    try {
      const scorers = await getTeamTopScorers(id);
      res.set("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600");
      res.json({ scorers });
    } catch (error) {
      console.error("[Sports] team scorers failed:", error);
      res.status(502).json({ message: "تعذر جلب هدّافي النادي حاليًا" });
    }
  });

  // انتقالات النادي (الموجة 2) — آخر من وصل وغادر (نافذة الانتقالات).
  app.get("/api/sports/team/:id/transfers", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.json({ arrivals: [], departures: [] });
      return;
    }
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف نادٍ غير صحيح" });
      return;
    }
    try {
      const empty = { arrivals: [] as Awaited<ReturnType<typeof getTeamTransfers>>["arrivals"], departures: [] as Awaited<ReturnType<typeof getTeamTransfers>>["departures"] };
      const transfers = await bestEffortWithin(getTeamTransfers(id), {
        fallback: empty,
        timeoutMs: 3_000,
        onTimeout: () => warnThrottled(`deadline:team-transfers:${id}`, `[Sports] team transfers deadline exceeded for ${id}`),
      });
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      res.json(transfers);
    } catch (error) {
      console.error("[Sports] team transfers failed:", error);
      res.json({ arrivals: [], departures: [] });
    }
  });

  // إصابات/غيابات النادي (TheSports) — يلزم ?comp=<slug> لبناء جسر الفِرق الصحيح.
  // أفضل جهد: غياب TheSports/تعذّر الربط/IP غير مُدرَج → [] فتُخفى الواجهة.
  app.get("/api/sports/team/:id/injuries", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.json({ injuries: [] });
      return;
    }
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف نادٍ غير صحيح" });
      return;
    }
    const comp = typeof req.query.comp === "string" ? req.query.comp : null;
    try {
      const injuries = await getTeamInjuries(id, comp);
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=21600");
      res.json({ injuries });
    } catch (error) {
      console.error("[Sports] team injuries failed:", error);
      res.json({ injuries: [] });
    }
  });

  // مركز الانتقالات — موجز موحّد لكل أندية دوري روشن (وصل/غادر) في قائمة واحدة.
  // ?since=عدد الأشهر للنافذة (افتراضي 4 — ميركاتو جارٍ). يتدهور بسلاسة بلا مفتاح.
  app.get("/api/sports/transfers", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.json({ configured: false, clubs: [], transfers: [], stats: { total: 0, withFee: 0, loans: 0, free: 0 } });
      return;
    }
    const sinceRaw = parseId(typeof req.query.since === "string" ? req.query.since : "");
    const sinceMonths = sinceRaw != null && sinceRaw > 0 && sinceRaw <= 60 ? sinceRaw : 4;
    try {
      const result = await getLeagueTransfers(sinceMonths);
      // ندمج المؤكّد السعودي من SportMonks (مسارات فرق روشن): API-Football قد
      // يتأخّر أسابيع عن النافذة. أفضل جهد: فشل الدمج لا يُسقط القائمة.
      // لا نُحوّر كائن الكاش (SWR) — نبني ردًّا جديدًا.
      let transfers = result.transfers;
      let stats = result.stats;
      try {
        const { getSaudiConfirmedFromGlobal } = await import("../services/transferCenterService");
        const extra = await getSaudiConfirmedFromGlobal();
        if (extra.length > 0) {
          // إزالة التكرار: تاريخ + نادٍ مُطلِق + مستقبِل (مُعرَّبان في الفيدين).
          const seen = new Set(result.transfers.map((t) => `${t.date}|${t.from.name}|${t.to.name}`));
          const merged = [...result.transfers];
          for (const e of extra) {
            const key = `${e.date}|${e.from.name}|${e.to.name}`;
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(e);
          }
          merged.sort((a, b) => b.date.localeCompare(a.date));
          transfers = merged;
          stats = {
            total: merged.length,
            withFee: merged.filter((t) => t.kind === "money").length,
            loans: merged.filter((t) => t.kind === "loan" || t.kind === "loanend").length,
            free: merged.filter((t) => t.kind === "free").length,
          };
        }
      } catch (mergeErr) {
        console.error("[Sports] merge SportMonks saudi confirmed failed:", mergeErr);
      }
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      res.json({ configured: true, ...result, transfers, stats });
    } catch (error) {
      console.error("[Sports] league transfers failed:", error);
      res.status(502).json({ message: "تعذر جلب مركز الانتقالات حاليًا" });
    }
  });

  // تشكيلة النادي وحدها (للاستهلاك المنفصل عند الحاجة).
  app.get("/api/sports/squad/:id", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.status(404).json({ message: "التشكيلة غير متاحة" });
      return;
    }
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف نادٍ غير صحيح" });
      return;
    }
    try {
      const squad = await getSquad(id);
      if (!squad) {
        res.status(404).json({ message: "التشكيلة غير متاحة" });
        return;
      }
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      res.json(squad);
    } catch (error) {
      console.error("[Sports] squad failed:", error);
      res.status(502).json({ message: "تعذر جلب التشكيلة حاليًا" });
    }
  });

  // بطاقة اللاعب: ملف شخصي + أرقام الموسم + مسيرة + ألقاب.
  app.get("/api/sports/player/:id", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.status(404).json({ message: "ملف اللاعب غير متاح" });
      return;
    }
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف لاعب غير صحيح" });
      return;
    }
    try {
      let timedOut = false;
      const wantExtras = req.query.with === "extras";
      // extras كانت تنتظر انتهاء البطاقة (~3ث) ثم تضيف ~2.5ث — ابدأها معًا.
      const playerPromise = bestEffortWithin(getPlayerCard(id), {
        fallback: null,
        timeoutMs: 3_000,
        onTimeout: () => {
          timedOut = true;
          warnThrottled(`deadline:player-card:${id}`, `[Sports] player card deadline exceeded for ${id}`);
        },
      });
      const extrasPromise = wantExtras
        ? Promise.all([
            bestEffortWithin(getPlayerSeasonHistory(id).catch(() => []), {
              fallback: [] as Awaited<ReturnType<typeof getPlayerSeasonHistory>>,
              timeoutMs: 2_500,
            }),
            bestEffortWithin(getPlayerTransfers(id).catch(() => []), {
              fallback: [] as Awaited<ReturnType<typeof getPlayerTransfers>>,
              timeoutMs: 2_500,
            }),
            bestEffortWithin(getPlayerInjuries(id).catch(() => []), {
              fallback: [] as Awaited<ReturnType<typeof getPlayerInjuries>>,
              timeoutMs: 2_500,
            }),
          ])
        : null;

      const [player, extras] = await Promise.all([playerPromise, extrasPromise]);
      if (!player) {
        if (timedOut) {
          res.status(503).json({ message: "ملف اللاعب يُحمَّل حاليًا" });
          return;
        }
        res.status(404).json({ message: "ملف اللاعب غير متاح" });
        return;
      }
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      if (extras) {
        const [history, transfers, injuries] = extras;
        res.json({ ...player, history, transfers, injuries });
        return;
      }
      res.json(player);
    } catch (error) {
      console.error("[Sports] player card failed:", error);
      res.status(502).json({ message: "تعذر جلب ملف اللاعب حاليًا" });
    }
  });

  // القيمة السوقية للاعب + تاريخها (TheSports) — lazy، أفضل جهد، تُخفى إن فرغت.
  app.get("/api/sports/player/:id/market", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.json({ available: false, value: null, currency: "€", peak: null, history: [] });
      return;
    }
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف لاعب غير صحيح" });
      return;
    }
    try {
      const empty = { available: false, value: null, currency: "€", peak: null, history: [] };
      const market = await bestEffortWithin(getPlayerMarketValue(id), {
        fallback: empty,
        // كان يبلغ 17ث خلف بطاقة اللاعب الكاملة + TheSports؛ نخفي القسم ونكمل الجلب للكاش.
        timeoutMs: 3_500,
        onTimeout: () => warnThrottled(`deadline:player-market:${id}`, `[Sports] player market deadline exceeded for ${id}`),
      });
      res.set("Cache-Control", "public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400");
      res.json(market);
    } catch (error) {
      console.error("[Sports] player market failed:", error);
      res.json({ available: false, value: null, currency: "€", peak: null, history: [] });
    }
  });

  // فورمة اللاعب (SportMonks) — آخر مبارياته بتقييم/xG. lazy، أفضل جهد، تُخفى إن فرغت.
  app.get("/api/sports/player/:id/form", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.json({ available: false, matches: [] });
      return;
    }
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف لاعب غير صحيح" });
      return;
    }
    try {
      const form = await bestEffortWithin(getPlayerForm(id), {
        fallback: { available: false, matches: [] },
        timeoutMs: 2_500,
        onTimeout: () => warnThrottled(`deadline:player-form:${id}`, `[Sports] player form deadline exceeded for ${id}`),
      });
      res.set("Cache-Control", "public, max-age=1800, s-maxage=10800, stale-while-revalidate=21600");
      res.json(form);
    } catch (error) {
      console.error("[Sports] player form failed:", error);
      res.json({ available: false, matches: [] });
    }
  });

  // المرحلة 2 (ذكاء): سرد المباراة آليًا بالعربية (جارية/منتهية).
  // مقصورة على أهل التحرير (لوحة التحكم) — كانت مفتوحة للعموم بلا مصادقة ولا حدّ،
  // وكل معرّف مباراة جديد يشغّل توليد LLM + استدعاءات API-Football مدفوعة.
  app.get("/api/sports/match/:id/story", requireSportsAiEditor("articles.create", "articles.edit_any", "articles.edit_own"), async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.status(404).json({ message: "غير متاح" });
      return;
    }
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف مباراة غير صحيح" });
      return;
    }
    try {
      const story = await generateMatchStory(id);
      if (!story) {
        res.status(404).json({ message: "لا يتوفّر ملخّص لهذه المباراة" });
        return;
      }
      // استجابة خلف مصادقة — private حتى لا تعلَق نسخة على حافة CDN.
      res.set("Cache-Control", "private, max-age=60");
      res.json(story);
    } catch (error) {
      console.error("[Sports] match story failed:", error);
      res.status(502).json({ message: "تعذر توليد ملخّص المباراة حاليًا" });
    }
  });

  // المرحلة 2 (ذكاء): معاينة ما قبل المباراة (للمباريات غير المبدوءة فقط).
  // مقصورة على أهل التحرير كما «السرد» أعلاه — لا توليد AI مفتوحًا للعموم.
  app.get("/api/sports/match/:id/preview", requireSportsAiEditor("articles.create", "articles.edit_any", "articles.edit_own"), async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.status(404).json({ message: "غير متاح" });
      return;
    }
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف مباراة غير صحيح" });
      return;
    }
    try {
      const preview = await generateMatchPreview(id);
      if (!preview) {
        res.status(404).json({ message: "لا تتوفّر معاينة لهذه المباراة" });
        return;
      }
      // استجابة خلف مصادقة — private حتى لا تعلَق نسخة على حافة CDN.
      res.set("Cache-Control", "private, max-age=300");
      res.json(preview);
    } catch (error) {
      console.error("[Sports] match preview failed:", error);
      res.status(502).json({ message: "تعذر توليد معاينة المباراة حاليًا" });
    }
  });

  // ============================================================
  // المرحلة 3 (الشخصنة): متابعة الفِرق/البطولات
  // كلها تتطلّب جلسة ويب (requireAuth). الـ refId نصّ: معرّف فريق أو slug بطولة.
  // ============================================================

  // متابعاتي
  app.get("/api/sports/follows", requireAuth, async (req: any, res) => {
    try {
      const follows = await listFollows(req.user.id);
      res.set("Cache-Control", "private, no-store");
      res.json({ follows });
    } catch (error) {
      console.error("[Sports] list follows failed:", error);
      res.status(502).json({ message: "تعذر جلب متابعاتك حاليًا" });
    }
  });

  // إضافة متابعة
  app.post("/api/sports/follows", requireAuth, async (req: any, res) => {
    const { kind, refId, refName, refLogo } = req.body ?? {};
    if (!isValidFollowKind(kind) || !refId || !refName) {
      res.status(400).json({ message: "بيانات المتابعة غير مكتملة" });
      return;
    }
    try {
      const follow = await addFollow(req.user.id, {
        kind,
        refId: String(refId),
        refName: String(refName),
        refLogo: refLogo ? String(refLogo) : null,
      });
      res.set("Cache-Control", "private, no-store");
      res.json({ follow });
    } catch (error) {
      console.error("[Sports] add follow failed:", error);
      res.status(502).json({ message: "تعذر حفظ المتابعة حاليًا" });
    }
  });

  // تفعيل/كتم إشعارات متابعة قائمة
  app.patch("/api/sports/follows", requireAuth, async (req: any, res) => {
    const { kind, refId, notify } = req.body ?? {};
    if (!isValidFollowKind(kind) || !refId || typeof notify !== "boolean") {
      res.status(400).json({ message: "بيانات تحديث المتابعة غير مكتملة" });
      return;
    }
    try {
      await setFollowNotify(req.user.id, kind, String(refId), notify);
      res.set("Cache-Control", "private, no-store");
      res.json({ ok: true });
    } catch (error) {
      console.error("[Sports] update follow notify failed:", error);
      res.status(502).json({ message: "تعذر تحديث إعداد الإشعار حاليًا" });
    }
  });

  // إلغاء متابعة (?kind=&refId=)
  app.delete("/api/sports/follows", requireAuth, async (req: any, res) => {
    const kind = req.query.kind;
    const refId = req.query.refId;
    if (!isValidFollowKind(kind) || !refId) {
      res.status(400).json({ message: "بيانات إلغاء المتابعة غير مكتملة" });
      return;
    }
    try {
      await removeFollow(req.user.id, kind, String(refId));
      res.set("Cache-Control", "private, no-store");
      res.json({ ok: true });
    } catch (error) {
      console.error("[Sports] remove follow failed:", error);
      res.status(502).json({ message: "تعذر إلغاء المتابعة حاليًا" });
    }
  });

  // تفضيلات أنواع تنبيهات المباريات (عامّة على كل الفِرق المتابَعة): انطلاق/أهداف/
  // بطاقات/فار/نهاية. نظيرة /api/v1/sports/alert-prefs للموبايل لكن بجلسة Passport.
  app.get("/api/sports/alert-prefs", requireAuth, async (req: any, res) => {
    try {
      const { getPrefs } = await import("../services/sportsAlertPrefsService");
      const preferences = await getPrefs(req.user.id);
      res.set("Cache-Control", "private, no-store");
      res.json({ preferences });
    } catch (error) {
      console.error("[Sports] get alert-prefs failed:", error);
      res.status(502).json({ message: "تعذر جلب تفضيلات الإشعارات حاليًا" });
    }
  });

  app.put("/api/sports/alert-prefs", requireAuth, async (req: any, res) => {
    try {
      const { upsertPrefs } = await import("../services/sportsAlertPrefsService");
      const body = req.body ?? {};
      const patch: Record<string, boolean> = {};
      for (const key of ["kickoff", "goals", "cards", "varReview", "fulltime", "transfersSaudi", "transfersGlobal"] as const) {
        if (typeof body[key] === "boolean") patch[key] = body[key];
      }
      const preferences = await upsertPrefs(req.user.id, patch);
      res.set("Cache-Control", "private, no-store");
      res.json({ preferences });
    } catch (error) {
      console.error("[Sports] save alert-prefs failed:", error);
      res.status(502).json({ message: "تعذر حفظ تفضيلات الإشعارات حاليًا" });
    }
  });

  // المواجهات المباشرة بين فريقين (?home=&away=). تُستدعى من نافذة المباراة.
  app.get("/api/sports/h2h", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.json({ configured: false, summary: null, meetings: [] });
      return;
    }
    const home = parseId(req.query.home);
    const away = parseId(req.query.away);
    if (home == null || away == null) {
      res.status(400).json({ message: "معرّفا الفريقين مطلوبان" });
      return;
    }
    try {
      const h2h = await getHeadToHead(home, away);
      res.set("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
      res.json({ configured: true, ...h2h });
    } catch (error) {
      console.error("[Sports] h2h failed:", error);
      res.status(502).json({ message: "تعذر جلب المواجهات حاليًا" });
    }
  });

  // البند 12: توقّعات المباراة (lazy) — تُعرض للمباريات غير المبدوءة فقط في الواجهة.
  app.get("/api/sports/match/:id/prediction", async (req, res) => {
    if (!isSaudiLeagueConfigured()) {
      res.status(404).json({ message: "غير متاح" });
      return;
    }
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ message: "معرّف مباراة غير صحيح" });
      return;
    }
    try {
      const prediction = await getFixturePrediction(id);
      if (!prediction) {
        res.status(404).json({ message: "لا تتوفّر توقّعات لهذه المباراة" });
        return;
      }
      res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
      res.json(prediction);
    } catch (error) {
      console.error("[Sports] prediction failed:", error);
      res.status(502).json({ message: "تعذر جلب التوقّعات حاليًا" });
    }
  });

  // توقّعات المباريات انتقلت إلى المنصة المركزية — routes/predictionsCore.ts
}
