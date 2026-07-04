/**
 * مسابقة توقّعات «خليجي 27» — المحرّك (بركة متدرّجة مشتركة + جائزة متراكمة).
 *
 * النموذج: لكل مباراة بركة 1000 نقطة (+ أي جائزة متراكمة من مباريات لم يُصِب أحد
 * طبقاتها) تُقسَّم 50/30/20 على طبقات الدقّة/الفارق/النتيجة وتُوزَّع بالتساوي على
 * فائزي كل طبقة. النتيجة المقلوبة لا تفوز (انظر gulfCupPredictionScoring). النقاط
 * تُضاف لمحفظة ولاء العضو، والفائز يُشعَر فورًا.
 *
 * المباريات لا تُخزَّن — تُجلب من gulfCupService (ثابتة + دمج API-Football). نخزّن
 * توقّعات الأعضاء (gc_predictions) ولقطة كل مباراة بحسابات البركة (gc_prediction_matches)
 * + توقّعات طويلة المدى (gc_long_predictions) + الشارات (gc_badges).
 *
 * ADR-001: هذه الخدمة تملك كل استعلامات Drizzle؛ مسار gcPredictions لا يستورد db.
 */
import { and, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "../db";
import {
  gcPredictions,
  gcPredictionMatches,
  gcLongPredictions,
  gcBadges,
  notificationsInbox,
  users,
} from "@shared/schema";
import {
  getGcFixtures,
  getGcStandings,
  getGcTeams,
  type GcFixture,
  type GcStandingRow,
} from "./gulfCupService";
import { WC_FINISHED_STATUSES, WC_LIVE_STATUSES } from "./worldCupNames";
import { computeMatchProbabilities, toWholePercents } from "./asianCupRatings";
import {
  scoreTier,
  distributePool,
  shareForTier,
  type GcTier,
} from "./gulfCupPredictionScoring";
import { awardPoints } from "./loyalty";
import { LOYALTY_ACTIONS } from "@shared/loyalty";

/** التفعيل صريح بعلم البيئة (لا نكشف المسابقة قبل قرار النشر). */
export function isGcPredictionsEnabled(): boolean {
  return process.env.GC_PREDICTIONS_ENABLED === "true";
}

const LONG_POOL = { champion: 5000, top_scorer: 5000 } as const;

const fid = (fixtureId: number | string): string => String(fixtureId);

function riyadhDateKey(offsetDays = 0): string {
  return new Date(Date.now() + (3 * 60 * 60 + offsetDays * 24 * 60 * 60) * 1000)
    .toISOString()
    .slice(0, 10);
}

/** مباراة «مقفلة» متى انطلقت/انتهت/حان موعدها. لا توقّع على الأدوار غير المحدّدة. */
function isLocked(fx: GcFixture): boolean {
  if (WC_LIVE_STATUSES.has(fx.status.code) || WC_FINISHED_STATUSES.has(fx.status.code)) return true;
  return Date.now() >= fx.timestamp * 1000;
}

/** قابلة للتوقّع: الطرفان محدّدان (لا «أول المجموعة») وغير مقفلة. */
function isPredictable(fx: GcFixture): boolean {
  return fx.home.id > 0 && fx.away.id > 0;
}

function hasRealFinalScore(fx: GcFixture): boolean {
  const settleable = new Set(["FT", "AET", "PEN"]);
  return settleable.has(fx.status.code) && fx.goals.home != null && fx.goals.away != null;
}

async function standingsMap(): Promise<Map<number, GcStandingRow>> {
  const groups = await getGcStandings();
  const m = new Map<number, GcStandingRow>();
  for (const g of groups) for (const r of g.rows) m.set(r.team.id, r);
  return m;
}

function percentsFor(fx: GcFixture, smap: Map<number, GcStandingRow>) {
  const probs = computeMatchProbabilities({
    homeId: fx.home.id,
    awayId: fx.away.id,
    homeRow: smap.get(fx.home.id) as any,
    awayRow: smap.get(fx.away.id) as any,
  });
  return toWholePercents(probs);
}

const probOfPick = (predHome: number, predAway: number, p: { home: number; draw: number; away: number }): number =>
  predHome > predAway ? p.home : predHome < predAway ? p.away : p.draw;

// ---------------------------------------------------------------------------
// أنواع الإخراج للواجهة
// ---------------------------------------------------------------------------

export type GcModelProbs = { home: number; draw: number; away: number };
export type GcCrowd = { home: number; draw: number; away: number; total: number };

export type GcMyPrediction = {
  predHome: number;
  predAway: number;
  status: string;
  tier: GcTier;
  outcomeHit: boolean;
  marginHit: boolean;
  exactHit: boolean;
  pointsAwarded: number;
};

export type GcMatchSettlement = {
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

export type GcPredictableMatch = {
  fixture: GcFixture;
  locked: boolean;
  probs: GcModelProbs;
  crowd: GcCrowd;
  predictionsCount: number;
  /** البركة المتاحة لهذه المباراة (الأساس + الجائزة المتراكمة حاليًّا). */
  poolAvailable: number;
  myPrediction: GcMyPrediction | null;
  settlement: GcMatchSettlement | null;
};

export type GcMeStats = {
  points: number;
  correct: number;
  exact: number;
  played: number;
  currentStreak: number;
  badges: string[];
};

export type GcSubmitResult =
  | { ok: true; prediction: { predHome: number; predAway: number; status: string } }
  | { ok: false; reason: "NOT_FOUND" | "LOCKED" | "INVALID" };

// ---------------------------------------------------------------------------
// الجائزة المتراكمة الحالية (carryOut لآخر مباراة مُسوّاة)
// ---------------------------------------------------------------------------

async function currentJackpot(): Promise<number> {
  const [row] = await db
    .select({ carryOut: gcPredictionMatches.carryOut })
    .from(gcPredictionMatches)
    .where(eq(gcPredictionMatches.status, "settled"))
    .orderBy(desc(gcPredictionMatches.kickoffAt))
    .limit(1);
  return Number(row?.carryOut ?? 0);
}

// ---------------------------------------------------------------------------
// كتابة التوقّع
// ---------------------------------------------------------------------------

export async function submitPrediction(
  userId: string,
  fixtureId: number,
  predHome: number,
  predAway: number,
): Promise<GcSubmitResult> {
  if (
    !Number.isInteger(predHome) || !Number.isInteger(predAway) ||
    predHome < 0 || predAway < 0 || predHome > 99 || predAway > 99
  ) {
    return { ok: false, reason: "INVALID" };
  }

  const fx = (await getGcFixtures()).find((f) => f.id === fixtureId);
  if (!fx || !isPredictable(fx)) return { ok: false, reason: "NOT_FOUND" };
  if (isLocked(fx)) return { ok: false, reason: "LOCKED" };

  const pct = percentsFor(fx, await standingsMap());
  await db
    .insert(gcPredictionMatches)
    .values({
      fixtureId: fid(fx.id),
      kickoffAt: new Date(fx.timestamp * 1000),
      homeTeamId: fx.home.id,
      awayTeamId: fx.away.id,
      homeTeamName: fx.home.name,
      homeTeamLogo: fx.home.logo,
      awayTeamName: fx.away.name,
      awayTeamLogo: fx.away.logo,
      probHome: pct.home,
      probDraw: pct.draw,
      probAway: pct.away,
      status: "open",
    })
    .onConflictDoUpdate({
      target: gcPredictionMatches.fixtureId,
      set: {
        homeTeamId: fx.home.id,
        awayTeamId: fx.away.id,
        homeTeamName: fx.home.name,
        homeTeamLogo: fx.home.logo,
        awayTeamName: fx.away.name,
        awayTeamLogo: fx.away.logo,
        kickoffAt: new Date(fx.timestamp * 1000),
        probHome: pct.home,
        probDraw: pct.draw,
        probAway: pct.away,
        updatedAt: new Date(),
      },
    });

  const pickProb = probOfPick(predHome, predAway, pct);
  const [row] = await db
    .insert(gcPredictions)
    .values({ fixtureId: fid(fx.id), userId, predHome, predAway, pickProb })
    .onConflictDoUpdate({
      target: [gcPredictions.fixtureId, gcPredictions.userId],
      set: { predHome, predAway, pickProb, updatedAt: new Date() },
    })
    .returning({
      predHome: gcPredictions.predHome,
      predAway: gcPredictions.predAway,
      status: gcPredictions.status,
    });

  return { ok: true, prediction: row };
}

// ---------------------------------------------------------------------------
// قراءات الواجهة
// ---------------------------------------------------------------------------

async function computeCurrentStreak(userId: string): Promise<number> {
  const rows = await db
    .select({ outcomeHit: gcPredictions.outcomeHit })
    .from(gcPredictions)
    .innerJoin(gcPredictionMatches, eq(gcPredictions.fixtureId, gcPredictionMatches.fixtureId))
    .where(and(eq(gcPredictions.userId, userId), isNotNull(gcPredictions.settledAt)))
    .orderBy(desc(gcPredictionMatches.kickoffAt));
  let n = 0;
  for (const r of rows) {
    if (r.outcomeHit) n++;
    else break;
  }
  return n;
}

async function getMyBadgeCodes(userId: string): Promise<string[]> {
  const rows = await db
    .select({ badge: gcBadges.badge })
    .from(gcBadges)
    .where(eq(gcBadges.userId, userId));
  return rows.map((r) => r.badge);
}

async function getMeStats(userId: string): Promise<GcMeStats> {
  const [agg] = await db
    .select({
      points: sql<number>`coalesce(sum(${gcPredictions.pointsAwarded}), 0)::int`,
      correct: sql<number>`count(*) filter (where ${gcPredictions.outcomeHit})::int`,
      exact: sql<number>`count(*) filter (where ${gcPredictions.exactHit})::int`,
      played: sql<number>`count(*) filter (where ${gcPredictions.status} <> 'pending')::int`,
    })
    .from(gcPredictions)
    .where(eq(gcPredictions.userId, userId));
  return {
    points: Number(agg?.points ?? 0),
    correct: Number(agg?.correct ?? 0),
    exact: Number(agg?.exact ?? 0),
    played: Number(agg?.played ?? 0),
    currentStreak: await computeCurrentStreak(userId),
    badges: await getMyBadgeCodes(userId),
  };
}

export async function getUpcomingPredictableMatches(
  userId?: string,
): Promise<{ matches: GcPredictableMatch[]; me: GcMeStats | null; jackpot: number }> {
  const [fixtures, smap, jackpot] = await Promise.all([getGcFixtures(), standingsMap(), currentJackpot()]);
  const days = new Set([riyadhDateKey(0), riyadhDateKey(1)]);
  let today = fixtures.filter((f) => isPredictable(f) && days.has((f.date ?? "").slice(0, 10)));
  // قبل انطلاق البطولة لا مباريات اليوم — اعرض أقرب جولة قابلة للتوقّع كمعاينة.
  if (today.length === 0) {
    const upcoming = fixtures.filter((f) => isPredictable(f) && !isLocked(f));
    today = upcoming.slice(0, 4);
  }
  if (today.length === 0) {
    return { matches: [], me: userId ? await getMeStats(userId) : null, jackpot };
  }

  const ids = today.map((f) => fid(f.id));

  const crowdRows = await db
    .select({
      fixtureId: gcPredictions.fixtureId,
      home: sql<number>`count(*) filter (where ${gcPredictions.predHome} > ${gcPredictions.predAway})::int`,
      draw: sql<number>`count(*) filter (where ${gcPredictions.predHome} = ${gcPredictions.predAway})::int`,
      away: sql<number>`count(*) filter (where ${gcPredictions.predHome} < ${gcPredictions.predAway})::int`,
    })
    .from(gcPredictions)
    .where(inArray(gcPredictions.fixtureId, ids))
    .groupBy(gcPredictions.fixtureId);
  const crowdByFixture = new Map(crowdRows.map((r) => [r.fixtureId, r]));

  const matchRows = await db
    .select()
    .from(gcPredictionMatches)
    .where(inArray(gcPredictionMatches.fixtureId, ids));
  const matchByFixture = new Map(matchRows.map((m) => [m.fixtureId, m]));

  const myByFixture = new Map<string, GcMyPrediction>();
  if (userId) {
    const mine = await db
      .select()
      .from(gcPredictions)
      .where(and(eq(gcPredictions.userId, userId), inArray(gcPredictions.fixtureId, ids)));
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

  const matches: GcPredictableMatch[] = today.map((fixture) => {
    const key = fid(fixture.id);
    const snap = matchByFixture.get(key);
    const probs: GcModelProbs = snap
      ? { home: snap.probHome, draw: snap.probDraw, away: snap.probAway }
      : percentsFor(fixture, smap);
    const c = crowdByFixture.get(key);
    const cHome = Number(c?.home ?? 0);
    const cDraw = Number(c?.draw ?? 0);
    const cAway = Number(c?.away ?? 0);
    const total = cHome + cDraw + cAway;
    const crowd: GcCrowd =
      total > 0
        ? {
            home: Math.round((cHome / total) * 100),
            draw: Math.round((cDraw / total) * 100),
            away: Math.round((cAway / total) * 100),
            total,
          }
        : { home: 0, draw: 0, away: 0, total: 0 };

    const base = snap?.poolBase ?? 1000;
    // البركة المتاحة للمباراة المفتوحة = أساسها + الجائزة المتراكمة الحالية.
    const poolAvailable = snap?.status === "settled" ? base + Number(snap.poolCarryIn) : base + jackpot;

    return {
      fixture,
      locked: isLocked(fixture),
      probs,
      crowd,
      predictionsCount: total,
      poolAvailable,
      myPrediction: myByFixture.get(key) ?? null,
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
  });

  return { matches, me: userId ? await getMeStats(userId) : null, jackpot };
}

export async function getMyPredictions(userId: string) {
  return db
    .select({
      fixtureId: gcPredictions.fixtureId,
      predHome: gcPredictions.predHome,
      predAway: gcPredictions.predAway,
      status: gcPredictions.status,
      tier: gcPredictions.tier,
      outcomeHit: gcPredictions.outcomeHit,
      marginHit: gcPredictions.marginHit,
      exactHit: gcPredictions.exactHit,
      pointsAwarded: gcPredictions.pointsAwarded,
      createdAt: gcPredictions.createdAt,
      kickoffAt: gcPredictionMatches.kickoffAt,
      homeTeamName: gcPredictionMatches.homeTeamName,
      homeTeamLogo: gcPredictionMatches.homeTeamLogo,
      awayTeamName: gcPredictionMatches.awayTeamName,
      awayTeamLogo: gcPredictionMatches.awayTeamLogo,
      finalHome: gcPredictionMatches.finalHome,
      finalAway: gcPredictionMatches.finalAway,
      matchStatus: gcPredictionMatches.status,
    })
    .from(gcPredictions)
    .leftJoin(gcPredictionMatches, eq(gcPredictions.fixtureId, gcPredictionMatches.fixtureId))
    .where(eq(gcPredictions.userId, userId))
    .orderBy(desc(gcPredictionMatches.kickoffAt));
}

export async function getMatchPredictionsSummary(
  fixtureId: number,
): Promise<GcMatchSettlement & { crowd: GcCrowd }> {
  const key = fid(fixtureId);
  const [snap] = await db.select().from(gcPredictionMatches).where(eq(gcPredictionMatches.fixtureId, key));
  const [c] = await db
    .select({
      home: sql<number>`count(*) filter (where ${gcPredictions.predHome} > ${gcPredictions.predAway})::int`,
      draw: sql<number>`count(*) filter (where ${gcPredictions.predHome} = ${gcPredictions.predAway})::int`,
      away: sql<number>`count(*) filter (where ${gcPredictions.predHome} < ${gcPredictions.predAway})::int`,
    })
    .from(gcPredictions)
    .where(eq(gcPredictions.fixtureId, key));
  const cHome = Number(c?.home ?? 0);
  const cDraw = Number(c?.draw ?? 0);
  const cAway = Number(c?.away ?? 0);
  const total = cHome + cDraw + cAway;
  return {
    status: snap?.status ?? "open",
    finalHome: snap?.finalHome ?? null,
    finalAway: snap?.finalAway ?? null,
    predictionsCount: total,
    exactWinners: snap?.exactWinners ?? 0,
    marginWinners: snap?.marginWinners ?? 0,
    outcomeWinners: snap?.outcomeWinners ?? 0,
    poolBase: snap?.poolBase ?? 1000,
    poolCarryIn: snap?.poolCarryIn ?? 0,
    carryOut: snap?.carryOut ?? 0,
    crowd:
      total > 0
        ? {
            home: Math.round((cHome / total) * 100),
            draw: Math.round((cDraw / total) * 100),
            away: Math.round((cAway / total) * 100),
            total,
          }
        : { home: 0, draw: 0, away: 0, total: 0 },
  };
}

export async function getLeaderboard(limit = 100) {
  const rows = await db
    .select({
      userId: gcPredictions.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      avatar: users.profileImageUrl,
      totalPoints: sql<number>`coalesce(sum(${gcPredictions.pointsAwarded}), 0)::int`,
      correctCount: sql<number>`count(*) filter (where ${gcPredictions.outcomeHit})::int`,
      exactCount: sql<number>`count(*) filter (where ${gcPredictions.exactHit})::int`,
      playedCount: sql<number>`count(*) filter (where ${gcPredictions.status} <> 'pending')::int`,
    })
    .from(gcPredictions)
    .innerJoin(users, eq(gcPredictions.userId, users.id))
    .groupBy(gcPredictions.userId, users.firstName, users.lastName, users.profileImageUrl)
    .having(sql`count(*) filter (where ${gcPredictions.status} <> 'pending') > 0`)
    .orderBy(
      desc(sql`coalesce(sum(${gcPredictions.pointsAwarded}), 0)`),
      desc(sql`count(*) filter (where ${gcPredictions.exactHit})`),
      desc(sql`count(*) filter (where ${gcPredictions.outcomeHit})`),
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

/**
 * ميتا اللوحة: العدد الكلي للمشاركين المؤهّلين + صف الزائر ورتبته حتى لو كان
 * خارج الصفحة المعروضة — الرتبة 1 + عدد من يسبقه بمعايير الترتيب الثلاثة
 * (النقاط ثم الإصابات الدقيقة ثم النتائج الصحيحة).
 */
export async function getLeaderboardMeta(viewerUserId?: string) {
  const board = db
    .select({
      uid: gcPredictions.userId,
      pts: sql<number>`coalesce(sum(${gcPredictions.pointsAwarded}), 0)::int`.as("pts"),
      exact: sql<number>`count(*) filter (where ${gcPredictions.exactHit})::int`.as("exact"),
      correct: sql<number>`count(*) filter (where ${gcPredictions.outcomeHit})::int`.as("correct"),
    })
    .from(gcPredictions)
    .innerJoin(users, eq(gcPredictions.userId, users.id))
    .groupBy(gcPredictions.userId)
    .having(sql`count(*) filter (where ${gcPredictions.status} <> 'pending') > 0`)
    .as("board");

  const [totals] = await db.select({ total: sql<number>`count(*)::int` }).from(board);
  const total = Number(totals?.total ?? 0);
  if (!viewerUserId) return { total, viewer: null };

  const [mine] = await db
    .select({
      pts: sql<number>`coalesce(sum(${gcPredictions.pointsAwarded}), 0)::int`,
      exact: sql<number>`count(*) filter (where ${gcPredictions.exactHit})::int`,
      correct: sql<number>`count(*) filter (where ${gcPredictions.outcomeHit})::int`,
      played: sql<number>`count(*) filter (where ${gcPredictions.status} <> 'pending')::int`,
    })
    .from(gcPredictions)
    .where(eq(gcPredictions.userId, viewerUserId))
    .groupBy(gcPredictions.userId)
    .having(sql`count(*) filter (where ${gcPredictions.status} <> 'pending') > 0`);
  if (!mine) return { total, viewer: null };

  const [ahead] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(board)
    .where(
      sql`${board.pts} > ${mine.pts}
        or (${board.pts} = ${mine.pts} and ${board.exact} > ${mine.exact})
        or (${board.pts} = ${mine.pts} and ${board.exact} = ${mine.exact} and ${board.correct} > ${mine.correct})`,
    );

  const played = Number(mine.played);
  const correct = Number(mine.correct);
  return {
    total,
    viewer: {
      userId: viewerUserId,
      rank: Number(ahead?.n ?? 0) + 1,
      totalPoints: Number(mine.pts),
      correctCount: correct,
      exactCount: Number(mine.exact),
      playedCount: played,
      accuracy: played > 0 ? Math.round((correct / played) * 100) : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// الشارات
// ---------------------------------------------------------------------------

/** يمنح شارات العضو بعد تسوية مباراة (idempotent عبر onConflictDoNothing). */
async function awardBadges(userId: string): Promise<void> {
  const [agg] = await db
    .select({
      exact: sql<number>`count(*) filter (where ${gcPredictions.exactHit})::int`,
      groupPlayed: sql<number>`count(*) filter (where ${gcPredictions.status} <> 'pending')::int`,
      lionheart: sql<number>`count(*) filter (where ${gcPredictions.outcomeHit} and ${gcPredictions.pickProb} > 0 and ${gcPredictions.pickProb} < 10)::int`,
    })
    .from(gcPredictions)
    .where(eq(gcPredictions.userId, userId));

  const streak = await computeCurrentStreak(userId);
  const toAward: { badge: string; metadata: Record<string, any> }[] = [];
  if (Number(agg?.exact ?? 0) >= 5) toAward.push({ badge: "nostradamus", metadata: { exact: Number(agg.exact) } });
  if (Number(agg?.lionheart ?? 0) >= 1) toAward.push({ badge: "lionheart", metadata: {} });
  if (streak >= 3) toAward.push({ badge: "hot_streak", metadata: { streak } });
  if (Number(agg?.groupPlayed ?? 0) >= 12) toAward.push({ badge: "ever_present", metadata: {} });

  for (const b of toAward) {
    await db.insert(gcBadges).values({ userId, badge: b.badge, metadata: b.metadata }).onConflictDoNothing();
  }
}

async function notifyWin(userId: string, points: number, fx: GcFixture, tier: GcTier): Promise<void> {
  const tierAr =
    tier === "exact" ? "النتيجة الدقيقة 🎯" : tier === "margin" ? "الفارق الصحيح 📏" : "النتيجة الصحيحة ✅";
  try {
    await db.insert(notificationsInbox).values({
      userId,
      type: "GULF_CUP_WIN",
      title: "🎉 توقّعك صحيح في خليجي 27!",
      body: `أصبت ${tierAr} في مباراة ${fx.home.name} و${fx.away.name} وربحت ${points} نقطة ولاء.`,
      deeplink: "/gulf-cup/predictions",
      metadata: { fixtureId: fid(fx.id), points, tier },
    });
  } catch (err) {
    console.warn(`[GC Predictions] notify failed for ${userId}:`, err);
  }
}

// ---------------------------------------------------------------------------
// محرّك التسوية — كل دقيقة عبر الكرون
// ---------------------------------------------------------------------------

export type GcSettlementSummary = { settled: number; awarded: number; errors: number };

/**
 * يُسوّي المباريات المنتهية: يحسب طبقة كل توقّع، يوزّع البركة (الأساس + الجائزة
 * المتراكمة) على الفائزين بالتساوي داخل كل طبقة، ويُرحّل غير الموزَّع كجائزة
 * للمباراة التالية. درع idempotency: settledAt مرساة + قيد pending + dedup الولاء.
 */
export async function settleFinishedMatches(): Promise<GcSettlementSummary> {
  const fixtures = await getGcFixtures();
  // نُسوّي بترتيب الانطلاق ليتسلسل تراكم الجائزة بشكل حتمي.
  const finished = fixtures.filter(hasRealFinalScore).sort((a, b) => a.timestamp - b.timestamp);
  let settled = 0;
  let awarded = 0;
  let errors = 0;

  for (const fx of finished) {
    try {
      const key = fid(fx.id);
      const [existing] = await db
        .select({ settledAt: gcPredictionMatches.settledAt })
        .from(gcPredictionMatches)
        .where(eq(gcPredictionMatches.fixtureId, key));
      if (!existing) continue; // لا توقّعات على هذه المباراة

      let payouts: { userId: string; points: number; tier: GcTier }[] = [];

      if (existing.settledAt == null) {
        const result = await db.transaction(async (tx) => {
          const [locked] = await tx
            .select({ settledAt: gcPredictionMatches.settledAt, kickoffAt: gcPredictionMatches.kickoffAt })
            .from(gcPredictionMatches)
            .where(eq(gcPredictionMatches.fixtureId, key))
            .for("update");
          if (locked?.settledAt != null) return null; // خسرنا السباق

          // الجائزة المتراكمة = carryOut لآخر مباراة مُسوّاة قبل هذه.
          const [prev] = await tx
            .select({ carryOut: gcPredictionMatches.carryOut })
            .from(gcPredictionMatches)
            .where(and(eq(gcPredictionMatches.status, "settled"), lt(gcPredictionMatches.kickoffAt, locked.kickoffAt)))
            .orderBy(desc(gcPredictionMatches.kickoffAt))
            .limit(1);
          const carryIn = Number(prev?.carryOut ?? 0);

          const finalHome = fx.goals.home as number;
          const finalAway = fx.goals.away as number;
          const now = new Date();

          const preds = await tx
            .select({
              userId: gcPredictions.userId,
              predHome: gcPredictions.predHome,
              predAway: gcPredictions.predAway,
            })
            .from(gcPredictions)
            .where(and(eq(gcPredictions.fixtureId, key), eq(gcPredictions.status, "pending")));

          // أولًا: احسب الطبقات وعُدّ الفائزين لكل طبقة.
          const scored = preds.map((p) => ({ ...p, ...scoreTier(p.predHome, p.predAway, finalHome, finalAway) }));
          const winners = {
            exact: scored.filter((s) => s.tier === "exact").length,
            margin: scored.filter((s) => s.tier === "margin").length,
            outcome: scored.filter((s) => s.tier === "outcome").length,
          };

          const available = 1000 + carryIn;
          // لا توقّعات ⇒ نُبقي الجائزة المتراكمة كما هي (لا نُضخّمها بالأساس).
          const noPreds = scored.length === 0;
          const dist = noPreds
            ? { shareExact: 0, shareMargin: 0, shareOutcome: 0, paidExact: 0, paidMargin: 0, paidOutcome: 0, carryOut: carryIn }
            : distributePool(available, winners);

          const wins: { userId: string; points: number; tier: GcTier }[] = [];
          for (const s of scored) {
            const points = shareForTier(dist, s.tier);
            await tx
              .update(gcPredictions)
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
              .where(
                and(
                  eq(gcPredictions.fixtureId, key),
                  eq(gcPredictions.userId, s.userId),
                  eq(gcPredictions.status, "pending"),
                ),
              );
            if (points > 0) wins.push({ userId: s.userId, points, tier: s.tier });
          }

          await tx
            .update(gcPredictionMatches)
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
            .where(eq(gcPredictionMatches.fixtureId, key));

          return wins;
        });

        if (result == null) continue;
        payouts = result;
        settled++;

        // إشعار فوري للفائزين (مرّة واحدة عند أول تسوية).
        for (const w of payouts) await notifyWin(w.userId, w.points, fx, w.tier);
      } else {
        // مسوّاة مسبقًا — أعد اشتقاق المدفوعات (dedup يجعل إعادة المنح مجانية).
        const rows = await db
          .select({ userId: gcPredictions.userId, points: gcPredictions.pointsAwarded, tier: gcPredictions.tier })
          .from(gcPredictions)
          .where(
            and(
              eq(gcPredictions.fixtureId, key),
              eq(gcPredictions.status, "correct"),
              sql`${gcPredictions.pointsAwarded} > 0`,
            ),
          );
        payouts = rows.map((r) => ({ userId: r.userId, points: Number(r.points), tier: r.tier as GcTier }));
        if (payouts.length === 0) continue;
      }

      // Phase B: منح نقاط الولاء + الشارات (آمن للتكرار).
      const winnerIds = new Set<string>();
      for (const w of payouts) {
        if (w.points <= 0) continue;
        winnerIds.add(w.userId);
        const outcome = await awardPoints({
          userId: w.userId,
          action: LOYALTY_ACTIONS.GC_PREDICTION_WIN,
          source: key,
          points: w.points,
          metadata: { fixtureId: key, tier: w.tier, score: `${fx.goals.home}-${fx.goals.away}` },
        });
        if (outcome.awarded) awarded++;
      }
      for (const uid of winnerIds) await awardBadges(uid);
    } catch (err) {
      errors++;
      console.error(`[GC Predictions] settle failed for fixture ${fx.id}:`, err);
    }
  }

  return { settled, awarded, errors };
}

// ---------------------------------------------------------------------------
// توقّعات طويلة المدى (البطل / الهدّاف)
// ---------------------------------------------------------------------------

export type GcLongKind = "champion" | "top_scorer";

export async function getLongPredictions(userId?: string) {
  const teams = await getGcTeams();
  const counts = await db
    .select({
      kind: gcLongPredictions.kind,
      teamId: gcLongPredictions.teamId,
      n: sql<number>`count(*)::int`,
    })
    .from(gcLongPredictions)
    .groupBy(gcLongPredictions.kind, gcLongPredictions.teamId);

  let mine: { kind: string; teamId: number | null; teamName: string | null; playerName: string | null; status: string; pointsAwarded: number }[] = [];
  if (userId) {
    mine = await db
      .select({
        kind: gcLongPredictions.kind,
        teamId: gcLongPredictions.teamId,
        teamName: gcLongPredictions.teamName,
        playerName: gcLongPredictions.playerName,
        status: gcLongPredictions.status,
        pointsAwarded: gcLongPredictions.pointsAwarded,
      })
      .from(gcLongPredictions)
      .where(eq(gcLongPredictions.userId, userId));
  }

  return {
    teams,
    pools: LONG_POOL,
    championVotes: counts.filter((c) => c.kind === "champion"),
    mine,
  };
}

export type GcLongSubmit =
  | { ok: true }
  | { ok: false; reason: "LOCKED" | "INVALID" };

/** قفل التوقّعات طويلة المدى عند انطلاق أول مباراة بالبطولة. */
async function longPredictionsLocked(): Promise<boolean> {
  const fixtures = await getGcFixtures();
  const first = [...fixtures].sort((a, b) => a.timestamp - b.timestamp)[0];
  if (!first) return false;
  return Date.now() >= first.timestamp * 1000;
}

export async function submitLongPrediction(
  userId: string,
  kind: GcLongKind,
  payload: { teamId?: number; playerName?: string },
): Promise<GcLongSubmit> {
  if (kind !== "champion" && kind !== "top_scorer") return { ok: false, reason: "INVALID" };
  if (await longPredictionsLocked()) return { ok: false, reason: "LOCKED" };

  if (kind === "champion") {
    const teams = await getGcTeams();
    const team = teams.find((t) => t.id === payload.teamId);
    if (!team) return { ok: false, reason: "INVALID" };
    await db
      .insert(gcLongPredictions)
      .values({ userId, kind, teamId: team.id, teamName: team.name })
      .onConflictDoUpdate({
        target: [gcLongPredictions.userId, gcLongPredictions.kind],
        set: { teamId: team.id, teamName: team.name, updatedAt: new Date() },
      });
    return { ok: true };
  }

  const name = (payload.playerName ?? "").trim();
  if (name.length < 2 || name.length > 60) return { ok: false, reason: "INVALID" };
  await db
    .insert(gcLongPredictions)
    .values({ userId, kind, playerName: name })
    .onConflictDoUpdate({
      target: [gcLongPredictions.userId, gcLongPredictions.kind],
      set: { playerName: name, updatedAt: new Date() },
    });
  return { ok: true };
}

/**
 * تسوية توقّع البطل عند انتهاء النهائي: الفائز = المنتخب الذي فاز في المباراة 15.
 * بركة 5000 نقطة تُقسَّم بالتساوي على من اختاروه. (الهدّاف يُسوّى يدويًّا/لاحقًا
 * عند توفّر بيانات الهدّافين.)
 */
export async function settleChampionIfFinished(): Promise<{ settled: boolean; winners: number }> {
  const fixtures = await getGcFixtures();
  const final = fixtures.find((f) => f.roundEn === "Final");
  if (!final || !hasRealFinalScore(final)) return { settled: false, winners: 0 };
  const fh = final.goals.home as number;
  const fa = final.goals.away as number;
  const championId = fh > fa ? final.home.id : fa > fh ? final.away.id : null;
  if (!championId) return { settled: false, winners: 0 }; // تعادل بلا حسم (نادر) — يدويًّا

  // idempotency: لو سُوّيت بالفعل (أي صف champion settledAt) لا نكرّر.
  const correctVoters = await db
    .select({ id: gcLongPredictions.id, userId: gcLongPredictions.userId, settledAt: gcLongPredictions.settledAt })
    .from(gcLongPredictions)
    .where(and(eq(gcLongPredictions.kind, "champion"), eq(gcLongPredictions.teamId, championId)));
  const pending = correctVoters.filter((v) => v.settledAt == null);
  if (pending.length === 0) return { settled: false, winners: 0 };

  const share = Math.floor(LONG_POOL.champion / pending.length);
  const now = new Date();

  // علّم كل توقّعات البطل (الصحيحة والخاطئة) مُسوّاة.
  await db
    .update(gcLongPredictions)
    .set({ status: "incorrect", settledAt: now, updatedAt: now })
    .where(and(eq(gcLongPredictions.kind, "champion"), isNotNull(gcLongPredictions.teamId)));
  await db
    .update(gcLongPredictions)
    .set({ status: "correct", pointsAwarded: share, settledAt: now, updatedAt: now })
    .where(and(eq(gcLongPredictions.kind, "champion"), eq(gcLongPredictions.teamId, championId)));

  for (const v of pending) {
    await awardPoints({
      userId: v.userId,
      action: LOYALTY_ACTIONS.GC_LONG_PREDICTION_WIN,
      source: "gc-long:champion",
      points: share,
      metadata: { championId },
    });
  }
  return { settled: true, winners: pending.length };
}
