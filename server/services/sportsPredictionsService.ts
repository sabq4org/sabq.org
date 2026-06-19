/**
 * توقّعات المباريات ولوحة المتصدّرين (المرحلة 4 — المجتمع).
 *
 * وصول قاعدة البيانات لتوقّعات المستخدمين لنتائج مباريات /sports2 ولوحة
 * المتصدّرين. مفصول عن الراوتر التزامًا بـ ADR-001 (الراوتر لا يستورد db).
 *
 * نظام النقاط:
 *   - نتيجة مطابقة تمامًا (السكور صحيح)      → 3 نقاط
 *   - اتجاه صحيح (فوز/تعادل/خسارة) والسكور خطأ → 1 نقطة
 *   - توقّع خاطئ                              → 0
 *
 * التوقّع فريد لكل (مستخدم، مباراة) ويُقفل تعديله عند انطلاق المباراة. التسوية
 * (حساب النقاط) يقوم بها جوب دوري يجلب نتائج المباريات المنتهية من المزوّد.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { sportsPredictions, users, type SportsPrediction } from "@shared/schema";
import { getMatchDetail } from "./saudiLeagueService";

export interface SubmitPredictionInput {
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

/** نتيجة الاتجاه: 1 فوز مستضيف، 0 تعادل، -1 فوز ضيف. */
function outcome(home: number, away: number): number {
  if (home > away) return 1;
  if (home < away) return -1;
  return 0;
}

/** يحسب نقاط توقّع مقابل نتيجة فعلية وفق القواعد الكلاسيكية. */
export function computePoints(
  predHome: number,
  predAway: number,
  actualHome: number,
  actualAway: number,
): number {
  if (predHome === actualHome && predAway === actualAway) return 3;
  if (outcome(predHome, predAway) === outcome(actualHome, actualAway)) return 1;
  return 0;
}

export interface SubmitResult {
  prediction: SportsPrediction;
  locked: false;
}
export interface LockedResult {
  prediction: null;
  locked: true;
}

/**
 * إرسال/تعديل توقّع. التعديل مسموح ما دامت المباراة لم تنطلق بعد (kickoff في
 * المستقبل). إن انطلقت أو انتهت يُرفض التحديث (locked) ويُعاد التوقّع القائم.
 */
export async function submitPrediction(
  userId: string,
  input: SubmitPredictionInput,
): Promise<SubmitResult | LockedResult> {
  const nowSec = Math.floor(Date.now() / 1000);
  const started = input.kickoffTs > 0 && input.kickoffTs <= nowSec;

  const [existing] = await db
    .select()
    .from(sportsPredictions)
    .where(and(eq(sportsPredictions.userId, userId), eq(sportsPredictions.fixtureId, input.fixtureId)))
    .limit(1);

  if (started) {
    // لا إنشاء ولا تعديل بعد الانطلاق — نعيد القائم إن وُجد أو نُعلِم بالإقفال.
    return { prediction: null, locked: true };
  }

  if (existing) {
    const [updated] = await db
      .update(sportsPredictions)
      .set({
        predHome: input.predHome,
        predAway: input.predAway,
        updatedAt: new Date(),
      })
      .where(eq(sportsPredictions.id, existing.id))
      .returning();
    return { prediction: updated, locked: false };
  }

  const [created] = await db
    .insert(sportsPredictions)
    .values({
      userId,
      fixtureId: input.fixtureId,
      kickoffTs: input.kickoffTs,
      competitionSlug: input.competitionSlug ?? null,
      homeId: input.homeId ?? null,
      awayId: input.awayId ?? null,
      homeName: input.homeName,
      awayName: input.awayName,
      homeLogo: input.homeLogo ?? null,
      awayLogo: input.awayLogo ?? null,
      predHome: input.predHome,
      predAway: input.predAway,
    })
    .onConflictDoNothing({
      target: [sportsPredictions.userId, sportsPredictions.fixtureId],
    })
    .returning();

  if (created) return { prediction: created, locked: false };

  // سباق نادر: أُدرج توقّع متزامن — نعيد القائم.
  const [row] = await db
    .select()
    .from(sportsPredictions)
    .where(and(eq(sportsPredictions.userId, userId), eq(sportsPredictions.fixtureId, input.fixtureId)))
    .limit(1);
  return { prediction: row, locked: false };
}

/** توقّع المستخدم لمباراة محدّدة (أو null). */
export async function getMyPrediction(
  userId: string,
  fixtureId: number,
): Promise<SportsPrediction | null> {
  const [row] = await db
    .select()
    .from(sportsPredictions)
    .where(and(eq(sportsPredictions.userId, userId), eq(sportsPredictions.fixtureId, fixtureId)))
    .limit(1);
  return row ?? null;
}

/** كل توقّعات المستخدم (الأحدث أولًا). */
export async function listMyPredictions(userId: string, limit = 50): Promise<SportsPrediction[]> {
  return db
    .select()
    .from(sportsPredictions)
    .where(eq(sportsPredictions.userId, userId))
    .orderBy(desc(sportsPredictions.createdAt))
    .limit(limit);
}

export interface LeaderboardEntry {
  userId: string;
  name: string;
  avatar: string | null;
  totalPoints: number;
  predictions: number;
  exact: number;
  correct: number;
  rank: number;
}

/**
 * لوحة المتصدّرين — تجميع نقاط التوقّعات المُسوّاة لكل مستخدم. period:
 *   - "all"  : كل الأوقات
 *   - "month": آخر 30 يومًا (حسب وقت التسوية)
 *   - "week" : آخر 7 أيام
 */
export async function getLeaderboard(
  period: "all" | "month" | "week" = "all",
  limit = 50,
): Promise<LeaderboardEntry[]> {
  const sinceDays = period === "week" ? 7 : period === "month" ? 30 : null;
  const conditions = [sql`${sportsPredictions.points} IS NOT NULL`];
  if (sinceDays != null) {
    conditions.push(sql`${sportsPredictions.settledAt} >= now() - (${sinceDays} || ' days')::interval`);
  }

  const rows = await db
    .select({
      userId: sportsPredictions.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      profileImageUrl: users.profileImageUrl,
      totalPoints: sql<number>`coalesce(sum(${sportsPredictions.points}), 0)::int`,
      predictions: sql<number>`count(*)::int`,
      exact: sql<number>`count(*) filter (where ${sportsPredictions.points} = 3)::int`,
      correct: sql<number>`count(*) filter (where ${sportsPredictions.points} >= 1)::int`,
    })
    .from(sportsPredictions)
    .innerJoin(users, eq(users.id, sportsPredictions.userId))
    .where(and(...conditions))
    .groupBy(sportsPredictions.userId, users.firstName, users.lastName, users.profileImageUrl)
    .orderBy(sql`coalesce(sum(${sportsPredictions.points}), 0) desc, count(*) filter (where ${sportsPredictions.points} = 3) desc`)
    .limit(limit);

  return rows.map((r, i) => {
    const name = [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || "مستخدم سبق";
    return {
      userId: r.userId,
      name,
      avatar: r.profileImageUrl ?? null,
      totalPoints: Number(r.totalPoints) || 0,
      predictions: Number(r.predictions) || 0,
      exact: Number(r.exact) || 0,
      correct: Number(r.correct) || 0,
      rank: i + 1,
    };
  });
}

/** ملخّص نقاط مستخدم واحد (للعرض الشخصي بجوار اللوحة). */
export async function getUserStats(userId: string): Promise<{
  totalPoints: number;
  predictions: number;
  exact: number;
  correct: number;
}> {
  const [row] = await db
    .select({
      totalPoints: sql<number>`coalesce(sum(${sportsPredictions.points}), 0)::int`,
      predictions: sql<number>`count(*) filter (where ${sportsPredictions.points} IS NOT NULL)::int`,
      exact: sql<number>`count(*) filter (where ${sportsPredictions.points} = 3)::int`,
      correct: sql<number>`count(*) filter (where ${sportsPredictions.points} >= 1)::int`,
    })
    .from(sportsPredictions)
    .where(eq(sportsPredictions.userId, userId));
  return {
    totalPoints: Number(row?.totalPoints) || 0,
    predictions: Number(row?.predictions) || 0,
    exact: Number(row?.exact) || 0,
    correct: Number(row?.correct) || 0,
  };
}

/**
 * تسوية التوقّعات للمباريات المنتهية. يجلب المعرّفات غير المُسوّاة التي مضى على
 * انطلاقها أكثر من 100 دقيقة (نافذة أمان لانتهاء المباراة)، ويجلب نتيجتها من
 * المزوّد، ثم يحسب نقاط كل توقّع. أفضل جهد — أي مباراة لم تنتهِ بعد تُترك للدورة
 * التالية. يعيد عدد التوقّعات المُسوّاة.
 */
export async function settleFinishedPredictions(maxFixtures = 25): Promise<number> {
  const nowSec = Math.floor(Date.now() / 1000);
  const cutoff = nowSec - 100 * 60; // مرّت 100 دقيقة على الانطلاق على الأقل

  const pending = await db
    .selectDistinct({ fixtureId: sportsPredictions.fixtureId })
    .from(sportsPredictions)
    .where(and(isNull(sportsPredictions.settledAt), sql`${sportsPredictions.kickoffTs} <= ${cutoff}`))
    .limit(maxFixtures);

  if (pending.length === 0) return 0;

  let settledCount = 0;
  for (const { fixtureId } of pending) {
    try {
      const detail = await getMatchDetail(fixtureId);
      if (!detail || !detail.fixture.status.finished) continue;
      const actualHome = detail.fixture.goals.home;
      const actualAway = detail.fixture.goals.away;
      if (actualHome == null || actualAway == null) continue;

      const rows = await db
        .select()
        .from(sportsPredictions)
        .where(and(eq(sportsPredictions.fixtureId, fixtureId), isNull(sportsPredictions.settledAt)));

      for (const p of rows) {
        const points = computePoints(p.predHome, p.predAway, actualHome, actualAway);
        await db
          .update(sportsPredictions)
          .set({ points, actualHome, actualAway, settledAt: new Date() })
          .where(eq(sportsPredictions.id, p.id));
        settledCount++;
      }
    } catch (err) {
      console.error(`[SportsPredictions] settle fixture ${fixtureId} failed:`, err);
    }
  }
  return settledCount;
}
