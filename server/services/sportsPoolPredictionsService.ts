/**
 * Sabq Sports — generalized tiered shared-pool predictions engine.
 *
 * The Gulf Cup 27 pari-mutuel model, made competition-agnostic. Every fixture
 * funds a 1000-point pool (+ any jackpot carried within the SAME competition),
 * split 50/30/20 across exact / margin / outcome tiers and shared equally among
 * each tier's winners. Reversed scorelines never win (scored by the SIGN of
 * home-away). Untaken tiers + integer remainders roll over to the next match in
 * that competition. Winners' shares are credited to their loyalty wallet.
 *
 * Fixtures are NOT stored as a seed — they come from API-Football via
 * saudiLeagueService (today/tomorrow board + per-fixture detail at settlement).
 * Model probabilities are frozen at submit time from getFixturePrediction with
 * a neutral home-advantage fallback. The pure scoring math is reused verbatim
 * from gulfCupPredictionScoring (scoreTier / distributePool / shareForTier).
 *
 * ADR-001: this service owns every Drizzle query; the route module never
 * imports db.
 */
import { and, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "../db";
import {
  sportsPoolPredictions,
  sportsPoolMatches,
  sportsPoolLong,
  sportsPoolBadges,
  sportsPoolMatchPicks,
  sportsPoolPlayerPicks,
  notificationsInbox,
  users,
  userPointsTotal,
} from "@shared/schema";
import {
  getGlobalTodayFixtures,
  getMatchDetail,
  getFixturePrediction,
  getCompetition,
  getFixtures,
  getStandings,
  type SplLiveBoardItem,
} from "./saudiLeagueService";
import { getFixtures as getWorldCupFixtures } from "./worldCupService";
import {
  scoreTier,
  distributePool,
  shareForTier,
  type GcTier,
} from "./gulfCupPredictionScoring";
import { awardPoints } from "./loyalty";
import {
  LOYALTY_ACTIONS,
  tierMultiplierForPoints,
} from "@shared/loyalty";
import {
  ensureMatchPickRow,
  settlePlayerPickMatches,
  lockMatchPicksIfDue,
} from "./sportsPoolPlayerPicksService";
import { creditWeeklyPoints } from "./sportsPoolDivisionsService";

// ---------------------------------------------------------------------------
// Tunables + small helpers
// ---------------------------------------------------------------------------

const POOL_BASE = 1000;

/**
 * ملفات بطولات تخالف الافتراضي — كأس الملك بمواصفات محرّك المونديال حرفيًا
 * (طلب المالك 2026-07-04): جائزة 500 لكل مباراة، طبقة «النتيجة بالضبط» وحدها
 * تقتسمها بالتساوي (لا نصيب للفارق/الاتجاه)، وبلا ترحيل جاكبوت (الفائض يسقط
 * كما في wcPredictionsService — floor(500/عدد المصيبين)).
 */
const COMP_POOL_PROFILES: Record<string, { base: number; exactOnly: boolean; noCarry: boolean }> = {
  "kings-cup": { base: 500, exactOnly: true, noCarry: true },
};

function poolProfileFor(slug: string | null | undefined) {
  return slug ? COMP_POOL_PROFILES[slug] : undefined;
}

function poolBaseFor(slug: string | null | undefined): number {
  return poolProfileFor(slug)?.base ?? POOL_BASE;
}
const LONG_POOL = { champion: 5000, top_scorer: 5000 } as const;

/** Feature flag — keep the contest dark until an explicit deploy decision. */
export function isSportsPredictionsEnabled(): boolean {
  return process.env.SPORTS_PREDICTIONS_ENABLED === "true";
}

const nowSec = (): number => Math.floor(Date.now() / 1000);

/** Riyadh-local YYYY-MM-DD for an offset in days (board fetch is Riyadh-based). */
function riyadhDateKey(offsetDays = 0): string {
  return new Date(Date.now() + (3 * 60 * 60 + offsetDays * 24 * 60 * 60) * 1000)
    .toISOString()
    .slice(0, 10);
}

/** A board fixture is predictable when both teams are known and it hasn't begun. */
function isPredictable(fx: SplLiveBoardItem): boolean {
  return fx.home.id > 0 && fx.away.id > 0 && !fx.status.live && !fx.status.finished
    && fx.timestamp > nowSec();
}

// Only these competitions are offered for prediction: World Cup, AFC, Gulf Cup
// 27, and every Saudi competition. European / other world leagues are NOT
// predictable — keep this in sync with the iOS long-prediction whitelist.
const PREDICTION_COMP_SLUGS = new Set(["world-cup", "afc-champions-league", "gulf-cup"]);

function isPredictionComp(slug: string | null | undefined): boolean {
  if (!slug) return false;
  if (PREDICTION_COMP_SLUGS.has(slug)) return true;
  return getCompetition(slug)?.category === "saudi";
}

// Matches open for prediction only within this window before kickoff (48h).
const PREDICTION_WINDOW_SEC = 48 * 60 * 60;

const probOfPick = (
  predHome: number,
  predAway: number,
  p: { home: number; draw: number; away: number },
): number => (predHome > predAway ? p.home : predHome < predAway ? p.away : p.draw);

// مونديال 2026 (48 منتخبًا) يبدأ خروج المغلوب بـ«دور الـ32». المزوّد قد يُذيّل
// الاسم برقم ("Round of 16 - 1") فنطابق بالبادئة لا بالمساواة فقط.
const WC_KNOCKOUT_ROUND_PREFIXES = [
  "Round of 32",
  "Round of 16",
  "Quarter-finals",
  "Semi-finals",
  "3rd Place Final",
  "Final",
];

function isWorldCupKnockoutRound(round: string | null | undefined): boolean {
  const r = (round ?? "").trim();
  return WC_KNOCKOUT_ROUND_PREFIXES.some((prefix) => r === prefix || r.startsWith(prefix));
}

async function isWorldCupKnockoutFixture(fixtureId: number, competitionSlug: string | null | undefined): Promise<boolean> {
  if (competitionSlug !== "world-cup") return false;
  try {
    const fixture = (await getWorldCupFixtures()).find((fx) => fx.id === fixtureId);
    return fixture ? isWorldCupKnockoutRound(fixture.roundEn) : false;
  } catch {
    return false;
  }
}

export type SpModelProbs = { home: number; draw: number; away: number };

/** Frozen probabilities for a fixture (API-Football), neutral home-tilt fallback. */
async function probsForFixture(fixtureId: number): Promise<SpModelProbs> {
  try {
    const p = await getFixturePrediction(fixtureId);
    if (p && p.homePct + p.drawPct + p.awayPct > 0) {
      // Normalize to whole percents summing 100 (provider rounds independently).
      const total = p.homePct + p.drawPct + p.awayPct;
      const home = Math.round((p.homePct / total) * 100);
      const draw = Math.round((p.drawPct / total) * 100);
      const away = 100 - home - draw;
      return { home, draw, away: Math.max(0, away) };
    }
  } catch {
    /* best-effort — fall through to neutral */
  }
  return { home: 40, draw: 27, away: 33 };
}

// ---------------------------------------------------------------------------
// Output DTOs (mirror the iOS Sp* models)
// ---------------------------------------------------------------------------

export type SpCrowd = { home: number; draw: number; away: number; total: number };

export type SpMyPoolPrediction = {
  predHome: number;
  predAway: number;
  status: string;
  tier: GcTier;
  outcomeHit: boolean;
  marginHit: boolean;
  exactHit: boolean;
  pointsAwarded: number;
};

export type SpMatchSettlement = {
  status: string;
  finalHome: number | null;
  finalAway: number | null;
  predictionsCount: number;
  exactWinners: number;
  marginWinners: number;
  outcomeWinners: number;
  poolBase: number;
  poolCarryIn: number;
  carryOut: number;
};

export type SpFixtureLite = {
  id: number;
  timestamp: number;
  competition: string | null;
  competitionSlug: string | null;
  status: { code: string; label: string; live: boolean; finished: boolean };
  home: { id: number; name: string; logo: string };
  away: { id: number; name: string; logo: string };
  goals: { home: number | null; away: number | null };
};

export type SpPredictableMatch = {
  fixture: SpFixtureLite;
  locked: boolean;
  probs: SpModelProbs;
  crowd: SpCrowd;
  predictionsCount: number;
  poolAvailable: number;
  myPrediction: SpMyPoolPrediction | null;
  settlement: SpMatchSettlement | null;
};

export type SpMeStats = {
  points: number;
  correct: number;
  exact: number;
  played: number;
  currentStreak: number;
  rank: number | null;
  badges: string[];
};

export type SpSubmitResult =
  | { ok: true; prediction: { predHome: number; predAway: number; status: string } }
  | { ok: false; reason: "LOCKED" | "INVALID" | "DRAW_NOT_ALLOWED" };

function liteFixture(fx: SplLiveBoardItem): SpFixtureLite {
  return {
    id: fx.id,
    timestamp: fx.timestamp,
    competition: fx.competition ?? null,
    competitionSlug: fx.competitionSlug ?? null,
    status: { code: fx.status.code, label: fx.status.label, live: fx.status.live, finished: fx.status.finished },
    home: { id: fx.home.id, name: fx.home.name, logo: fx.home.logo },
    away: { id: fx.away.id, name: fx.away.name, logo: fx.away.logo },
    goals: { home: fx.goals.home, away: fx.goals.away },
  };
}

function crowdFrom(cHome: number, cDraw: number, cAway: number): SpCrowd {
  const total = cHome + cDraw + cAway;
  if (total <= 0) return { home: 0, draw: 0, away: 0, total: 0 };
  return {
    home: Math.round((cHome / total) * 100),
    draw: Math.round((cDraw / total) * 100),
    away: Math.round((cAway / total) * 100),
    total,
  };
}

// ---------------------------------------------------------------------------
// Jackpot (carryOut of the last settled match in the SAME competition)
// ---------------------------------------------------------------------------

async function currentJackpot(competitionSlug: string | null): Promise<number> {
  const compCond = competitionSlug == null
    ? sql`${sportsPoolMatches.competitionSlug} is null`
    : eq(sportsPoolMatches.competitionSlug, competitionSlug);
  const [row] = await db
    .select({ carryOut: sportsPoolMatches.carryOut })
    .from(sportsPoolMatches)
    .where(and(eq(sportsPoolMatches.status, "settled"), compCond))
    .orderBy(desc(sportsPoolMatches.kickoffTs))
    .limit(1);
  return Number(row?.carryOut ?? 0);
}

/** Sum of every competition's current jackpot — flavour figure for the hero. */
async function totalJackpot(): Promise<number> {
  const rows = await db
    .select({
      slug: sportsPoolMatches.competitionSlug,
      carryOut: sportsPoolMatches.carryOut,
      kickoffTs: sportsPoolMatches.kickoffTs,
    })
    .from(sportsPoolMatches)
    .where(eq(sportsPoolMatches.status, "settled"))
    .orderBy(desc(sportsPoolMatches.kickoffTs));
  const seen = new Set<string>();
  let sum = 0;
  for (const r of rows) {
    const key = r.slug ?? "__null__";
    if (seen.has(key)) continue;
    seen.add(key);
    sum += Number(r.carryOut ?? 0);
  }
  return sum;
}

// ---------------------------------------------------------------------------
// Submit / update a prediction
// ---------------------------------------------------------------------------

export interface SpSubmitInput {
  fixtureId: number;
  kickoffTs: number;
  competitionSlug?: string | null;
  homeId?: number | null;
  awayId?: number | null;
  homeName: string;
  awayName: string;
  homeLogo?: string | null;
  awayLogo?: string | null;
  predHome: number;
  predAway: number;
}

export async function submitPrediction(
  userId: string,
  input: SpSubmitInput,
): Promise<SpSubmitResult> {
  const { predHome, predAway } = input;
  if (
    !Number.isInteger(predHome) || !Number.isInteger(predAway) ||
    predHome < 0 || predAway < 0 || predHome > 99 || predAway > 99
  ) {
    return { ok: false, reason: "INVALID" };
  }
  if (!input.homeName || !input.awayName || !Number.isFinite(input.kickoffTs) || input.kickoffTs <= 0) {
    return { ok: false, reason: "INVALID" };
  }
  if (input.kickoffTs <= nowSec()) return { ok: false, reason: "LOCKED" };
  if (predHome === predAway && await isWorldCupKnockoutFixture(input.fixtureId, input.competitionSlug)) {
    return { ok: false, reason: "DRAW_NOT_ALLOWED" };
  }

  const probs = await probsForFixture(input.fixtureId);

  await db
    .insert(sportsPoolMatches)
    .values({
      fixtureId: input.fixtureId,
      competitionSlug: input.competitionSlug ?? null,
      kickoffTs: input.kickoffTs,
      homeTeamId: input.homeId ?? 0,
      awayTeamId: input.awayId ?? 0,
      homeTeamName: input.homeName,
      homeTeamLogo: input.homeLogo ?? "",
      awayTeamName: input.awayName,
      awayTeamLogo: input.awayLogo ?? "",
      probHome: probs.home,
      probDraw: probs.draw,
      probAway: probs.away,
      poolBase: poolBaseFor(input.competitionSlug),
      status: "open",
    })
    .onConflictDoUpdate({
      target: sportsPoolMatches.fixtureId,
      set: {
        competitionSlug: input.competitionSlug ?? null,
        kickoffTs: input.kickoffTs,
        homeTeamId: input.homeId ?? 0,
        awayTeamId: input.awayId ?? 0,
        homeTeamName: input.homeName,
        homeTeamLogo: input.homeLogo ?? "",
        awayTeamName: input.awayName,
        awayTeamLogo: input.awayLogo ?? "",
        updatedAt: new Date(),
      },
    });

  // اضمن وجود صفّ بركة الهدافين للمباراة (upsert هادئ) — يُفتح التوقّع على
  // الهداف بمجرّد أن يتوقّع المستخدم النتيجة، دون انتظار نقله لشاشة الهدافين.
  await ensureMatchPickRow(input.fixtureId, input.kickoffTs, input.competitionSlug ?? null).catch((e) =>
    console.warn(`[SportsPool] ensureMatchPickRow failed for ${input.fixtureId}:`, e),
  );

  const pickProb = probOfPick(predHome, predAway, probs);
  const [row] = await db
    .insert(sportsPoolPredictions)
    .values({ fixtureId: input.fixtureId, userId, predHome, predAway, pickProb })
    .onConflictDoUpdate({
      target: [sportsPoolPredictions.fixtureId, sportsPoolPredictions.userId],
      set: { predHome, predAway, pickProb, updatedAt: new Date() },
    })
    .returning({
      predHome: sportsPoolPredictions.predHome,
      predAway: sportsPoolPredictions.predAway,
      status: sportsPoolPredictions.status,
    });

  return { ok: true, prediction: row };
}

// ---------------------------------------------------------------------------
// Per-user stats / streak / badges
// ---------------------------------------------------------------------------

async function computeCurrentStreak(userId: string): Promise<number> {
  const rows = await db
    .select({ outcomeHit: sportsPoolPredictions.outcomeHit })
    .from(sportsPoolPredictions)
    .innerJoin(sportsPoolMatches, eq(sportsPoolPredictions.fixtureId, sportsPoolMatches.fixtureId))
    .where(and(eq(sportsPoolPredictions.userId, userId), isNotNull(sportsPoolPredictions.settledAt)))
    .orderBy(desc(sportsPoolMatches.kickoffTs));
  let n = 0;
  for (const r of rows) {
    if (r.outcomeHit) n++;
    else break;
  }
  return n;
}

async function getMyBadgeCodes(userId: string): Promise<string[]> {
  const rows = await db
    .select({ badge: sportsPoolBadges.badge })
    .from(sportsPoolBadges)
    .where(eq(sportsPoolBadges.userId, userId));
  return rows.map((r) => r.badge);
}

async function getMyRank(userId: string): Promise<number | null> {
  const [mine] = await db
    .select({ points: sql<number>`coalesce(sum(${sportsPoolPredictions.pointsAwarded}), 0)::int` })
    .from(sportsPoolPredictions)
    .where(eq(sportsPoolPredictions.userId, userId));
  const myPoints = Number(mine?.points ?? 0);
  if (myPoints <= 0) return null;
  // One row per user strictly ahead of me — count them for the rank.
  const ahead = await db
    .select({ userId: sportsPoolPredictions.userId })
    .from(sportsPoolPredictions)
    .groupBy(sportsPoolPredictions.userId)
    .having(sql`coalesce(sum(${sportsPoolPredictions.pointsAwarded}), 0) > ${myPoints}`);
  return ahead.length + 1;
}

export async function getMeStats(userId: string): Promise<SpMeStats> {
  const [agg] = await db
    .select({
      points: sql<number>`coalesce(sum(${sportsPoolPredictions.pointsAwarded}), 0)::int`,
      correct: sql<number>`count(*) filter (where ${sportsPoolPredictions.outcomeHit})::int`,
      exact: sql<number>`count(*) filter (where ${sportsPoolPredictions.exactHit})::int`,
      played: sql<number>`count(*) filter (where ${sportsPoolPredictions.status} <> 'pending')::int`,
    })
    .from(sportsPoolPredictions)
    .where(eq(sportsPoolPredictions.userId, userId));
  return {
    points: Number(agg?.points ?? 0),
    correct: Number(agg?.correct ?? 0),
    exact: Number(agg?.exact ?? 0),
    played: Number(agg?.played ?? 0),
    currentStreak: await computeCurrentStreak(userId),
    rank: await getMyRank(userId),
    badges: await getMyBadgeCodes(userId),
  };
}

// ---------------------------------------------------------------------------
// Today's predictable matches (across all curated competitions)
// ---------------------------------------------------------------------------

export async function getUpcomingPredictableMatches(
  userId?: string,
): Promise<{ matches: SpPredictableMatch[]; me: SpMeStats | null; jackpot: number }> {
  // Matches open for prediction only within the next 48 hours, and only for our
  // prediction competitions (World Cup, AFC, Gulf Cup 27, Saudi). We pull three
  // day-boards so the 48h window is fully covered regardless of the time of day,
  // then cap by timestamp. As time passes the next fixtures roll into view.
  const [d0, d1, d2, jackpot] = await Promise.all([
    getGlobalTodayFixtures(riyadhDateKey(0)).catch(() => [] as SplLiveBoardItem[]),
    getGlobalTodayFixtures(riyadhDateKey(1)).catch(() => [] as SplLiveBoardItem[]),
    getGlobalTodayFixtures(riyadhDateKey(2)).catch(() => [] as SplLiveBoardItem[]),
    totalJackpot(),
  ]);

  const windowEnd = nowSec() + PREDICTION_WINDOW_SEC;
  const byId = new Map<number, SplLiveBoardItem>();
  for (const fx of [...d0, ...d1, ...d2]) {
    if (byId.has(fx.id)) continue;
    if (!isPredictable(fx)) continue;
    if (fx.timestamp > windowEnd) continue;          // within 48h only
    if (!isPredictionComp(fx.competitionSlug)) continue; // our competitions only
    byId.set(fx.id, fx);
  }
  const fixtures = [...byId.values()].sort((a, b) => a.timestamp - b.timestamp).slice(0, 40);

  if (fixtures.length === 0) {
    return { matches: [], me: userId ? await getMeStats(userId) : null, jackpot };
  }

  const ids = fixtures.map((f) => f.id);

  const [crowdRows, matchRows] = await Promise.all([
    db
      .select({
        fixtureId: sportsPoolPredictions.fixtureId,
        home: sql<number>`count(*) filter (where ${sportsPoolPredictions.predHome} > ${sportsPoolPredictions.predAway})::int`,
        draw: sql<number>`count(*) filter (where ${sportsPoolPredictions.predHome} = ${sportsPoolPredictions.predAway})::int`,
        away: sql<number>`count(*) filter (where ${sportsPoolPredictions.predHome} < ${sportsPoolPredictions.predAway})::int`,
      })
      .from(sportsPoolPredictions)
      .where(inArray(sportsPoolPredictions.fixtureId, ids))
      .groupBy(sportsPoolPredictions.fixtureId),
    db.select().from(sportsPoolMatches).where(inArray(sportsPoolMatches.fixtureId, ids)),
  ]);
  const crowdByFixture = new Map(crowdRows.map((r) => [r.fixtureId, r]));
  const matchByFixture = new Map(matchRows.map((m) => [m.fixtureId, m]));

  // Per-competition jackpot — fetched once per distinct slug present in the feed.
  const slugs = new Set<string | null>(fixtures.map((f) => f.competitionSlug ?? null));
  const jackpotBySlug = new Map<string | null, number>();
  await Promise.all(
    [...slugs].map(async (s) => jackpotBySlug.set(s, await currentJackpot(s))),
  );

  const myByFixture = new Map<number, SpMyPoolPrediction>();
  if (userId) {
    const mine = await db
      .select()
      .from(sportsPoolPredictions)
      .where(and(eq(sportsPoolPredictions.userId, userId), inArray(sportsPoolPredictions.fixtureId, ids)));
    for (const m of mine) {
      myByFixture.set(m.fixtureId, {
        predHome: m.predHome,
        predAway: m.predAway,
        status: m.status,
        tier: m.tier as GcTier,
        outcomeHit: m.outcomeHit,
        marginHit: m.marginHit,
        exactHit: m.exactHit,
        pointsAwarded: m.pointsAwarded,
      });
    }
  }

  // Probabilities: use the frozen snapshot when present, else fetch (best-effort).
  const matches: SpPredictableMatch[] = await Promise.all(
    fixtures.map(async (fixture) => {
      const snap = matchByFixture.get(fixture.id);
      const probs: SpModelProbs = snap
        ? { home: snap.probHome, draw: snap.probDraw, away: snap.probAway }
        : await probsForFixture(fixture.id);
      const c = crowdByFixture.get(fixture.id);
      const crowd = crowdFrom(Number(c?.home ?? 0), Number(c?.draw ?? 0), Number(c?.away ?? 0));
      const base = snap?.poolBase ?? poolBaseFor(fixture.competitionSlug);
      const compJackpot = jackpotBySlug.get(fixture.competitionSlug ?? null) ?? 0;
      const poolAvailable =
        snap?.status === "settled" ? base + Number(snap.poolCarryIn) : base + compJackpot;

      return {
        fixture: liteFixture(fixture),
        locked: fixture.timestamp <= nowSec() || fixture.status.live || fixture.status.finished,
        probs,
        crowd,
        predictionsCount: crowd.total,
        poolAvailable,
        myPrediction: myByFixture.get(fixture.id) ?? null,
        settlement: snap
          ? {
              status: snap.status,
              finalHome: snap.finalHome,
              finalAway: snap.finalAway,
              predictionsCount: snap.predictionsCount,
              exactWinners: snap.exactWinners,
              marginWinners: snap.marginWinners,
              outcomeWinners: snap.outcomeWinners,
              poolBase: snap.poolBase,
              poolCarryIn: snap.poolCarryIn,
              carryOut: snap.carryOut,
            }
          : null,
      };
    }),
  );

  return { matches, me: userId ? await getMeStats(userId) : null, jackpot };
}

// ---------------------------------------------------------------------------
// My predictions / match summary / leaderboard
// ---------------------------------------------------------------------------

export async function getMyPredictions(userId: string) {
  const rows = await db
    .select({
      fixtureId: sportsPoolPredictions.fixtureId,
      predHome: sportsPoolPredictions.predHome,
      predAway: sportsPoolPredictions.predAway,
      status: sportsPoolPredictions.status,
      tier: sportsPoolPredictions.tier,
      outcomeHit: sportsPoolPredictions.outcomeHit,
      marginHit: sportsPoolPredictions.marginHit,
      exactHit: sportsPoolPredictions.exactHit,
      pointsAwarded: sportsPoolPredictions.pointsAwarded,
      createdAt: sportsPoolPredictions.createdAt,
      kickoffTs: sportsPoolMatches.kickoffTs,
      competitionSlug: sportsPoolMatches.competitionSlug,
      homeTeamName: sportsPoolMatches.homeTeamName,
      homeTeamLogo: sportsPoolMatches.homeTeamLogo,
      awayTeamName: sportsPoolMatches.awayTeamName,
      awayTeamLogo: sportsPoolMatches.awayTeamLogo,
      finalHome: sportsPoolMatches.finalHome,
      finalAway: sportsPoolMatches.finalAway,
      matchStatus: sportsPoolMatches.status,
    })
    .from(sportsPoolPredictions)
    .leftJoin(sportsPoolMatches, eq(sportsPoolPredictions.fixtureId, sportsPoolMatches.fixtureId))
    .where(eq(sportsPoolPredictions.userId, userId))
    .orderBy(desc(sportsPoolMatches.kickoffTs));
  // Hide predictions made on competitions no longer offered (e.g. legacy world
  // leagues) — only our prediction competitions remain visible.
  return rows.filter((r) => isPredictionComp(r.competitionSlug));
}

export async function getMatchPredictionsSummary(
  fixtureId: number,
): Promise<SpMatchSettlement & { crowd: SpCrowd }> {
  const [snap] = await db.select().from(sportsPoolMatches).where(eq(sportsPoolMatches.fixtureId, fixtureId));
  const [c] = await db
    .select({
      home: sql<number>`count(*) filter (where ${sportsPoolPredictions.predHome} > ${sportsPoolPredictions.predAway})::int`,
      draw: sql<number>`count(*) filter (where ${sportsPoolPredictions.predHome} = ${sportsPoolPredictions.predAway})::int`,
      away: sql<number>`count(*) filter (where ${sportsPoolPredictions.predHome} < ${sportsPoolPredictions.predAway})::int`,
    })
    .from(sportsPoolPredictions)
    .where(eq(sportsPoolPredictions.fixtureId, fixtureId));
  const crowd = crowdFrom(Number(c?.home ?? 0), Number(c?.draw ?? 0), Number(c?.away ?? 0));
  return {
    status: snap?.status ?? "open",
    finalHome: snap?.finalHome ?? null,
    finalAway: snap?.finalAway ?? null,
    predictionsCount: crowd.total,
    exactWinners: snap?.exactWinners ?? 0,
    marginWinners: snap?.marginWinners ?? 0,
    outcomeWinners: snap?.outcomeWinners ?? 0,
    poolBase: snap?.poolBase ?? poolBaseFor(snap?.competitionSlug),
    poolCarryIn: snap?.poolCarryIn ?? 0,
    carryOut: snap?.carryOut ?? 0,
    crowd,
  };
}

export async function getLeaderboard(limit = 100) {
  const rows = await db
    .select({
      userId: sportsPoolPredictions.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      avatar: users.profileImageUrl,
      totalPoints: sql<number>`coalesce(sum(${sportsPoolPredictions.pointsAwarded}), 0)::int`,
      correctCount: sql<number>`count(*) filter (where ${sportsPoolPredictions.outcomeHit})::int`,
      exactCount: sql<number>`count(*) filter (where ${sportsPoolPredictions.exactHit})::int`,
      playedCount: sql<number>`count(*) filter (where ${sportsPoolPredictions.status} <> 'pending')::int`,
    })
    .from(sportsPoolPredictions)
    .innerJoin(users, eq(sportsPoolPredictions.userId, users.id))
    .groupBy(sportsPoolPredictions.userId, users.firstName, users.lastName, users.profileImageUrl)
    .having(sql`count(*) filter (where ${sportsPoolPredictions.status} <> 'pending') > 0`)
    .orderBy(
      desc(sql`coalesce(sum(${sportsPoolPredictions.pointsAwarded}), 0)`),
      desc(sql`count(*) filter (where ${sportsPoolPredictions.exactHit})`),
      desc(sql`count(*) filter (where ${sportsPoolPredictions.outcomeHit})`),
    )
    .limit(limit);

  return rows.map((r, i) => {
    const played = Number(r.playedCount);
    const correct = Number(r.correctCount);
    return {
      rank: i + 1,
      userId: r.userId,
      name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || "عضو سبق",
      avatar: r.avatar,
      totalPoints: Number(r.totalPoints),
      correctCount: correct,
      exactCount: Number(r.exactCount),
      playedCount: played,
      accuracy: played > 0 ? Math.round((correct / played) * 100) : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

/** Grants badges after a settlement (idempotent via onConflictDoNothing). */
async function awardBadges(userId: string): Promise<void> {
  const [agg] = await db
    .select({
      exact: sql<number>`count(*) filter (where ${sportsPoolPredictions.exactHit})::int`,
      played: sql<number>`count(*) filter (where ${sportsPoolPredictions.status} <> 'pending')::int`,
      lionheart: sql<number>`count(*) filter (where ${sportsPoolPredictions.outcomeHit} and ${sportsPoolPredictions.pickProb} > 0 and ${sportsPoolPredictions.pickProb} < 10)::int`,
    })
    .from(sportsPoolPredictions)
    .where(eq(sportsPoolPredictions.userId, userId));

  const streak = await computeCurrentStreak(userId);
  const toAward: { badge: string; metadata: Record<string, any> }[] = [];
  if (Number(agg?.exact ?? 0) >= 5) toAward.push({ badge: "nostradamus", metadata: { exact: Number(agg.exact) } });
  if (Number(agg?.lionheart ?? 0) >= 1) toAward.push({ badge: "lionheart", metadata: {} });
  if (streak >= 3) toAward.push({ badge: "hot_streak", metadata: { streak } });
  if (Number(agg?.played ?? 0) >= 25) toAward.push({ badge: "marathoner", metadata: { played: Number(agg.played) } });

  for (const b of toAward) {
    await db.insert(sportsPoolBadges).values({ userId, badge: b.badge, metadata: b.metadata }).onConflictDoNothing();
  }
}

async function notifyWin(
  userId: string,
  points: number,
  homeName: string,
  awayName: string,
  fixtureId: number,
  tier: GcTier,
): Promise<void> {
  const tierAr =
    tier === "exact" ? "النتيجة الدقيقة 🎯" : tier === "margin" ? "الفارق الصحيح 📏" : "النتيجة الصحيحة ✅";
  try {
    await db.insert(notificationsInbox).values({
      userId,
      type: "SPORTS_PREDICTION_WIN",
      title: "🎉 توقّعك صحيح!",
      body: `أصبت ${tierAr} في مباراة ${homeName} و${awayName} وربحت ${points} نقطة.`,
      deeplink: "sabqsports://predictions",
      metadata: { fixtureId: String(fixtureId), points, tier },
    });
  } catch (err) {
    console.warn(`[SportsPool] notify failed for ${userId}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Settlement engine — driven by the predicted-matches table, run by the cron
// ---------------------------------------------------------------------------

export type SpSettlementSummary = { settled: number; awarded: number; errors: number };

/**
 * Settles finished predicted matches: scores each prediction's tier, distributes
 * the pool (base + the competition's carried jackpot) equally within each tier,
 * and rolls the unpaid remainder forward as the next match's jackpot. Idempotent
 * via the settledAt anchor + the pending guard + loyalty dedup.
 */
export async function settleFinishedMatches(maxFixtures = 40): Promise<SpSettlementSummary> {
  const cutoff = nowSec() - 100 * 60; // ≥100 min since kickoff (match-end safety window)
  const due = await db
    .select({
      fixtureId: sportsPoolMatches.fixtureId,
      competitionSlug: sportsPoolMatches.competitionSlug,
      kickoffTs: sportsPoolMatches.kickoffTs,
      homeTeamName: sportsPoolMatches.homeTeamName,
      awayTeamName: sportsPoolMatches.awayTeamName,
    })
    .from(sportsPoolMatches)
    .where(and(sql`${sportsPoolMatches.settledAt} is null`, lt(sportsPoolMatches.kickoffTs, cutoff)))
    .orderBy(sportsPoolMatches.kickoffTs)
    .limit(maxFixtures);

  let settled = 0;
  let awarded = 0;
  let errors = 0;

  for (const m of due) {
    try {
      const detail = await getMatchDetail(m.fixtureId);
      if (!detail || !detail.fixture.status.finished) continue;
      const finalHome = detail.fixture.goals.home;
      const finalAway = detail.fixture.goals.away;
      if (finalHome == null || finalAway == null) continue;

      const compCond = m.competitionSlug == null
        ? sql`${sportsPoolMatches.competitionSlug} is null`
        : eq(sportsPoolMatches.competitionSlug, m.competitionSlug);

      const payouts = await db.transaction(async (tx) => {
        const [locked] = await tx
          .select({ settledAt: sportsPoolMatches.settledAt })
          .from(sportsPoolMatches)
          .where(eq(sportsPoolMatches.fixtureId, m.fixtureId))
          .for("update");
        if (locked?.settledAt != null) return null; // lost the race

        // Jackpot carried in = carryOut of the previous settled match in this competition.
        const [prev] = await tx
          .select({ carryOut: sportsPoolMatches.carryOut })
          .from(sportsPoolMatches)
          .where(and(eq(sportsPoolMatches.status, "settled"), compCond, lt(sportsPoolMatches.kickoffTs, m.kickoffTs)))
          .orderBy(desc(sportsPoolMatches.kickoffTs))
          .limit(1);
        const carryIn = Number(prev?.carryOut ?? 0);
        const now = new Date();

        const preds = await tx
          .select({
            userId: sportsPoolPredictions.userId,
            predHome: sportsPoolPredictions.predHome,
            predAway: sportsPoolPredictions.predAway,
          })
          .from(sportsPoolPredictions)
          .where(and(eq(sportsPoolPredictions.fixtureId, m.fixtureId), eq(sportsPoolPredictions.status, "pending")));

        const scored = preds.map((p) => ({ ...p, ...scoreTier(p.predHome, p.predAway, finalHome, finalAway) }));
        const winners = {
          exact: scored.filter((s) => s.tier === "exact").length,
          margin: scored.filter((s) => s.tier === "margin").length,
          outcome: scored.filter((s) => s.tier === "outcome").length,
        };

        const profile = poolProfileFor(m.competitionSlug);
        const available = (profile?.base ?? POOL_BASE) + (profile?.noCarry ? 0 : carryIn);
        const noPreds = scored.length === 0;
        const dist = noPreds
          ? { shareExact: 0, shareMargin: 0, shareOutcome: 0, paidExact: 0, paidMargin: 0, paidOutcome: 0, carryOut: profile?.noCarry ? 0 : carryIn }
          : profile?.exactOnly
            ? (() => {
                // نمط المونديال: الدقيقة فقط تقتسم بالتساوي، والفائض/غياب المصيب يسقط
                const n = winners.exact;
                const share = n > 0 ? Math.max(1, Math.floor(available / n)) : 0;
                return {
                  shareExact: share, shareMargin: 0, shareOutcome: 0,
                  paidExact: share * n, paidMargin: 0, paidOutcome: 0,
                  carryOut: profile.noCarry ? 0 : available - share * n,
                };
              })()
            : distributePool(available, winners);

        const wins: { userId: string; points: number; tier: GcTier }[] = [];
        for (const s of scored) {
          const points = shareForTier(dist, s.tier);
          await tx
            .update(sportsPoolPredictions)
            .set({
              status: s.outcomeHit ? "correct" : "incorrect",
              tier: s.tier,
              outcomeHit: s.outcomeHit,
              marginHit: s.marginHit,
              exactHit: s.exactHit,
              pointsAwarded: points,
              settledAt: now,
              updatedAt: now,
            })
            .where(and(
              eq(sportsPoolPredictions.fixtureId, m.fixtureId),
              eq(sportsPoolPredictions.userId, s.userId),
              eq(sportsPoolPredictions.status, "pending"),
            ));
          if (points > 0) wins.push({ userId: s.userId, points, tier: s.tier });
        }

        await tx
          .update(sportsPoolMatches)
          .set({
            status: "settled",
            finalHome,
            finalAway,
            poolCarryIn: carryIn,
            paidExact: dist.paidExact,
            paidMargin: dist.paidMargin,
            paidOutcome: dist.paidOutcome,
            carryOut: dist.carryOut,
            predictionsCount: scored.length,
            exactWinners: winners.exact,
            marginWinners: winners.margin,
            outcomeWinners: winners.outcome,
            settledAt: now,
            updatedAt: now,
          })
          .where(eq(sportsPoolMatches.fixtureId, m.fixtureId));

        return wins;
      });

      if (payouts == null) continue;
      settled++;
      for (const w of payouts) await notifyWin(w.userId, w.points, m.homeTeamName, m.awayTeamName, m.fixtureId, w.tier);

      // مضاعف طبقة الولاء: نجلب lifetimePoints لكل فائز دفعة واحدة، ثم نضرب
      // نصيبه من البركة بالمضاعف قبل awardPoints. هذا يحفظ النصيب الأساسي
      // في pointsAwarded (للعرض) بينما تُضاف النقاط المضروبة لرصيد الولاء.
      const winnerIds = new Set<string>();
      for (const w of payouts) {
        if (w.points > 0) winnerIds.add(w.userId);
      }
      const winnerIdsList = [...winnerIds];
      const tierRows = winnerIdsList.length > 0
        ? await db
            .select({ userId: userPointsTotal.userId, lifetimePoints: userPointsTotal.lifetimePoints })
            .from(userPointsTotal)
            .where(inArray(userPointsTotal.userId, winnerIdsList))
        : [];
      const lifetimeByUser = new Map<string, number>(
        tierRows.map((r) => [r.userId, Number(r.lifetimePoints ?? 0)]),
      );

      let awardedThisMatch = 0;
      for (const w of payouts) {
        if (w.points <= 0) continue;
        const lifetime = lifetimeByUser.get(w.userId) ?? 0;
        const multiplier = tierMultiplierForPoints(lifetime);
        const boostedPoints = Math.round(w.points * multiplier);
        const outcome = await awardPoints({
          userId: w.userId,
          action: LOYALTY_ACTIONS.SPORTS_PREDICTION_WIN,
          source: String(m.fixtureId),
          points: boostedPoints,
          metadata: {
            fixtureId: String(m.fixtureId),
            tier: w.tier,
            score: `${finalHome}-${finalAway}`,
            baseShare: w.points,
            multiplier,
            boostedPoints,
          },
        });
        if (outcome.awarded) awardedThisMatch++;
        // snapshot الأسبوعي للأقسام: النصيب الأساسي (قبل المضاعف) حتى لا
        // تتضخّم نقاط الترقية بمضاعف طبقة الولاء وتظل عادلة بين الطبقات.
        await creditWeeklyPoints(w.userId, m.fixtureId, w.points, true).catch((e) =>
          console.warn(`[SportsPool] weekly credit failed for ${w.userId}:`, e),
        );
      }
      awarded += awardedThisMatch;
      for (const uid of winnerIdsList) await awardBadges(uid);
    } catch (err) {
      errors++;
      console.error(`[SportsPool] settle failed for fixture ${m.fixtureId}:`, err);
    }
  }

  return { settled, awarded, errors };
}

// ---------------------------------------------------------------------------
// Long-term per-competition predictions (champion / top scorer)
// ---------------------------------------------------------------------------

export type SpLongKind = "champion" | "top_scorer";

export type SpLongTeam = { id: number; name: string; logo: string };

export type SpLongResponse = {
  competitionSlug: string;
  teams: SpLongTeam[];
  pools: typeof LONG_POOL;
  championVotes: { teamId: number | null; n: number }[];
  locked: boolean;
  mine: {
    kind: string;
    teamId: number | null;
    teamName: string | null;
    teamLogo: string | null;
    playerName: string | null;
    status: string;
    pointsAwarded: number;
  }[];
};

/** Localized round is the quarter-finals or later (round of 8 onward). */
function isLateStageRound(round: string): boolean {
  return round.includes("النهائي") || round.includes("المركز الثالث");
}

/**
 * Long-term picks (champion / top scorer) stay OPEN through the early rounds and
 * lock once the knockout reaches the round of 8 (quarter-finals begin) — for an
 * in-progress World Cup you can still predict the champion/top scorer until the
 * quarter-finals kick off. Leagues (no late-stage rounds) lock only when the
 * whole competition has ended. No fixtures yet ⇒ open.
 */
async function longLocked(competitionSlug: string): Promise<boolean> {
  const comp = getCompetition(competitionSlug);
  if (!comp) return true;
  try {
    const fixtures = await getFixtures(comp);
    if (fixtures.length === 0) return false;
    const now = nowSec();
    const quarterStarted = fixtures.some(
      (f) => isLateStageRound(f.round) && (f.status.live || f.status.finished || f.timestamp <= now),
    );
    if (quarterStarted) return true;
    return fixtures.every((f) => f.status.finished);
  } catch {
    return false;
  }
}

async function longTeams(competitionSlug: string): Promise<SpLongTeam[]> {
  const comp = getCompetition(competitionSlug);
  if (!comp) return [];
  try {
    const rows = await getStandings(comp);
    const seen = new Set<number>();
    const teams: SpLongTeam[] = [];
    for (const r of rows) {
      if (seen.has(r.team.id)) continue;
      seen.add(r.team.id);
      teams.push({ id: r.team.id, name: r.team.name, logo: r.team.logo });
    }
    if (teams.length > 0) return teams;
  } catch {
    /* fall through to fixtures-derived teams */
  }
  // No standings (cups) — derive the team set from the fixtures.
  try {
    const fixtures = await getFixtures(comp);
    const seen = new Set<number>();
    const teams: SpLongTeam[] = [];
    for (const f of fixtures) {
      for (const t of [f.home, f.away]) {
        if (t.id > 0 && !seen.has(t.id)) {
          seen.add(t.id);
          teams.push({ id: t.id, name: t.name, logo: t.logo });
        }
      }
    }
    return teams.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  } catch {
    return [];
  }
}

export async function getLongPredictions(
  competitionSlug: string,
  userId?: string,
): Promise<SpLongResponse> {
  const [teams, locked, counts] = await Promise.all([
    longTeams(competitionSlug),
    longLocked(competitionSlug),
    db
      .select({
        teamId: sportsPoolLong.teamId,
        n: sql<number>`count(*)::int`,
      })
      .from(sportsPoolLong)
      .where(and(eq(sportsPoolLong.competitionSlug, competitionSlug), eq(sportsPoolLong.kind, "champion")))
      .groupBy(sportsPoolLong.teamId),
  ]);

  let mine: SpLongResponse["mine"] = [];
  if (userId) {
    mine = await db
      .select({
        kind: sportsPoolLong.kind,
        teamId: sportsPoolLong.teamId,
        teamName: sportsPoolLong.teamName,
        teamLogo: sportsPoolLong.teamLogo,
        playerName: sportsPoolLong.playerName,
        status: sportsPoolLong.status,
        pointsAwarded: sportsPoolLong.pointsAwarded,
      })
      .from(sportsPoolLong)
      .where(and(eq(sportsPoolLong.userId, userId), eq(sportsPoolLong.competitionSlug, competitionSlug)));
  }

  return {
    competitionSlug,
    teams,
    pools: LONG_POOL,
    championVotes: counts.map((c) => ({ teamId: c.teamId, n: Number(c.n) })),
    locked,
    mine,
  };
}

export type SpLongSubmit = { ok: true } | { ok: false; reason: "LOCKED" | "INVALID" };

export async function submitLongPrediction(
  userId: string,
  competitionSlug: string,
  kind: SpLongKind,
  payload: { teamId?: number; playerName?: string },
): Promise<SpLongSubmit> {
  if (kind !== "champion" && kind !== "top_scorer") return { ok: false, reason: "INVALID" };
  if (!getCompetition(competitionSlug)) return { ok: false, reason: "INVALID" };
  if (await longLocked(competitionSlug)) return { ok: false, reason: "LOCKED" };

  if (kind === "champion") {
    const team = (await longTeams(competitionSlug)).find((t) => t.id === payload.teamId);
    if (!team) return { ok: false, reason: "INVALID" };
    await db
      .insert(sportsPoolLong)
      .values({ userId, competitionSlug, kind, teamId: team.id, teamName: team.name, teamLogo: team.logo })
      .onConflictDoUpdate({
        target: [sportsPoolLong.userId, sportsPoolLong.competitionSlug, sportsPoolLong.kind],
        set: { teamId: team.id, teamName: team.name, teamLogo: team.logo, updatedAt: new Date() },
      });
    return { ok: true };
  }

  const name = (payload.playerName ?? "").trim();
  if (name.length < 2 || name.length > 60) return { ok: false, reason: "INVALID" };
  await db
    .insert(sportsPoolLong)
    .values({ userId, competitionSlug, kind, playerName: name })
    .onConflictDoUpdate({
      target: [sportsPoolLong.userId, sportsPoolLong.competitionSlug, sportsPoolLong.kind],
      set: { playerName: name, updatedAt: new Date() },
    });
  return { ok: true };
}
