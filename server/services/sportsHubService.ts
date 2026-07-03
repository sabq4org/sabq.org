/**
 * خدمة هَب البطولات المجمّع (Sabq Sports 2.0) — payload واحد للتطبيقات.
 *
 * تُركّب: البطولات المرئية (سجلّ sports_tournaments) + المباريات القادمة/آخر
 * النتائج لكل بطولة + المتصدّر/الهدّاف عند توفّر الميزة + «مباشر الآن» عالميًا —
 * كل نداء مزوّد خلف كاش SWR القائم في saudiLeagueService (لا استهلاك إضافيًا
 * للخطة)، والتجميع نفسه خلف كاش قصير.
 */
import pLimit from "p-limit";
import { withSWR } from "../memoryCache";
import {
  getCompetition,
  getFixtures,
  getGlobalLiveFixtures,
  getStandings,
  getTopScorers,
  isSaudiLeagueConfigured,
  type SplFixture,
  type SplLiveBoardItem,
} from "./saudiLeagueService";
import {
  listVisibleTournaments,
  type PublicTournament,
  type TournamentSurface,
} from "./sportsTournamentsService";

const HUB_TTL = 30 * 1000;
const hubLimit = pLimit(3);

export interface HubTournamentPayload extends PublicTournament {
  live: SplFixture[];
  upcoming: SplFixture[];
  results: SplFixture[];
  leader: { teamId: number; name: string; logo: string; points: number } | null;
  topScorer: { id: number; name: string; team: string; goals: number } | null;
  lane: "now" | "saudi" | "world" | "regional" | "coming" | "archive";
  priorityScore: number;
  nextKickoffTs: number | null;
}

export interface SportsHubPayload {
  configured: boolean;
  generatedAt: string;
  tournaments: HubTournamentPayload[];
  liveNow: SplLiveBoardItem[];
  controlRoom: {
    primaryTournamentSlug: string | null;
    primaryMatchId: number | null;
    liveCount: number;
    activeCount: number;
    nextKickoffTs: number | null;
    headline: string;
    dek: string;
  };
  lanes: Array<{
    id: HubTournamentPayload["lane"];
    label: string;
    description: string;
    tournamentSlugs: string[];
  }>;
}

function laneFor(t: PublicTournament): HubTournamentPayload["lane"] {
  if (t.status === "finished") return "archive";
  if (t.status === "upcoming") return "coming";
  const comp = getCompetition(t.slug);
  if (t.kind === "anchor" || comp?.category === "saudi") return "saudi";
  if (comp?.category === "world" || comp?.category === "european") return "world";
  if (comp?.category === "gulf" || comp?.category === "arab") return "regional";
  return "world";
}

function nextKickoff(fixtures: SplFixture[]): number | null {
  const now = Math.floor(Date.now() / 1000);
  return fixtures
    .filter((f) => !f.status.live && !f.status.finished && f.timestamp >= now - 3 * 3600)
    .map((f) => f.timestamp)
    .sort((a, b) => a - b)[0] ?? null;
}

function priorityFor(
  t: PublicTournament,
  lane: HubTournamentPayload["lane"],
  live: SplFixture[],
  upcoming: SplFixture[],
  results: SplFixture[],
): number {
  let score = 0;
  if (t.kind === "anchor") score += 30;
  if (t.featured) score += 20;
  if (t.status === "active") score += 16;
  if (t.status === "upcoming") score += 6;
  score += live.length * 45;
  score += Math.min(upcoming.length, 3) * 8;
  score += Math.min(results.length, 2) * 4;
  if (lane === "saudi") score += 8;
  if (lane === "world") score += 6;
  return score;
}

async function enrichTournament(t: PublicTournament): Promise<HubTournamentPayload> {
  const base: HubTournamentPayload = {
    ...t,
    live: [],
    upcoming: [],
    results: [],
    leader: null,
    topScorer: null,
    lane: laneFor(t),
    priorityScore: 0,
    nextKickoffTs: null,
  };

  // بطولات الجزر غير المسجّلة لدى الخدمة (مثل كأس آسيا) تُعاد بهويتها فقط.
  const comp = getCompetition(t.slug);
  if (!comp || !isSaudiLeagueConfigured()) {
    base.priorityScore = priorityFor(t, base.lane, base.live, base.upcoming, base.results);
    return base;
  }

  const now = Math.floor(Date.now() / 1000);

  const [fixtures, standings, scorers] = await Promise.all([
    getFixtures(comp).catch(() => [] as SplFixture[]),
    t.features?.standings
      ? getStandings(comp).catch(() => [] as any[])
      : Promise.resolve([] as any[]),
    t.features?.scorers
      ? getTopScorers(comp).catch(() => [] as any[])
      : Promise.resolve([] as any[]),
  ]);

  base.live = fixtures.filter((f) => f.status.live);
  base.upcoming = fixtures
    .filter((f) => !f.status.live && !f.status.finished && f.timestamp >= now - 3 * 3600)
    .slice(0, 5);
  base.results = fixtures
    .filter((f) => f.status.finished)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 3);
  base.nextKickoffTs = nextKickoff([...base.live, ...base.upcoming]);

  const leaderRow: any = Array.isArray(standings) ? standings[0] : null;
  if (leaderRow?.team) {
    base.leader = {
      teamId: leaderRow.team.id,
      name: leaderRow.team.name,
      logo: leaderRow.team.logo,
      points: leaderRow.points,
    };
  }

  const scorerRow: any = Array.isArray(scorers) ? scorers[0] : null;
  if (scorerRow) {
    base.topScorer = {
      id: scorerRow.id,
      name: scorerRow.name,
      team: scorerRow.team?.name ?? "",
      goals: scorerRow.goals,
    };
  }

  base.priorityScore = priorityFor(t, base.lane, base.live, base.upcoming, base.results);

  return base;
}

function buildLanes(tournaments: HubTournamentPayload[]): SportsHubPayload["lanes"] {
  const definitions: Array<Omit<SportsHubPayload["lanes"][number], "tournamentSlugs">> = [
    { id: "now", label: "الآن", description: "بطولات فيها مباريات جارية أو لحظة ساخنة." },
    { id: "saudi", label: "المحلي", description: "روشن والبطولات السعودية أولًا." },
    { id: "world", label: "العالمي", description: "المونديال والبطولات الكبرى حول العالم." },
    { id: "regional", label: "الخليجي والآسيوي", description: "بطولات المنطقة ومشاركات المنتخبات والأندية." },
    { id: "coming", label: "القادم", description: "بطولات تستعد للظهور عند بداية موسمها." },
    { id: "archive", label: "اكتملت", description: "بطولات انتهت وتبقى كمرجع للنتائج." },
  ];
  return definitions
    .map((lane) => ({
      ...lane,
      tournamentSlugs: tournaments
        .filter((t) => (lane.id === "now" ? t.live.length > 0 : t.lane === lane.id))
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .map((t) => t.slug),
    }))
    .filter((lane) => lane.tournamentSlugs.length > 0);
}

function buildControlRoom(
  tournaments: HubTournamentPayload[],
  liveNow: SplLiveBoardItem[],
): SportsHubPayload["controlRoom"] {
  const sorted = [...tournaments].sort((a, b) => b.priorityScore - a.priorityScore);
  const primaryTournament = sorted[0] ?? null;
  const tournamentMatch =
    primaryTournament?.live[0] ??
    primaryTournament?.upcoming[0] ??
    primaryTournament?.results[0] ??
    null;
  const primaryMatch = liveNow[0] ?? tournamentMatch;
  const allNext = tournaments
    .map((t) => t.nextKickoffTs)
    .filter((ts): ts is number => typeof ts === "number")
    .sort((a, b) => a - b);
  const activeCount = tournaments.filter((t) => t.status === "active").length;

  if (liveNow.length > 0) {
    return {
      primaryTournamentSlug: primaryTournament?.slug ?? liveNow[0].competitionSlug,
      primaryMatchId: liveNow[0].id,
      liveCount: liveNow.length,
      activeCount,
      nextKickoffTs: allNext[0] ?? null,
      headline: "الملعب مفتوح الآن",
      dek: "ابدأ من المباراة الجارية ثم انتقل مباشرة إلى بوابة البطولة المرتبطة بها.",
    };
  }

  if (primaryTournament) {
    return {
      primaryTournamentSlug: primaryTournament.slug,
      primaryMatchId: primaryMatch?.id ?? null,
      liveCount: 0,
      activeCount,
      nextKickoffTs: allNext[0] ?? null,
      headline: `${primaryTournament.shortName || primaryTournament.name} في الواجهة`,
      dek: "سبق ترتّب البطولات حسب سخونة اللحظة: حالة الموسم، المباريات القريبة، والملفات التحريرية.",
    };
  }

  return {
    primaryTournamentSlug: null,
    primaryMatchId: null,
    liveCount: 0,
    activeCount: 0,
    nextKickoffTs: null,
    headline: "غرفة المتابعة جاهزة",
    dek: "فعّل البطولات من الداشبورد لتظهر هنا كبوابات متابعة حيّة.",
  };
}

/** الهب المجمّع لسطحٍ ما — طلب واحد يكفي التطبيق لرسم شاشة الرياضة. */
export async function getSportsHub(surface: TournamentSurface): Promise<SportsHubPayload> {
  return withSWR(`sports:hub:${surface}`, HUB_TTL, HUB_TTL * 2, async () => {
    const tournaments = await listVisibleTournaments(surface);
    const configured = isSaudiLeagueConfigured();

    const [enriched, liveNow] = await Promise.all([
      Promise.all(tournaments.map((t) => hubLimit(() => enrichTournament(t)))),
      configured
        ? getGlobalLiveFixtures().catch(() => [] as SplLiveBoardItem[])
        : Promise.resolve([] as SplLiveBoardItem[]),
    ]);

    const sortedTournaments = [...enriched].sort((a, b) => b.priorityScore - a.priorityScore);

    return {
      configured,
      generatedAt: new Date().toISOString(),
      tournaments: sortedTournaments,
      liveNow,
      controlRoom: buildControlRoom(sortedTournaments, liveNow),
      lanes: buildLanes(sortedTournaments),
    };
  });
}
