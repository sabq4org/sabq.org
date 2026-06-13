/**
 * مسابقة توقّعات مباريات كأس العالم 2026.
 *
 * المستخدم يضع توقّعًا دقيقًا بالأهداف لكل مباراة قبل انطلاقها، ويربح فقط من
 * يصيب النتيجة بالضبط. جائزة كل مباراة 500 نقطة ولاء تُقسَّم بالتساوي بين كل
 * المصيبين (floor(500/عدد الفائزين)). الباقي من القسمة يُسقَط (أبسط وأضمن
 * للـ idempotency). لا أحد يصيب ⇒ لا نقاط لتلك المباراة.
 *
 * المباريات لا تُخزَّن — تُجلب حيّة من worldCupService خلف كاش SWR. نخزّن فقط
 * توقّعات المستخدمين (wc_predictions) وحالة تسوية كل مباراة (wc_prediction_matches).
 *
 * ADR-001: هذه الخدمة تملك كل استعلامات Drizzle؛ مسار wcPredictions لا يستورد db.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { wcPredictions, wcPredictionMatches, users } from "@shared/schema";
import { getFixtures, type WcFixture } from "./worldCupService";
import { WC_FINISHED_STATUSES, WC_LIVE_STATUSES } from "./worldCupNames";
import { awardPoints } from "./loyalty";
import { LOYALTY_ACTIONS } from "@shared/loyalty";

const POINTS_POOL = 500;

/** معرّف المباراة الرقمي عند المزود يُخزَّن نصًّا (مفتاح الـ dedup في الولاء). */
const fid = (fixtureId: number | string): string => String(fixtureId);

/** "اليوم" بتوقيت الرياض — تواريخ المزود تصل أصلًا بإزاحة +03:00. */
function riyadhTodayKey(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * مباراة "مقفلة" متى انطلقت أو انتهت أو حان موعدها — حارس مزدوج: حالة المزود
 * (live/finished) تُغلق فور رفعها، وفحص الطابع الزمني يُغلق الفجوة التي يتأخر
 * فيها المزود عن قلب الحالة NS→1H.
 */
function isLocked(fx: WcFixture): boolean {
  if (WC_LIVE_STATUSES.has(fx.status.code) || WC_FINISHED_STATUSES.has(fx.status.code)) return true;
  return Date.now() >= fx.timestamp * 1000; // timestamp بالثواني
}

/**
 * تُسوّى فقط المباريات ذات نتيجة فعلية على أرض الملعب: FT/AET/PEN مع goals
 * موجودة. AWD/WO (فوز إداري/انسحاب) ضمن "المنتهية" لكن بلا نتيجة حقيقية فتُستبعد.
 * في الترجيح (PEN) نطابق على goals (النظامي/الإضافي) متجاهلين ركلات الترجيح.
 */
function hasRealFinalScore(fx: WcFixture): boolean {
  const settleable = new Set(["FT", "AET", "PEN"]);
  return settleable.has(fx.status.code) && fx.goals.home != null && fx.goals.away != null;
}

// ---------------------------------------------------------------------------
// أنواع الإخراج للواجهة
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
  fixture: WcFixture;
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

  const fx = (await getFixtures()).find((f) => f.id === fixtureId);
  if (!fx) return { ok: false, reason: "NOT_FOUND" };
  if (isLocked(fx)) return { ok: false, reason: "LOCKED" };

  // لقطة المباراة (open) — نُحدِّث الأسماء/الموعد دون لمس status كي لا نُحيي
  // مباراة مُسوّاة (مستحيل هنا لأنها مقفلة، لكنه احتياط دفاعي).
  await db
    .insert(wcPredictionMatches)
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
      target: wcPredictionMatches.fixtureId,
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
    .insert(wcPredictions)
    .values({ fixtureId: fid(fx.id), userId, predHome, predAway })
    .onConflictDoUpdate({
      target: [wcPredictions.fixtureId, wcPredictions.userId],
      set: { predHome, predAway, updatedAt: new Date() },
    })
    .returning({
      predHome: wcPredictions.predHome,
      predAway: wcPredictions.predAway,
      status: wcPredictions.status,
    });

  return { ok: true, prediction: row };
}

// ---------------------------------------------------------------------------
// قراءات الواجهة
// ---------------------------------------------------------------------------

/** مباريات اليوم + توقّع المستخدم + حالة القفل/التسوية + عدد المشاركين. */
export async function getTodayPredictableMatches(userId?: string): Promise<PredictableMatch[]> {
  const fixtures = await getFixtures();
  const todayKey = riyadhTodayKey();
  const today = fixtures.filter((f) => (f.date ?? "").slice(0, 10) === todayKey);
  if (today.length === 0) return [];

  const ids = today.map((f) => fid(f.id));

  // عدد التوقّعات لكل مباراة (إشارة تفاعل) — تجميع واحد.
  const countRows = await db
    .select({ fixtureId: wcPredictions.fixtureId, n: sql<number>`count(*)::int` })
    .from(wcPredictions)
    .where(inArray(wcPredictions.fixtureId, ids))
    .groupBy(wcPredictions.fixtureId);
  const countByFixture = new Map(countRows.map((r) => [r.fixtureId, Number(r.n)]));

  // لقطات التسوية للمباريات المنتهية اليوم.
  const matchRows = await db
    .select()
    .from(wcPredictionMatches)
    .where(inArray(wcPredictionMatches.fixtureId, ids));
  const matchByFixture = new Map(matchRows.map((m) => [m.fixtureId, m]));

  // توقّع المستخدم الحالي (إن وُجد).
  const myByFixture = new Map<string, MyPrediction>();
  if (userId) {
    const mine = await db
      .select({
        fixtureId: wcPredictions.fixtureId,
        predHome: wcPredictions.predHome,
        predAway: wcPredictions.predAway,
        status: wcPredictions.status,
        pointsAwarded: wcPredictions.pointsAwarded,
      })
      .from(wcPredictions)
      .where(and(eq(wcPredictions.userId, userId), inArray(wcPredictions.fixtureId, ids)));
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
      fixtureId: wcPredictions.fixtureId,
      predHome: wcPredictions.predHome,
      predAway: wcPredictions.predAway,
      status: wcPredictions.status,
      pointsAwarded: wcPredictions.pointsAwarded,
      createdAt: wcPredictions.createdAt,
      kickoffAt: wcPredictionMatches.kickoffAt,
      homeTeamName: wcPredictionMatches.homeTeamName,
      homeTeamLogo: wcPredictionMatches.homeTeamLogo,
      awayTeamName: wcPredictionMatches.awayTeamName,
      awayTeamLogo: wcPredictionMatches.awayTeamLogo,
      finalHome: wcPredictionMatches.finalHome,
      finalAway: wcPredictionMatches.finalAway,
      matchStatus: wcPredictionMatches.status,
      winnersCount: wcPredictionMatches.winnersCount,
      pointsPerWinner: wcPredictionMatches.pointsPerWinner,
    })
    .from(wcPredictions)
    .leftJoin(wcPredictionMatches, eq(wcPredictions.fixtureId, wcPredictionMatches.fixtureId))
    .where(eq(wcPredictions.userId, userId))
    .orderBy(desc(wcPredictionMatches.kickoffAt));
}

/** عدّادات مباراة + نتيجتها إن سُوّيت — لا نكشف توقّعات الآخرين الفردية. */
export async function getMatchPredictionsSummary(fixtureId: number): Promise<MatchSettlement> {
  const key = fid(fixtureId);
  const [match] = await db
    .select()
    .from(wcPredictionMatches)
    .where(eq(wcPredictionMatches.fixtureId, key));
  const [counted] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(wcPredictions)
    .where(eq(wcPredictions.fixtureId, key));
  return {
    status: match?.status ?? "open",
    finalHome: match?.finalHome ?? null,
    finalAway: match?.finalAway ?? null,
    winnersCount: match?.winnersCount ?? 0,
    pointsPerWinner: match?.pointsPerWinner ?? 0,
    predictionsCount: Number(counted?.total ?? 0),
  };
}

/** لوحة المتصدّرين — الترتيب بمجموع النقاط المكسوبة ثم عدد الإصابات الدقيقة. */
export async function getLeaderboard(limit = 100) {
  const rows = await db
    .select({
      userId: wcPredictions.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      avatar: users.profileImageUrl,
      totalPoints: sql<number>`coalesce(sum(${wcPredictions.pointsAwarded}), 0)::int`,
      correctCount: sql<number>`count(*) filter (where ${wcPredictions.status} = 'correct')::int`,
      playedCount: sql<number>`count(*) filter (where ${wcPredictions.status} <> 'pending')::int`,
    })
    .from(wcPredictions)
    .innerJoin(users, eq(wcPredictions.userId, users.id))
    .groupBy(wcPredictions.userId, users.firstName, users.lastName, users.profileImageUrl)
    .having(sql`count(*) filter (where ${wcPredictions.status} <> 'pending') > 0`)
    .orderBy(
      desc(sql`coalesce(sum(${wcPredictions.pointsAwarded}), 0)`),
      desc(sql`count(*) filter (where ${wcPredictions.status} = 'correct')`),
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

// ---------------------------------------------------------------------------
// محرّك التسوية — كل دقيقة عبر الكرون
// ---------------------------------------------------------------------------

export type SettlementSummary = { settled: number; awarded: number; errors: number };

/**
 * يُسوّي المباريات المنتهية ويمنح الفائزين نقاطهم.
 *
 * idempotency ثلاث طبقات:
 *   1) settledAt على صف المباراة (المرساة) — لا نعيد التسوية إن كان مضبوطًا.
 *   2) تحديث التوقّعات مقيّد بـ status='pending' — لا نقلب صفًّا مسوّى.
 *   3) dedup awardPoints على source=fixtureId — لكل (مستخدم، مباراة) مرة واحدة أبدًا.
 *
 * ترتيب حاسم: لا نستدعي awardPoints داخل معاملة التسوية (هو يفتح معاملته
 * الخاصة). نلتزم بـ commit-ثم-award: Phase A تكتب النتيجة وتعلّم المباراة
 * مُسوّاة ذرّيًا، وPhase B تمنح النقاط بعدها (آمنة للتكرار عبر الـ dedup).
 */
export async function settleFinishedMatches(): Promise<SettlementSummary> {
  const fixtures = await getFixtures();
  const finished = fixtures.filter(hasRealFinalScore);
  let settled = 0;
  let awarded = 0;
  let errors = 0;

  for (const fx of finished) {
    try {
      const key = fid(fx.id);
      const [existing] = await db
        .select({ settledAt: wcPredictionMatches.settledAt, pointsPerWinner: wcPredictionMatches.pointsPerWinner })
        .from(wcPredictionMatches)
        .where(eq(wcPredictionMatches.fixtureId, key));

      // لا لقطة ⇒ لا توقّعات على هذه المباراة أصلًا (اللقطة تُنشأ عند أول توقّع).
      if (!existing) continue;

      let winners: { userId: string }[] = [];
      let pointsPerWinner = 0;

      if (existing.settledAt == null) {
        // ---- Phase A: تسوية ذرّية ----
        const result = await db.transaction(async (tx) => {
          const [locked] = await tx
            .select({ settledAt: wcPredictionMatches.settledAt })
            .from(wcPredictionMatches)
            .where(eq(wcPredictionMatches.fixtureId, key))
            .for("update");
          if (locked?.settledAt != null) return null; // خسرنا السباق — سُوّيت

          const finalHome = fx.goals.home as number;
          const finalAway = fx.goals.away as number;

          const correctRows = await tx
            .select({ userId: wcPredictions.userId })
            .from(wcPredictions)
            .where(
              and(
                eq(wcPredictions.fixtureId, key),
                eq(wcPredictions.predHome, finalHome),
                eq(wcPredictions.predAway, finalAway),
              ),
            );
          const [{ total }] = await tx
            .select({ total: sql<number>`count(*)::int` })
            .from(wcPredictions)
            .where(eq(wcPredictions.fixtureId, key));

          const n = correctRows.length;
          // max(1,…) يضمن نقطة لكل فائز حتى لو فاق عددهم 500 (awardPoints يرفض ≤0).
          const per = n > 0 ? Math.max(1, Math.floor(POINTS_POOL / n)) : 0;
          const now = new Date();

          // الفائزون: correct + النقاط. مقيّد بـ pending (الطبقة 2).
          if (n > 0) {
            await tx
              .update(wcPredictions)
              .set({ status: "correct", pointsAwarded: per, settledAt: now, updatedAt: now })
              .where(
                and(
                  eq(wcPredictions.fixtureId, key),
                  eq(wcPredictions.predHome, finalHome),
                  eq(wcPredictions.predAway, finalAway),
                  eq(wcPredictions.status, "pending"),
                ),
              );
          }
          // البقية pending ⇒ خاطئة.
          await tx
            .update(wcPredictions)
            .set({ status: "incorrect", settledAt: now, updatedAt: now })
            .where(and(eq(wcPredictions.fixtureId, key), eq(wcPredictions.status, "pending")));

          await tx
            .update(wcPredictionMatches)
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
            .where(eq(wcPredictionMatches.fixtureId, key));

          return { winners: correctRows, per };
        });

        if (result == null) continue; // سُوّيت في دورة متزامنة
        winners = result.winners;
        pointsPerWinner = result.per;
        settled++;
      } else {
        // مسوّاة مسبقًا — توفيق: قد يكون البود مات بين A وB. نعيد اشتقاق الفائزين
        // من الصفوف الثابتة؛ dedup يجعل إعادة المنح مجانية لمن دُفع له.
        const correctRows = await db
          .select({ userId: wcPredictions.userId })
          .from(wcPredictions)
          .where(and(eq(wcPredictions.fixtureId, key), eq(wcPredictions.status, "correct")));
        winners = correctRows;
        pointsPerWinner = existing.pointsPerWinner;
        if (winners.length === 0 || pointsPerWinner <= 0) continue;
      }

      // ---- Phase B: منح النقاط (خارج المعاملة، آمن للتكرار) ----
      for (const w of winners) {
        const outcome = await awardPoints({
          userId: w.userId,
          action: LOYALTY_ACTIONS.WC_PREDICTION_WIN,
          source: key, // مفتاح الـ dedup — مرة واحدة لكل (مستخدم، مباراة)
          points: pointsPerWinner,
          metadata: { fixtureId: key, score: `${fx.goals.home}-${fx.goals.away}` },
        });
        if (outcome.awarded) awarded++;
        // awarded=false reason=DEDUP على إعادة التشغيل = سلوك صحّي متوقّع لا خطأ.
      }
    } catch (err) {
      errors++;
      console.error(`[WC Predictions] settle failed for fixture ${fx.id}:`, err);
      // نكمل — مباراة واحدة فاشلة يجب ألا توقف البقية.
    }
  }

  return { settled, awarded, errors };
}
