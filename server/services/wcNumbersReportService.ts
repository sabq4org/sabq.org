/**
 * تقرير كأس العالم 2026 بالأرقام — مسودة داخلية.
 * يجمع: تغطية سبق التحريرية + إحصائيات البطولة من worldCupService.
 * لا يُنشر للعامة حتى تفعيل صريح لاحقاً.
 */

import { and, eq, ilike, like, notIlike, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { articles, articleTags, categories, tags } from "@shared/schema";
import { CACHE_TTL, withSWR } from "../memoryCache";
import {
  detectChampion,
  getFixtures,
  getTopAssists,
  getTopCards,
  getTopScorers,
  isWorldCupConfigured,
  type WcChampion,
  type WcFixture,
} from "./worldCupService";
import { isArabTeam } from "./worldCupNames";

const SLUG_PREFIX = "wc26";
const WORLD_CUP_NEWS_TERMS = ["مونديال", "كأس العالم"] as const;
/** بداية نافذة تغطية مونديال 2026 (يستبعد أرشيف 2018/2022 وبطولات أخرى). */
const WC2026_COVERAGE_START = "2026-01-01T00:00:00+03:00";

export type WcNumbersReportStatus = "draft" | "published";

export type SabqCoverageBreakdown = {
  /** مواد غرفة المباريات الحتمية: wc26-preview-* / wc26-report-* / wc26-* */
  matchDesk: number;
  /** مواد تحريرية في قسم الرياضة ضمن نافذة 2026 بعد استبعاد الضوضاء */
  editorialWindow: number;
};

export type SabqCoverageStats = {
  totalArticles: number;
  aiGenerated: number;
  editorial: number;
  previews: number;
  matchReports: number;
  infographics: number;
  analyses: number;
  opinions: number;
  totalViews: number;
  avgViews: number;
  breakdown: SabqCoverageBreakdown;
  methodology: string[];
  topArticles: Array<{
    id: string;
    title: string;
    slug: string;
    englishSlug: string | null;
    views: number;
    articleType: string | null;
    aiGenerated: boolean | null;
    publishedAt: string | null;
    imageUrl: string | null;
  }>;
  dailyPulse: Array<{ day: string; count: number; views: number }>;
};

export type TournamentStats = {
  configured: boolean;
  totalFixtures: number;
  finished: number;
  live: number;
  upcoming: number;
  totalGoals: number;
  avgGoalsPerMatch: number;
  penaltyShootouts: number;
  champion: WcChampion | null;
  topScorers: Array<{ name: string; team: string; goals: number; assists: number }>;
  topAssists: Array<{ name: string; team: string; assists: number }>;
  cards: {
    yellowOnBoard: number;
    redOnBoard: number;
    leaders: Array<{ name: string; team: string; yellow: number; red: number }>;
  };
  arab: {
    matchesPlayed: number;
    goalsFor: number;
    goalsAgainst: number;
  };
};

export type PlatformHighlight = {
  id: string;
  title: string;
  description: string;
  href?: string;
};

export type StoryBeat = {
  label: string;
  value: string;
  numericValue: number | null;
  detail: string;
};

export type WcNumbersReport = {
  status: WcNumbersReportStatus;
  generatedAt: string;
  headline: string;
  subtitle: string;
  sabq: SabqCoverageStats;
  tournament: TournamentStats;
  platform: PlatformHighlight[];
  storyBeats: StoryBeat[];
};

function worldCupKeywordPredicate() {
  return or(
    ...WORLD_CUP_NEWS_TERMS.map((term) => {
      const pat = `%${term}%`;
      return or(
        ilike(articles.title, pat),
        sql`(${articles.seo} -> 'keywords')::text ILIKE ${pat}`,
        sql`EXISTS (
          SELECT 1 FROM ${articleTags} AS atg
          JOIN ${tags} AS tg ON tg.id = atg.tag_id
          WHERE atg.article_id = ${articles.id}
            AND (tg.name_ar ILIKE ${pat} OR tg.name_en ILIKE ${pat} OR tg.slug ILIKE ${pat})
        )`,
      );
    }),
  )!;
}

function matchDeskSlugPredicate() {
  return or(
    like(articles.slug, `${SLUG_PREFIX}-%`),
    like(articles.legacySlug, `${SLUG_PREFIX}-%`),
  )!;
}

/** استبعاد كأس العالم للأندية وأي صيغة شائعة لها. */
function excludeClubWorldCupNoise() {
  return and(
    notIlike(articles.title, "%للأندية%"),
    notIlike(articles.title, "%مونديال الأندية%"),
    notIlike(articles.title, "%كأس العالم للأندية%"),
    notIlike(articles.title, "%club world%"),
  )!;
}

/**
 * يستبعد عناوين تشير لمونديالات سابقة (2010/2014/2018/2022)
 * ما لم تذكر 2026 صراحةً.
 */
function excludeLegacyWorldCupYears() {
  return sql`(
    ${articles.title} NOT ~* '(^|[^0-9])(2010|2014|2018|2022)([^0-9]|$)'
    OR ${articles.title} ILIKE '%2026%'
  )`;
}

async function getSportsCategoryId(): Promise<string | null> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, "sports"))
    .limit(1);
  return row?.id ?? null;
}

/**
 * مواد مونديال 2026 فقط:
 * 1) slug حتمي wc26-* (غرفة المباريات)
 * 2) تحريري: قسم الرياضة + كلمة مونديال/كأس العالم + نُشر منذ 2026-01-01
 *    مع استبعاد أندية + سنوات مونديالات سابقة
 */
async function wcArticlesWhere(): Promise<SQL | undefined> {
  const sportsId = await getSportsCategoryId().catch(() => null);
  const editorial2026 =
    sportsId != null
      ? and(
          eq(articles.categoryId, sportsId),
          worldCupKeywordPredicate(),
          sql`${articles.publishedAt} >= ${WC2026_COVERAGE_START}::timestamptz`,
          excludeClubWorldCupNoise(),
          excludeLegacyWorldCupYears(),
        )
      : undefined;

  return and(
    eq(articles.status, "published"),
    editorial2026
      ? or(matchDeskSlugPredicate(), editorial2026)!
      : matchDeskSlugPredicate(),
  );
}

const COVERAGE_METHODOLOGY = [
  "المؤكّد: مواد slug تبدأ بـ wc26- (معاينات/تقارير غرفة مباريات المونديال).",
  "التحريري: قسم الرياضة + (مونديال أو كأس العالم) في العنوان/SEO/وسم، ونُشرت منذ 2026-01-01.",
  "مستبعد: كأس العالم للأندية، وعناوين تشير لـ 2010/2014/2018/2022 بلا ذكر 2026.",
  "لا يُحسب أرشيف المونديالات السابقة ولا المواد خارج قسم الرياضة.",
] as const;

async function buildSabqCoverage(): Promise<SabqCoverageStats> {
  const where = await wcArticlesWhere();
  const slugPred = matchDeskSlugPredicate();

  const [agg] = await db
    .select({
      total: sql<number>`count(*)::int`,
      matchDesk: sql<number>`count(*) filter (where ${slugPred})::int`,
      aiGenerated: sql<number>`count(*) filter (where ${articles.aiGenerated} = true)::int`,
      previews: sql<number>`count(*) filter (where ${articles.slug} like ${`${SLUG_PREFIX}-preview-%`} or ${articles.legacySlug} like ${`${SLUG_PREFIX}-preview-%`})::int`,
      matchReports: sql<number>`count(*) filter (where ${articles.slug} like ${`${SLUG_PREFIX}-report-%`} or ${articles.legacySlug} like ${`${SLUG_PREFIX}-report-%`})::int`,
      infographics: sql<number>`count(*) filter (where ${articles.articleType} = 'infographic')::int`,
      analyses: sql<number>`count(*) filter (where ${articles.articleType} = 'analysis')::int`,
      opinions: sql<number>`count(*) filter (where ${articles.articleType} = 'opinion')::int`,
      totalViews: sql<number>`coalesce(sum(${articles.views}), 0)::int`,
    })
    .from(articles)
    .where(where);

  const top = await db
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      englishSlug: articles.englishSlug,
      views: articles.views,
      articleType: articles.articleType,
      aiGenerated: articles.aiGenerated,
      publishedAt: articles.publishedAt,
      imageUrl: articles.imageUrl,
    })
    .from(articles)
    .where(where)
    .orderBy(sql`${articles.views} desc nulls last`)
    .limit(8);

  const daily = await db
    .select({
      day: sql<string>`to_char(timezone('Asia/Riyadh', ${articles.publishedAt}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
      views: sql<number>`coalesce(sum(${articles.views}), 0)::int`,
    })
    .from(articles)
    .where(and(where, sql`${articles.publishedAt} is not null`))
    .groupBy(sql`to_char(timezone('Asia/Riyadh', ${articles.publishedAt}), 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(timezone('Asia/Riyadh', ${articles.publishedAt}), 'YYYY-MM-DD')`);

  const total = Number(agg?.total ?? 0);
  const matchDesk = Number(agg?.matchDesk ?? 0);
  const totalViews = Number(agg?.totalViews ?? 0);
  const aiGenerated = Number(agg?.aiGenerated ?? 0);

  return {
    totalArticles: total,
    aiGenerated,
    editorial: Math.max(total - aiGenerated, 0),
    previews: Number(agg?.previews ?? 0),
    matchReports: Number(agg?.matchReports ?? 0),
    infographics: Number(agg?.infographics ?? 0),
    analyses: Number(agg?.analyses ?? 0),
    opinions: Number(agg?.opinions ?? 0),
    totalViews,
    avgViews: total > 0 ? Math.round(totalViews / total) : 0,
    breakdown: {
      matchDesk,
      editorialWindow: Math.max(total - matchDesk, 0),
    },
    methodology: [...COVERAGE_METHODOLOGY],
    topArticles: top.map((a) => ({
      id: a.id,
      title: a.title,
      slug: a.slug,
      englishSlug: a.englishSlug,
      views: a.views ?? 0,
      articleType: a.articleType,
      aiGenerated: a.aiGenerated,
      publishedAt: a.publishedAt ? new Date(a.publishedAt).toISOString() : null,
      imageUrl: a.imageUrl,
    })),
    dailyPulse: daily
      .filter((d) => d.day)
      .map((d) => ({
        day: d.day,
        count: Number(d.count),
        views: Number(d.views),
      })),
  };
}

function computeArabStats(fixtures: WcFixture[]) {
  let matchesPlayed = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  for (const f of fixtures) {
    if (!f.status.finished && !f.status.live) continue;
    const homeArab = isArabTeam(f.home.id);
    const awayArab = isArabTeam(f.away.id);
    if (!homeArab && !awayArab) continue;
    matchesPlayed++;
    const gh = f.goals.home ?? 0;
    const ga = f.goals.away ?? 0;
    if (homeArab) {
      goalsFor += gh;
      goalsAgainst += ga;
    }
    if (awayArab) {
      goalsFor += ga;
      goalsAgainst += gh;
    }
  }
  return { matchesPlayed, goalsFor, goalsAgainst };
}

async function buildTournamentStats(): Promise<TournamentStats> {
  if (!isWorldCupConfigured()) {
    return {
      configured: false,
      totalFixtures: 0,
      finished: 0,
      live: 0,
      upcoming: 0,
      totalGoals: 0,
      avgGoalsPerMatch: 0,
      penaltyShootouts: 0,
      champion: null,
      topScorers: [],
      topAssists: [],
      cards: { yellowOnBoard: 0, redOnBoard: 0, leaders: [] },
      arab: { matchesPlayed: 0, goalsFor: 0, goalsAgainst: 0 },
    };
  }

  const [fixtures, scorers, assists, cards] = await Promise.all([
    getFixtures().catch(() => [] as WcFixture[]),
    getTopScorers().catch(() => []),
    getTopAssists().catch(() => []),
    getTopCards().catch(() => []),
  ]);

  const finished = fixtures.filter((f) => f.status.finished);
  const live = fixtures.filter((f) => f.status.live);
  const upcoming = fixtures.filter((f) => !f.status.finished && !f.status.live);
  let totalGoals = 0;
  let penaltyShootouts = 0;
  for (const f of finished) {
    totalGoals += (f.goals.home ?? 0) + (f.goals.away ?? 0);
    if (f.penalties && f.penalties.home != null && f.penalties.away != null) {
      penaltyShootouts++;
    }
  }

  const yellowOnBoard = cards.reduce((s, c) => s + (c.yellow ?? 0), 0);
  const redOnBoard = cards.reduce((s, c) => s + (c.red ?? 0), 0);

  return {
    configured: true,
    totalFixtures: fixtures.length,
    finished: finished.length,
    live: live.length,
    upcoming: upcoming.length,
    totalGoals,
    avgGoalsPerMatch:
      finished.length > 0 ? Math.round((totalGoals / finished.length) * 100) / 100 : 0,
    penaltyShootouts,
    champion: detectChampion(fixtures),
    topScorers: scorers.slice(0, 5).map((s) => ({
      name: s.name,
      team: s.team?.name ?? "",
      goals: s.goals,
      assists: s.assists ?? 0,
    })),
    topAssists: assists.slice(0, 5).map((s) => ({
      name: s.name,
      team: s.team?.name ?? "",
      assists: s.assists ?? 0,
    })),
    cards: {
      yellowOnBoard,
      redOnBoard,
      leaders: cards.slice(0, 5).map((c) => ({
        name: c.name,
        team: c.team?.name ?? "",
        yellow: c.yellow ?? 0,
        red: c.red ?? 0,
      })),
    },
    arab: computeArabStats(fixtures),
  };
}

function platformHighlights(): PlatformHighlight[] {
  return [
    {
      id: "hub",
      title: "مركز كأس العالم",
      description: "صفحة /world-cup: مباشر، ترتيب، شبكة إقصاء، هدّافون، بطاقات",
      href: "/world-cup",
    },
    {
      id: "live",
      title: "البث واللحظات الحية",
      description: "تراكب نتائج لحظية + زخم وضغط وتوقعات أثناء المباراة",
    },
    {
      id: "predictions",
      title: "توقعات الجمهور",
      description: "محرك wc* للتوقعات طوال البطولة مع لوحة تنافسية",
      href: "/world-cup/predictions",
    },
    {
      id: "ai-desk",
      title: "غرفة أخبار المونديال",
      description: "معاينات وتقارير مباريات مولَّدة من بيانات حقيقية (wc26-*)",
    },
    {
      id: "home-strip",
      title: "شريط الرئيسية",
      description: "حضور المونديال فوق طيّة الصفحة الرئيسية طوال الموسم",
    },
    {
      id: "mobile",
      title: "تطبيقات الموبايل",
      description: "تجربة iOS/Android متزامنة مع مركز المباراة والإشعارات",
    },
  ];
}

function buildStoryBeats(sabq: SabqCoverageStats, tournament: TournamentStats): StoryBeat[] {
  const champ = tournament.champion?.team?.name;
  return [
    {
      label: "مواد مونديال 2026",
      value: String(sabq.totalArticles),
      numericValue: sabq.totalArticles,
      detail: `${sabq.breakdown.matchDesk} غرفة مباريات · ${sabq.breakdown.editorialWindow} تحريري 2026`,
    },
    {
      label: "مشاهدات التغطية",
      value: sabq.totalViews.toLocaleString("en-US"),
      numericValue: sabq.totalViews,
      detail: `متوسط ${sabq.avgViews.toLocaleString("en-US")} مشاهدة/مادة`,
    },
    {
      label: "أهداف البطولة",
      value: String(tournament.totalGoals),
      numericValue: tournament.totalGoals,
      detail: `بمعدل ${tournament.avgGoalsPerMatch} هدف/مباراة منتهية`,
    },
    {
      label: "البطل",
      value: champ || "—",
      numericValue: null,
      detail: tournament.champion?.score
        ? `النهائي ${tournament.champion.score}${tournament.champion.penalties ? ` (${tournament.champion.penalties} ركلات)` : ""}`
        : "بانتظار حسم النهائي أو اكتمال بيانات المزوّد",
    },
  ];
}

export async function getWcNumbersReport(): Promise<WcNumbersReport> {
  return withSWR(
    "blocks:wc:numbers-report:v2",
    CACHE_TTL.MEDIUM,
    CACHE_TTL.MEDIUM * 2,
    async () => {
      const [sabq, tournament] = await Promise.all([
        buildSabqCoverage(),
        buildTournamentStats(),
      ]);

      const champName = tournament.champion?.team?.name;
      const headline = champName
        ? `كأس العالم 2026 بالأرقام — وتهنئة ${champName}`
        : "كأس العالم 2026 بالأرقام — تغطية سبق والبطولة";

      return {
        status: "draft" as const,
        generatedAt: new Date().toISOString(),
        headline,
        subtitle:
          "مسودة داخلية: عدّاد المواد مضيّق على مونديال 2026 فقط (wc26-* + تحريري رياضة منذ 2026) — راجع المنهجية قبل النشر.",
        sabq,
        tournament,
        platform: platformHighlights(),
        storyBeats: buildStoryBeats(sabq, tournament),
      };
    },
  );
}
