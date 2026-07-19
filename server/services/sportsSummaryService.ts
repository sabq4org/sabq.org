/**
 * موجز البطولات الموحّد — يغذّي رفّ «موجز البطولات» في البوابة الرياضية /sports.
 *
 * يجمّع لكل بطولة لقطة خفيفة تُلخّصها في بطاقة واحدة حسب حالتها:
 *   - جارية  → المتصدّر + الهدّاف الأول + مباريات اليوم/الجولة + المباراة القادمة.
 *   - قادمة  → عدّاد بدء الموسم + حامل اللقب (النسخة السابقة) + الافتتاحية.
 *   - منتهية → بطل + هدّاف الموسم المنتهي نفسه (لا الموسم الذي قبله).
 *
 * أداء (2026-07-19): عدّاد اليوم/المباشر من لوحات getGlobalToday/Live مرّة واحدة
 * بدل getFixtures لكل بطولة (كان يزاحم حدّ API-Football ويُبطّئ today/live).
 * ملتزم بـ ADR-001 (لا db).
 */
import pLimit from "p-limit";
import { withSWR } from "../memoryCache";
import {
  SAUDI_COMPETITIONS,
  getCompetitionHistory,
  getFixtures,
  getGlobalLiveFixtures,
  getGlobalTodayFixtures,
  getStandings,
  getTopScorers,
  isSaudiLeagueConfigured,
  listCompetitionsWithMeta,
  type CompetitionCategory,
  type CompetitionStatus,
  type SaudiCompetition,
  type SplFixture,
  type SplLiveBoardItem,
} from "./saudiLeagueService";

const RIYADH_TZ = "Asia/Riyadh";
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: RIYADH_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const riyadhDayKey = (ts: number): string => dayKeyFmt.format(new Date(ts * 1000));

interface SummaryTeam {
  name: string;
  logo: string;
}

interface SummaryNextMatch {
  id: number;
  timestamp: number;
  round: string | null;
  home: SummaryTeam;
  away: SummaryTeam;
}

export interface SpCompetitionSummary {
  slug: string;
  name: string;
  category: CompetitionCategory;
  type: "league" | "cup";
  logo: string | null;
  season: number | null;
  status: CompetitionStatus;
  hasStandings: boolean;
  hasScorers: boolean;
  /** متصدّر الترتيب (للبطولات الجارية ذات الجدول). */
  leader: { id: number; name: string; logo: string; points: number } | null;
  /** الهدّاف الأول (جارية) أو هدّاف الموسم المنتهي (منتهية). */
  topScorer: { id: number; name: string; goals: number } | null;
  /** حامل اللقب/البطل (قادمة أو منتهية). */
  champion: { id: number; name: string; logo: string } | null;
  /** أيام متبقّية حتى انطلاق الموسم (قادمة فقط). */
  daysUntilKickoff: number | null;
  /** عدد المباريات الجارية الآن في البطولة. */
  liveCount: number;
  /** عدد مباريات اليوم في البطولة. */
  todayCount: number;
  /** اسم الجولة الحالية/القادمة. */
  matchday: string | null;
  /** أقرب مباراة (جارية أو قادمة) — لفتح نافذة المباراة مباشرة. */
  nextMatch: SummaryNextMatch | null;
}

const teamOf = (t: SplFixture["home"]): SummaryTeam => ({ name: t.name, logo: t.logo });
const toNextMatch = (f: Pick<SplFixture, "id" | "timestamp" | "round" | "home" | "away">): SummaryNextMatch => ({
  id: f.id,
  timestamp: f.timestamp,
  round: f.round || null,
  home: teamOf(f.home),
  away: teamOf(f.away),
});

type BoardIndex = {
  liveBySlug: Map<string, SplLiveBoardItem[]>;
  todayBySlug: Map<string, SplLiveBoardItem[]>;
};

function indexBoard(items: SplLiveBoardItem[]): Map<string, SplLiveBoardItem[]> {
  const map = new Map<string, SplLiveBoardItem[]>();
  for (const item of items) {
    const slug = item.competitionSlug;
    if (!slug) continue;
    const list = map.get(slug);
    if (list) list.push(item);
    else map.set(slug, [item]);
  }
  return map;
}

/** يبني لقطة بطولة واحدة حسب حالتها، بأقل عدد نداءات (كلها مخزّنة + أفضل جهد). */
async function summarizeCompetition(
  comp: SaudiCompetition,
  meta: { logo: string | null; season: number | null; status: CompetitionStatus },
  boards: BoardIndex,
): Promise<SpCompetitionSummary> {
  const now = Date.now();
  const base: SpCompetitionSummary = {
    slug: comp.slug,
    name: comp.name,
    category: comp.category,
    type: comp.type,
    logo: meta.logo,
    season: meta.season,
    status: meta.status,
    hasStandings: comp.hasStandings,
    hasScorers: comp.hasScorers,
    leader: null,
    topScorer: null,
    champion: null,
    daysUntilKickoff: null,
    liveCount: 0,
    todayCount: 0,
    matchday: null,
    nextMatch: null,
  };

  // منتهية: البطل والهدّاف من **الموسم المنتهي نفسه** (meta.season) لا الموسم الذي قبله.
  if (meta.status === "finished") {
    const [standings, scorers] = await Promise.all([
      comp.hasStandings ? getStandings(comp, meta.season ?? undefined).catch(() => []) : Promise.resolve([]),
      comp.hasScorers ? getTopScorers(comp, meta.season ?? undefined).catch(() => []) : Promise.resolve([]),
    ]);
    const top = standings[0];
    if (top) {
      base.champion = { id: top.team.id, name: top.team.name, logo: top.team.logo };
    } else if (!comp.hasStandings) {
      const history = await getCompetitionHistory(comp, meta.season ?? undefined).catch(() => null);
      if (history?.champion) base.champion = history.champion;
    }
    const scorer = scorers[0];
    if (scorer) base.topScorer = { id: scorer.id, name: scorer.name, goals: scorer.goals };
    return base;
  }

  // عدّاد اليوم/المباشر من اللوحات الموحّدة (نداء AF واحد مشترك) — لا جدول موسم كامل.
  const boardLive = boards.liveBySlug.get(comp.slug) ?? [];
  const boardToday = boards.todayBySlug.get(comp.slug) ?? [];
  base.liveCount = boardLive.length;
  base.todayCount = boardToday.length;

  const boardAnchor = boardLive[0] ?? boardToday.find((f) => !f.status.finished) ?? boardToday[0] ?? null;
  if (boardAnchor) {
    base.nextMatch = toNextMatch(boardAnchor);
    base.matchday = boardAnchor.round || null;
  }

  // ودّيات: جدول المزوّد عالمي وضخم — يكفي اللوحة لبطاقة الموجز.
  const skipSeasonFixtures = comp.slug === "club-friendlies";

  // جدول الموسم فقط إن احتجنا مباراة قادمة خارج لوحة اليوم (أو بطولة قادمة بلا مرساة).
  let upcoming: SplFixture[] = [];
  if (!skipSeasonFixtures && (!boardAnchor || meta.status === "upcoming")) {
    const fixtures = await getFixtures(comp).catch(() => [] as SplFixture[]);
    const todayKey = riyadhDayKey(Math.floor(now / 1000));
    // إن غابت اللوحة (كاش بارد جزئي) نعبّئ العدّاد من الجدول المخزّن.
    if (!boardLive.length && !boardToday.length) {
      const live = fixtures.filter((f) => f.status.live);
      const today = fixtures.filter((f) => !f.status.live && riyadhDayKey(f.timestamp) === todayKey);
      base.liveCount = live.length;
      base.todayCount = today.length + live.length;
      const anchor = live[0] ?? today[0] ?? null;
      if (anchor) {
        base.nextMatch = toNextMatch(anchor);
        base.matchday = anchor.round || null;
      }
    }
    upcoming = fixtures
      .filter((f) => !f.status.finished && !f.status.live && f.timestamp * 1000 >= now - 3 * 3_600_000)
      .sort((a, b) => a.timestamp - b.timestamp);
    if (!base.nextMatch && upcoming[0]) {
      base.nextMatch = toNextMatch(upcoming[0]);
      base.matchday = upcoming[0].round || null;
    }
  }

  if (meta.status === "upcoming") {
    const next = upcoming[0] ?? null;
    if (next) base.daysUntilKickoff = Math.max(0, Math.ceil((next.timestamp * 1000 - now) / 86_400_000));
    const history = await getCompetitionHistory(comp).catch(() => null);
    if (history?.champion) base.champion = history.champion;
    return base;
  }

  const [standings, scorers] = await Promise.all([
    comp.hasStandings ? getStandings(comp).catch(() => []) : Promise.resolve([]),
    comp.hasScorers ? getTopScorers(comp).catch(() => []) : Promise.resolve([]),
  ]);
  const top = standings[0];
  if (top) base.leader = { id: top.team.id, name: top.team.name, logo: top.team.logo, points: top.points };
  const scorer = scorers[0];
  if (scorer) base.topScorer = { id: scorer.id, name: scorer.name, goals: scorer.goals };

  return base;
}

/**
 * موجز كل البطولات في لقطة واحدة. مخزَّن SWR (دقيقتان طازج / خمس بائت).
 * اللوحات تُجلب مرّة ثم تُوزَّع؛ تزامن 4 تحت حدّ المزوّد.
 */
export async function getSportsSummary(): Promise<SpCompetitionSummary[]> {
  return withSWR("spl:summary:v4", 2 * 60_000, 5 * 60_000, async () => {
    const [metaList, todayBoard, liveBoard] = await Promise.all([
      listCompetitionsWithMeta(),
      getGlobalTodayFixtures().catch(() => [] as SplLiveBoardItem[]),
      getGlobalLiveFixtures().catch(() => [] as SplLiveBoardItem[]),
    ]);
    const boards: BoardIndex = {
      liveBySlug: indexBoard(liveBoard),
      todayBySlug: indexBoard(todayBoard),
    };
    const metaBySlug = new Map(metaList.map((m) => [m.slug, m]));
    const limit = pLimit(4);
    const rows = await Promise.all(
      SAUDI_COMPETITIONS.map((comp) =>
        limit(() =>
          summarizeCompetition(
            comp,
            {
              logo: metaBySlug.get(comp.slug)?.logo ?? null,
              season: metaBySlug.get(comp.slug)?.season ?? null,
              status: metaBySlug.get(comp.slug)?.status ?? "unknown",
            },
            boards,
          ).catch(() => null),
        ),
      ),
    );
    return rows.filter((r): r is SpCompetitionSummary => r !== null);
  });
}

/** تسخين كاش الموجز بعد الإقلاع — لا يدفع أول زائر كلفة المسار البارد. */
let summaryWarmerStarted = false;
export function startSportsSummaryWarmer(): void {
  if (summaryWarmerStarted || !isSaudiLeagueConfigured()) return;
  summaryWarmerStarted = true;
  const warm = () => {
    void getSportsSummary().catch((err) =>
      console.warn("[SportsSummary] فشل تسخين الموجز:", (err as Error)?.message),
    );
  };
  setTimeout(warm, 45_000).unref();
  setInterval(warm, 90_000).unref();
}
