/**
 * مسابقة توقّعات الكؤوس المحلية — محرّك كأس العالم/روشن نفسه، مُعمّمًا ومُوسَّمًا
 * بالبطولة (competition_slug) ليخدم كأس الملك (kings-cup) وكأس السوبر (super-cup)
 * بجدولٍ موحّد واحد — «توحيد» بلا تكرار خدمة لكل بطولة.
 *
 * المستخدم يضع توقّعًا دقيقًا بالأهداف لكل مباراة قبل انطلاقها، ويربح فقط من
 * يصيب النتيجة بالضبط (بترتيب المضيف ثم الضيف — النتيجة المعكوسة لا تفوز). جائزة
 * كل مباراة 500 نقطة ولاء تُقسَّم بالتساوي بين كل المصيبين (floor(500/عدد الفائزين)).
 * لا أحد يصيب ⇒ لا نقاط لتلك المباراة. الكؤوس تسمح بالتعادل في الأدوار المبكّرة
 * (يُحسم بالترجيح) فلا حظر على توقّع التعادل.
 *
 * المباريات لا تُخزَّن — تُجلب حيّة من saudiLeagueService خلف كاش SWR. نخزّن فقط
 * توقّعات المستخدمين (cup_predictions) وحالة تسوية كل مباراة (cup_prediction_matches).
 * التوقّعات طويلة المدى (البطل/الهدّاف) تُدار عبر sportsPoolPredictionsService
 * الموحّد (sports_pool_long) — لا تُكرَّر هنا.
 *
 * ADR-001: هذه الخدمة تملك كل استعلامات Drizzle؛ مسار cupPredictions لا يستورد db.
 */
import { and, desc, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import { cupPredictions, cupPredictionMatches, users } from "@shared/schema";
import { getCompetition, getFixtures, type SaudiCompetition, type SplFixture } from "./saudiLeagueService";
import { awardPoints } from "./loyalty";
import { LOYALTY_ACTIONS } from "@shared/loyalty";
import { SUPERUSER_ROLE_NAMES } from "@shared/rbac-constants";

const POINTS_POOL = 500;

/** يُرجع تعريف البطولة أو يرمي خطأً إن كان السلَق غير مسجَّل في السجلّ السعودي. */
export function cupComp(slug: string): SaudiCompetition {
  const comp = getCompetition(slug);
  if (!comp) throw new Error(`[Cup Predictions] competition '${slug}' missing from registry`);
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

/** مباراة "مقفلة" متى انطلقت أو انتهت أو حان موعدها — حارس مزدوج. */
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
// أنواع الإخراج للواجهة — نفس عقد المونديال/روشن حرفيًّا
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
  slug: string,
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

  const fx = (await getFixtures(cupComp(slug))).find((f) => f.id === fixtureId);
  if (!fx) return { ok: false, reason: "NOT_FOUND" };
  if (isLocked(fx)) return { ok: false, reason: "LOCKED" };

  // لقطة المباراة (open) — نُحدِّث الأسماء/الموعد دون لمس status.
  await db
    .insert(cupPredictionMatches)
    .values({
      fixtureId: fid(fx.id),
      competitionSlug: slug,
      kickoffAt: new Date(fx.timestamp * 1000),
      homeTeamName: fx.home.name,
      homeTeamLogo: fx.home.logo,
      awayTeamName: fx.away.name,
      awayTeamLogo: fx.away.logo,
      status: "open",
    })
    .onConflictDoUpdate({
      target: cupPredictionMatches.fixtureId,
      set: {
        competitionSlug: slug,
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
    .insert(cupPredictions)
    .values({ competitionSlug: slug, fixtureId: fid(fx.id), userId, predHome, predAway })
    .onConflictDoUpdate({
      target: [cupPredictions.fixtureId, cupPredictions.userId],
      set: { predHome, predAway, competitionSlug: slug, updatedAt: new Date() },
    })
    .returning({
      predHome: cupPredictions.predHome,
      predAway: cupPredictions.predAway,
      status: cupPredictions.status,
    });

  return { ok: true, prediction: row };
}

// ---------------------------------------------------------------------------
// قراءات الواجهة
// ---------------------------------------------------------------------------

/** مباريات اليوم والغد (بتوقيت الرياض) + توقّع المستخدم + حالة القفل/التسوية. */
export async function getUpcomingPredictableMatches(
  slug: string,
  userId?: string,
): Promise<PredictableMatch[]> {
  const fixtures = await getFixtures(cupComp(slug));
  const days = new Set([riyadhDateKey(0), riyadhDateKey(1)]);
  const today = fixtures
    .filter((f) => days.has((f.date ?? "").slice(0, 10)))
    .sort((a, b) => a.timestamp - b.timestamp);
  if (today.length === 0) return [];

  const ids = today.map((f) => fid(f.id));

  const countRows = await db
    .select({ fixtureId: cupPredictions.fixtureId, n: sql<number>`count(*)::int` })
    .from(cupPredictions)
    .where(inArray(cupPredictions.fixtureId, ids))
    .groupBy(cupPredictions.fixtureId);
  const countByFixture = new Map(countRows.map((r) => [r.fixtureId, Number(r.n)]));

  const matchRows = await db
    .select()
    .from(cupPredictionMatches)
    .where(inArray(cupPredictionMatches.fixtureId, ids));
  const matchByFixture = new Map(matchRows.map((m) => [m.fixtureId, m]));

  const myByFixture = new Map<string, MyPrediction>();
  if (userId) {
    const mine = await db
      .select({
        fixtureId: cupPredictions.fixtureId,
        predHome: cupPredictions.predHome,
        predAway: cupPredictions.predAway,
        status: cupPredictions.status,
        pointsAwarded: cupPredictions.pointsAwarded,
      })
      .from(cupPredictions)
      .where(and(eq(cupPredictions.userId, userId), inArray(cupPredictions.fixtureId, ids)));
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

/** سجل توقّعات المستخدم كاملًا للبطولة — يُبنى من اللقطة بلا نداء API حيّ. */
export async function getMyPredictions(slug: string, userId: string) {
  return db
    .select({
      fixtureId: cupPredictions.fixtureId,
      predHome: cupPredictions.predHome,
      predAway: cupPredictions.predAway,
      status: cupPredictions.status,
      pointsAwarded: cupPredictions.pointsAwarded,
      createdAt: cupPredictions.createdAt,
      kickoffAt: cupPredictionMatches.kickoffAt,
      homeTeamName: cupPredictionMatches.homeTeamName,
      homeTeamLogo: cupPredictionMatches.homeTeamLogo,
      awayTeamName: cupPredictionMatches.awayTeamName,
      awayTeamLogo: cupPredictionMatches.awayTeamLogo,
      finalHome: cupPredictionMatches.finalHome,
      finalAway: cupPredictionMatches.finalAway,
      matchStatus: cupPredictionMatches.status,
      winnersCount: cupPredictionMatches.winnersCount,
      pointsPerWinner: cupPredictionMatches.pointsPerWinner,
    })
    .from(cupPredictions)
    .leftJoin(cupPredictionMatches, eq(cupPredictions.fixtureId, cupPredictionMatches.fixtureId))
    .where(and(eq(cupPredictions.userId, userId), eq(cupPredictions.competitionSlug, slug)))
    .orderBy(desc(cupPredictionMatches.kickoffAt));
}

/** عدّادات مباراة + نتيجتها إن سُوّيت — لا نكشف توقّعات الآخرين الفردية. */
export async function getMatchPredictionsSummary(fixtureId: number): Promise<MatchSettlement> {
  const key = fid(fixtureId);
  const [match] = await db
    .select()
    .from(cupPredictionMatches)
    .where(eq(cupPredictionMatches.fixtureId, key));
  const [counted] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(cupPredictions)
    .where(eq(cupPredictions.fixtureId, key));
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
 * لوحة المتصدّرين للبطولة — الترتيب بمجموع النقاط ثم عدد الإصابات الدقيقة.
 * حسابات مسؤولي النظام مخفيّة عن الزوار وتبقى ظاهرة لصاحبها (سياسة المونديال).
 */
export async function getLeaderboard(slug: string, limit = 100, viewerUserId?: string) {
  const compCond = eq(cupPredictions.competitionSlug, slug);
  const visibility = viewerUserId
    ? or(notInArray(users.role, [...SUPERUSER_ROLE_NAMES]), eq(cupPredictions.userId, viewerUserId))
    : notInArray(users.role, [...SUPERUSER_ROLE_NAMES]);

  const rows = await db
    .select({
      userId: cupPredictions.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      avatar: users.profileImageUrl,
      totalPoints: sql<number>`coalesce(sum(${cupPredictions.pointsAwarded}), 0)::int`,
      correctCount: sql<number>`count(*) filter (where ${cupPredictions.status} = 'correct')::int`,
      playedCount: sql<number>`count(*) filter (where ${cupPredictions.status} <> 'pending')::int`,
    })
    .from(cupPredictions)
    .innerJoin(users, eq(cupPredictions.userId, users.id))
    .where(and(compCond, visibility))
    .groupBy(cupPredictions.userId, users.firstName, users.lastName, users.profileImageUrl)
    .having(sql`count(*) filter (where ${cupPredictions.status} <> 'pending') > 0`)
    .orderBy(
      desc(sql`coalesce(sum(${cupPredictions.pointsAwarded}), 0)`),
      desc(sql`count(*) filter (where ${cupPredictions.status} = 'correct')`),
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
export async function getLeaderboardMeta(slug: string, viewerUserId?: string) {
  const compCond = eq(cupPredictions.competitionSlug, slug);
  const visibility = viewerUserId
    ? or(notInArray(users.role, [...SUPERUSER_ROLE_NAMES]), eq(cupPredictions.userId, viewerUserId))
    : notInArray(users.role, [...SUPERUSER_ROLE_NAMES]);

  const board = db
    .select({
      uid: cupPredictions.userId,
      pts: sql<number>`coalesce(sum(${cupPredictions.pointsAwarded}), 0)::int`.as("pts"),
      correct: sql<number>`count(*) filter (where ${cupPredictions.status} = 'correct')::int`.as("correct"),
    })
    .from(cupPredictions)
    .innerJoin(users, eq(cupPredictions.userId, users.id))
    .where(and(compCond, visibility))
    .groupBy(cupPredictions.userId)
    .having(sql`count(*) filter (where ${cupPredictions.status} <> 'pending') > 0`)
    .as("board");

  const [totals] = await db.select({ total: sql<number>`count(*)::int` }).from(board);
  const total = Number(totals?.total ?? 0);
  if (!viewerUserId) return { total, viewer: null };

  const [mine] = await db
    .select({
      pts: sql<number>`coalesce(sum(${cupPredictions.pointsAwarded}), 0)::int`,
      correct: sql<number>`count(*) filter (where ${cupPredictions.status} = 'correct')::int`,
      played: sql<number>`count(*) filter (where ${cupPredictions.status} <> 'pending')::int`,
    })
    .from(cupPredictions)
    .where(and(compCond, eq(cupPredictions.userId, viewerUserId)))
    .groupBy(cupPredictions.userId)
    .having(sql`count(*) filter (where ${cupPredictions.status} <> 'pending') > 0`);
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
// محرّك التسوية — كل دقيقة عبر الكرون (نسخة المونديال/روشن حرفيًّا)
// ---------------------------------------------------------------------------

export type SettlementSummary = { settled: number; awarded: number; errors: number };

/**
 * يُسوّي مباريات البطولة المنتهية ويمنح الفائزين نقاطهم — نفس طبقات الـ idempotency
 * الثلاث: settledAt على المباراة، وقيد pending على التوقّعات، وdedup الولاء على
 * المصدر cup:<slug>:<fixtureId>. commit-ثم-award: التسوية ذرّية أولًا ثم المنح
 * خارج المعاملة (آمن للتكرار). الإصابة تُطابق النتيجة بترتيب المضيف/الضيف بالضبط.
 */
export async function settleFinishedMatches(slug: string): Promise<SettlementSummary> {
  const fixtures = await getFixtures(cupComp(slug));
  const finished = fixtures.filter(hasRealFinalScore);
  let settled = 0;
  let awarded = 0;
  let errors = 0;

  for (const fx of finished) {
    try {
      const key = fid(fx.id);
      const [existing] = await db
        .select({ settledAt: cupPredictionMatches.settledAt, pointsPerWinner: cupPredictionMatches.pointsPerWinner })
        .from(cupPredictionMatches)
        .where(eq(cupPredictionMatches.fixtureId, key));

      // لا لقطة ⇒ لا توقّعات على هذه المباراة أصلًا.
      if (!existing) continue;

      let winners: { userId: string }[] = [];
      let pointsPerWinner = 0;

      if (existing.settledAt == null) {
        // ---- Phase A: تسوية ذرّية ----
        const result = await db.transaction(async (tx) => {
          const [locked] = await tx
            .select({ settledAt: cupPredictionMatches.settledAt })
            .from(cupPredictionMatches)
            .where(eq(cupPredictionMatches.fixtureId, key))
            .for("update");
          if (locked?.settledAt != null) return null; // خسرنا السباق — سُوّيت

          const finalHome = fx.goals.home as number;
          const finalAway = fx.goals.away as number;

          const correctRows = await tx
            .select({ userId: cupPredictions.userId })
            .from(cupPredictions)
            .where(
              and(
                eq(cupPredictions.fixtureId, key),
                eq(cupPredictions.predHome, finalHome),
                eq(cupPredictions.predAway, finalAway),
              ),
            );
          const [{ total }] = await tx
            .select({ total: sql<number>`count(*)::int` })
            .from(cupPredictions)
            .where(eq(cupPredictions.fixtureId, key));

          const n = correctRows.length;
          const per = n > 0 ? Math.max(1, Math.floor(POINTS_POOL / n)) : 0;
          const now = new Date();

          if (n > 0) {
            await tx
              .update(cupPredictions)
              .set({ status: "correct", pointsAwarded: per, settledAt: now, updatedAt: now })
              .where(
                and(
                  eq(cupPredictions.fixtureId, key),
                  eq(cupPredictions.predHome, finalHome),
                  eq(cupPredictions.predAway, finalAway),
                  eq(cupPredictions.status, "pending"),
                ),
              );
          }
          await tx
            .update(cupPredictions)
            .set({ status: "incorrect", settledAt: now, updatedAt: now })
            .where(and(eq(cupPredictions.fixtureId, key), eq(cupPredictions.status, "pending")));

          await tx
            .update(cupPredictionMatches)
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
            .where(eq(cupPredictionMatches.fixtureId, key));

          return { winners: correctRows, per };
        });

        if (result == null) continue; // سُوّيت في دورة متزامنة
        winners = result.winners;
        pointsPerWinner = result.per;
        settled++;
      } else {
        // مسوّاة مسبقًا — توفيق ما بعد إعادة التشغيل بين A وB.
        const correctRows = await db
          .select({ userId: cupPredictions.userId })
          .from(cupPredictions)
          .where(and(eq(cupPredictions.fixtureId, key), eq(cupPredictions.status, "correct")));
        winners = correctRows;
        pointsPerWinner = existing.pointsPerWinner;
        if (winners.length === 0 || pointsPerWinner <= 0) continue;
      }

      // ---- Phase B: منح النقاط (خارج المعاملة، آمن للتكرار) ----
      for (const w of winners) {
        const outcome = await awardPoints({
          userId: w.userId,
          action: LOYALTY_ACTIONS.SPORTS_PREDICTION_WIN,
          source: `cup:${slug}:${key}`,
          points: pointsPerWinner,
          metadata: { competitionSlug: slug, fixtureId: key, score: `${fx.goals.home}-${fx.goals.away}` },
        });
        if (outcome.awarded) awarded++;
      }
    } catch (err) {
      errors++;
      console.error(`[Cup Predictions:${slug}] settle failed for fixture ${fx.id}:`, err);
    }
  }

  return { settled, awarded, errors };
}
