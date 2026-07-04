/**
 * مسابقة توقّعات دوري روشن السعودي — محرّك كأس العالم نفسه مطبَّقًا على الدوري.
 *
 * المستخدم يضع توقّعًا دقيقًا بالأهداف لكل مباراة قبل انطلاقها، ويربح فقط من
 * يصيب النتيجة بالضبط. جائزة كل مباراة 500 نقطة ولاء تُقسَّم بالتساوي بين كل
 * المصيبين (floor(500/عدد الفائزين)). لا أحد يصيب ⇒ لا نقاط لتلك المباراة.
 * فرق عن المونديال: الدوري يسمح بالتعادل فلا حظر على توقّعه.
 *
 * المباريات لا تُخزَّن — تُجلب حيّة من saudiLeagueService (league 307) خلف كاش
 * SWR. نخزّن فقط توقّعات المستخدمين (rsl_predictions) وحالة تسوية كل مباراة
 * (rsl_prediction_matches).
 *
 * ADR-001: هذه الخدمة تملك كل استعلامات Drizzle؛ مسار rslPredictions لا يستورد db.
 */
import { and, desc, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import { rslPredictions, rslPredictionMatches, users } from "@shared/schema";
import { getCompetition, getFixtures, type SplFixture } from "./saudiLeagueService";
import { awardPoints } from "./loyalty";
import { LOYALTY_ACTIONS } from "@shared/loyalty";
import { SUPERUSER_ROLE_NAMES } from "@shared/rbac-constants";

const POINTS_POOL = 500;

export const RSL_COMPETITION_SLUG = "pro-league";

export function rslComp() {
  const comp = getCompetition(RSL_COMPETITION_SLUG);
  if (!comp) throw new Error("[RSL Predictions] pro-league competition missing from registry");
  return comp;
}

/** معرّف المباراة الرقمي عند المزود يُخزَّن نصًّا (مفتاح الـ dedup في الولاء). */
const fid = (fixtureId: number | string): string => String(fixtureId);

/** مفتاح يوم بتوقيت الرياض — لفتح نافذة التوقّع لليوم والغد معًا. */
function riyadhDateKey(offsetDays = 0): string {
  return new Date(Date.now() + (3 * 60 * 60 + offsetDays * 24 * 60 * 60) * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * مباراة "مقفلة" متى انطلقت أو انتهت أو حان موعدها — حارس مزدوج: حالة المزود
 * تُغلق فور رفعها، وفحص الطابع الزمني يُغلق فجوة تأخّر المزود عن قلب NS→1H.
 */
function isLocked(fx: SplFixture): boolean {
  if (fx.status.live || fx.status.finished) return true;
  return Date.now() >= fx.timestamp * 1000;
}

/**
 * تُسوّى فقط المباريات ذات نتيجة فعلية على أرض الملعب: FT (وAET/PEN احتياطًا)
 * مع goals موجودة. AWD/WO (فوز إداري/انسحاب) بلا نتيجة حقيقية فتُستبعد.
 */
function hasRealFinalScore(fx: SplFixture): boolean {
  const settleable = new Set(["FT", "AET", "PEN"]);
  return settleable.has(fx.status.code) && fx.goals.home != null && fx.goals.away != null;
}

// ---------------------------------------------------------------------------
// أنواع الإخراج للواجهة — نفس عقد المونديال حرفيًّا
// ---------------------------------------------------------------------------

export type MyPrediction = {
  predHome: number;
  predAway: number;
  status: string; // pending | correct | incorrect
  pointsAwarded: number;
};

export type MatchSettlement = {
  status: string; // open | locked | settled
  finalHome: number | null;
  finalAway: number | null;
  winnersCount: number;
  pointsPerWinner: number;
  predictionsCount: number;
};

export type PredictableMatch = {
  fixture: SplFixture;
  locked: boolean;
  predictionsCount: number;
  myPrediction: MyPrediction | null;
  settlement: MatchSettlement | null;
};

export type SubmitResult =
  | { ok: true; prediction: { predHome: number; predAway: number; status: string } }
  | { ok: false; reason: "NOT_FOUND" | "LOCKED" | "INVALID" };

// ---------------------------------------------------------------------------
// كتابة التوقّع
// ---------------------------------------------------------------------------

export async function submitPrediction(
  userId: string,
  fixtureId: number,
  predHome: number,
  predAway: number,
): Promise<SubmitResult> {
  if (
    !Number.isInteger(predHome) || !Number.isInteger(predAway) ||
    predHome < 0 || predAway < 0 || predHome > 99 || predAway > 99
  ) {
    return { ok: false, reason: "INVALID" };
  }

  const fx = (await getFixtures(rslComp())).find((f) => f.id === fixtureId);
  if (!fx) return { ok: false, reason: "NOT_FOUND" };
  if (isLocked(fx)) return { ok: false, reason: "LOCKED" };

  // لقطة المباراة (open) — نُحدِّث الأسماء/الموعد دون لمس status.
  await db
    .insert(rslPredictionMatches)
    .values({
      fixtureId: fid(fx.id),
      kickoffAt: new Date(fx.timestamp * 1000),
      homeTeamName: fx.home.name,
      homeTeamLogo: fx.home.logo,
      awayTeamName: fx.away.name,
      awayTeamLogo: fx.away.logo,
      status: "open",
    })
    .onConflictDoUpdate({
      target: rslPredictionMatches.fixtureId,
      set: {
        homeTeamName: fx.home.name,
        homeTeamLogo: fx.home.logo,
        awayTeamName: fx.away.name,
        awayTeamLogo: fx.away.logo,
        kickoffAt: new Date(fx.timestamp * 1000),
        updatedAt: new Date(),
      },
    });

  // توقّع واحد لكل (مباراة، مستخدم) — يُحدَّث حتى القفل.
  const [row] = await db
    .insert(rslPredictions)
    .values({ fixtureId: fid(fx.id), userId, predHome, predAway })
    .onConflictDoUpdate({
      target: [rslPredictions.fixtureId, rslPredictions.userId],
      set: { predHome, predAway, updatedAt: new Date() },
    })
    .returning({
      predHome: rslPredictions.predHome,
      predAway: rslPredictions.predAway,
      status: rslPredictions.status,
    });

  return { ok: true, prediction: row };
}

// ---------------------------------------------------------------------------
// قراءات الواجهة
// ---------------------------------------------------------------------------

/**
 * مباريات اليوم والغد (بتوقيت الرياض) + توقّع المستخدم + حالة القفل/التسوية
 * + عدد المشاركين — نفس نافذة يومَي المونديال.
 */
export async function getUpcomingPredictableMatches(userId?: string): Promise<PredictableMatch[]> {
  const fixtures = await getFixtures(rslComp());
  const days = new Set([riyadhDateKey(0), riyadhDateKey(1)]);
  const today = fixtures
    .filter((f) => days.has((f.date ?? "").slice(0, 10)))
    .sort((a, b) => a.timestamp - b.timestamp);
  if (today.length === 0) return [];

  const ids = today.map((f) => fid(f.id));

  const countRows = await db
    .select({ fixtureId: rslPredictions.fixtureId, n: sql<number>`count(*)::int` })
    .from(rslPredictions)
    .where(inArray(rslPredictions.fixtureId, ids))
    .groupBy(rslPredictions.fixtureId);
  const countByFixture = new Map(countRows.map((r) => [r.fixtureId, Number(r.n)]));

  const matchRows = await db
    .select()
    .from(rslPredictionMatches)
    .where(inArray(rslPredictionMatches.fixtureId, ids));
  const matchByFixture = new Map(matchRows.map((m) => [m.fixtureId, m]));

  const myByFixture = new Map<string, MyPrediction>();
  if (userId) {
    const mine = await db
      .select({
        fixtureId: rslPredictions.fixtureId,
        predHome: rslPredictions.predHome,
        predAway: rslPredictions.predAway,
        status: rslPredictions.status,
        pointsAwarded: rslPredictions.pointsAwarded,
      })
      .from(rslPredictions)
      .where(and(eq(rslPredictions.userId, userId), inArray(rslPredictions.fixtureId, ids)));
    for (const m of mine) {
      myByFixture.set(m.fixtureId, {
        predHome: m.predHome,
        predAway: m.predAway,
        status: m.status,
        pointsAwarded: m.pointsAwarded,
      });
    }
  }

  return today.map((fixture) => {
    const key = fid(fixture.id);
    const match = matchByFixture.get(key);
    return {
      fixture,
      locked: isLocked(fixture),
      predictionsCount: countByFixture.get(key) ?? 0,
      myPrediction: myByFixture.get(key) ?? null,
      settlement: match
        ? {
            status: match.status,
            finalHome: match.finalHome,
            finalAway: match.finalAway,
            winnersCount: match.winnersCount,
            pointsPerWinner: match.pointsPerWinner,
            predictionsCount: match.predictionsCount,
          }
        : null,
    };
  });
}

/** سجل توقّعات المستخدم كاملًا — يُبنى من اللقطة بلا نداء API حيّ. */
export async function getMyPredictions(userId: string) {
  return db
    .select({
      fixtureId: rslPredictions.fixtureId,
      predHome: rslPredictions.predHome,
      predAway: rslPredictions.predAway,
      status: rslPredictions.status,
      pointsAwarded: rslPredictions.pointsAwarded,
      createdAt: rslPredictions.createdAt,
      kickoffAt: rslPredictionMatches.kickoffAt,
      homeTeamName: rslPredictionMatches.homeTeamName,
      homeTeamLogo: rslPredictionMatches.homeTeamLogo,
      awayTeamName: rslPredictionMatches.awayTeamName,
      awayTeamLogo: rslPredictionMatches.awayTeamLogo,
      finalHome: rslPredictionMatches.finalHome,
      finalAway: rslPredictionMatches.finalAway,
      matchStatus: rslPredictionMatches.status,
      winnersCount: rslPredictionMatches.winnersCount,
      pointsPerWinner: rslPredictionMatches.pointsPerWinner,
    })
    .from(rslPredictions)
    .leftJoin(rslPredictionMatches, eq(rslPredictions.fixtureId, rslPredictionMatches.fixtureId))
    .where(eq(rslPredictions.userId, userId))
    .orderBy(desc(rslPredictionMatches.kickoffAt));
}

/** عدّادات مباراة + نتيجتها إن سُوّيت — لا نكشف توقّعات الآخرين الفردية. */
export async function getMatchPredictionsSummary(fixtureId: number): Promise<MatchSettlement> {
  const key = fid(fixtureId);
  const [match] = await db
    .select()
    .from(rslPredictionMatches)
    .where(eq(rslPredictionMatches.fixtureId, key));
  const [counted] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(rslPredictions)
    .where(eq(rslPredictions.fixtureId, key));
  return {
    status: match?.status ?? "open",
    finalHome: match?.finalHome ?? null,
    finalAway: match?.finalAway ?? null,
    winnersCount: match?.winnersCount ?? 0,
    pointsPerWinner: match?.pointsPerWinner ?? 0,
    predictionsCount: Number(counted?.total ?? 0),
  };
}

/**
 * لوحة المتصدّرين — الترتيب بمجموع النقاط ثم عدد الإصابات الدقيقة. حسابات
 * مسؤولي النظام مخفيّة عن الزوار وتبقى ظاهرة لصاحبها (نفس سياسة المونديال).
 */
export async function getLeaderboard(limit = 100, viewerUserId?: string) {
  const visibility = viewerUserId
    ? or(notInArray(users.role, [...SUPERUSER_ROLE_NAMES]), eq(rslPredictions.userId, viewerUserId))
    : notInArray(users.role, [...SUPERUSER_ROLE_NAMES]);

  const rows = await db
    .select({
      userId: rslPredictions.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      avatar: users.profileImageUrl,
      totalPoints: sql<number>`coalesce(sum(${rslPredictions.pointsAwarded}), 0)::int`,
      correctCount: sql<number>`count(*) filter (where ${rslPredictions.status} = 'correct')::int`,
      playedCount: sql<number>`count(*) filter (where ${rslPredictions.status} <> 'pending')::int`,
    })
    .from(rslPredictions)
    .innerJoin(users, eq(rslPredictions.userId, users.id))
    .where(visibility)
    .groupBy(rslPredictions.userId, users.firstName, users.lastName, users.profileImageUrl)
    .having(sql`count(*) filter (where ${rslPredictions.status} <> 'pending') > 0`)
    .orderBy(
      desc(sql`coalesce(sum(${rslPredictions.pointsAwarded}), 0)`),
      desc(sql`count(*) filter (where ${rslPredictions.status} = 'correct')`),
    )
    .limit(limit);

  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || "عضو سبق",
    avatar: r.avatar,
    totalPoints: Number(r.totalPoints),
    correctCount: Number(r.correctCount),
    playedCount: Number(r.playedCount),
  }));
}

/**
 * ميتا اللوحة (نسخة المونديال): العدد الكلي للمؤهّلين + صف الزائر ورتبته حتى
 * لو كان خارج الصفحة المعروضة — الرتبة 1 + عدد من يسبقه (النقاط ثم الإصابات).
 */
export async function getLeaderboardMeta(viewerUserId?: string) {
  const visibility = viewerUserId
    ? or(notInArray(users.role, [...SUPERUSER_ROLE_NAMES]), eq(rslPredictions.userId, viewerUserId))
    : notInArray(users.role, [...SUPERUSER_ROLE_NAMES]);

  const board = db
    .select({
      uid: rslPredictions.userId,
      pts: sql<number>`coalesce(sum(${rslPredictions.pointsAwarded}), 0)::int`.as("pts"),
      correct: sql<number>`count(*) filter (where ${rslPredictions.status} = 'correct')::int`.as("correct"),
    })
    .from(rslPredictions)
    .innerJoin(users, eq(rslPredictions.userId, users.id))
    .where(visibility)
    .groupBy(rslPredictions.userId)
    .having(sql`count(*) filter (where ${rslPredictions.status} <> 'pending') > 0`)
    .as("board");

  const [totals] = await db.select({ total: sql<number>`count(*)::int` }).from(board);
  const total = Number(totals?.total ?? 0);
  if (!viewerUserId) return { total, viewer: null };

  const [mine] = await db
    .select({
      pts: sql<number>`coalesce(sum(${rslPredictions.pointsAwarded}), 0)::int`,
      correct: sql<number>`count(*) filter (where ${rslPredictions.status} = 'correct')::int`,
      played: sql<number>`count(*) filter (where ${rslPredictions.status} <> 'pending')::int`,
    })
    .from(rslPredictions)
    .where(eq(rslPredictions.userId, viewerUserId))
    .groupBy(rslPredictions.userId)
    .having(sql`count(*) filter (where ${rslPredictions.status} <> 'pending') > 0`);
  if (!mine) return { total, viewer: null };

  const [ahead] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(board)
    .where(sql`${board.pts} > ${mine.pts} or (${board.pts} = ${mine.pts} and ${board.correct} > ${mine.correct})`);

  return {
    total,
    viewer: {
      userId: viewerUserId,
      rank: Number(ahead?.n ?? 0) + 1,
      totalPoints: Number(mine.pts),
      correctCount: Number(mine.correct),
      playedCount: Number(mine.played),
    },
  };
}

// ---------------------------------------------------------------------------
// محرّك التسوية — كل دقيقة عبر الكرون (نسخة المونديال حرفيًّا)
// ---------------------------------------------------------------------------

export type SettlementSummary = { settled: number; awarded: number; errors: number };

/**
 * يُسوّي المباريات المنتهية ويمنح الفائزين نقاطهم — نفس طبقات الـ idempotency
 * الثلاث في المونديال: settledAt على المباراة، وقيد pending على التوقّعات،
 * وdedup الولاء على source=fixtureId. commit-ثم-award: التسوية ذرّية أولًا
 * ثم المنح خارج المعاملة (آمن للتكرار).
 */
export async function settleFinishedMatches(): Promise<SettlementSummary> {
  const fixtures = await getFixtures(rslComp());
  const finished = fixtures.filter(hasRealFinalScore);
  let settled = 0;
  let awarded = 0;
  let errors = 0;

  for (const fx of finished) {
    try {
      const key = fid(fx.id);
      const [existing] = await db
        .select({ settledAt: rslPredictionMatches.settledAt, pointsPerWinner: rslPredictionMatches.pointsPerWinner })
        .from(rslPredictionMatches)
        .where(eq(rslPredictionMatches.fixtureId, key));

      // لا لقطة ⇒ لا توقّعات على هذه المباراة أصلًا.
      if (!existing) continue;

      let winners: { userId: string }[] = [];
      let pointsPerWinner = 0;

      if (existing.settledAt == null) {
        // ---- Phase A: تسوية ذرّية ----
        const result = await db.transaction(async (tx) => {
          const [locked] = await tx
            .select({ settledAt: rslPredictionMatches.settledAt })
            .from(rslPredictionMatches)
            .where(eq(rslPredictionMatches.fixtureId, key))
            .for("update");
          if (locked?.settledAt != null) return null; // خسرنا السباق — سُوّيت

          const finalHome = fx.goals.home as number;
          const finalAway = fx.goals.away as number;

          const correctRows = await tx
            .select({ userId: rslPredictions.userId })
            .from(rslPredictions)
            .where(
              and(
                eq(rslPredictions.fixtureId, key),
                eq(rslPredictions.predHome, finalHome),
                eq(rslPredictions.predAway, finalAway),
              ),
            );
          const [{ total }] = await tx
            .select({ total: sql<number>`count(*)::int` })
            .from(rslPredictions)
            .where(eq(rslPredictions.fixtureId, key));

          const n = correctRows.length;
          const per = n > 0 ? Math.max(1, Math.floor(POINTS_POOL / n)) : 0;
          const now = new Date();

          if (n > 0) {
            await tx
              .update(rslPredictions)
              .set({ status: "correct", pointsAwarded: per, settledAt: now, updatedAt: now })
              .where(
                and(
                  eq(rslPredictions.fixtureId, key),
                  eq(rslPredictions.predHome, finalHome),
                  eq(rslPredictions.predAway, finalAway),
                  eq(rslPredictions.status, "pending"),
                ),
              );
          }
          await tx
            .update(rslPredictions)
            .set({ status: "incorrect", settledAt: now, updatedAt: now })
            .where(and(eq(rslPredictions.fixtureId, key), eq(rslPredictions.status, "pending")));

          await tx
            .update(rslPredictionMatches)
            .set({
              status: "settled",
              finalHome,
              finalAway,
              winnersCount: n,
              predictionsCount: Number(total ?? 0),
              pointsPerWinner: per,
              settledAt: now,
              updatedAt: now,
            })
            .where(eq(rslPredictionMatches.fixtureId, key));

          return { winners: correctRows, per };
        });

        if (result == null) continue; // سُوّيت في دورة متزامنة
        winners = result.winners;
        pointsPerWinner = result.per;
        settled++;
      } else {
        // مسوّاة مسبقًا — توفيق ما بعد إعادة التشغيل بين A وB.
        const correctRows = await db
          .select({ userId: rslPredictions.userId })
          .from(rslPredictions)
          .where(and(eq(rslPredictions.fixtureId, key), eq(rslPredictions.status, "correct")));
        winners = correctRows;
        pointsPerWinner = existing.pointsPerWinner;
        if (winners.length === 0 || pointsPerWinner <= 0) continue;
      }

      // ---- Phase B: منح النقاط (خارج المعاملة، آمن للتكرار) ----
      for (const w of winners) {
        const outcome = await awardPoints({
          userId: w.userId,
          action: LOYALTY_ACTIONS.RSL_PREDICTION_WIN,
          source: key,
          points: pointsPerWinner,
          metadata: { fixtureId: key, score: `${fx.goals.home}-${fx.goals.away}` },
        });
        if (outcome.awarded) awarded++;
      }
    } catch (err) {
      errors++;
      console.error(`[RSL Predictions] settle failed for fixture ${fx.id}:`, err);
    }
  }

  return { settled, awarded, errors };
}
