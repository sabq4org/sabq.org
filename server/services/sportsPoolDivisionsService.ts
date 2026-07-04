/**
 * Sabq Sports — الأقسام الأسبوعية (Expansion Phase B).
 *
 * يُعيد توزيع المستخدمين النشطين على 4 أقسام أسبوعيًّا (يوم السبت 00:00 بتوقيت
 * الرياض) بناءً على نقاطهم في الأسبوع ISO الجاري. يُعطي إحساس «الدوري» الرياضي
 * بترقية وهبوط بين الأقسام:
 *
 *   1 = النوّاحة   (أعلى 1%)
 *   2 = المحلّلون  (التالي 9%  → مجموع تراكمي 10%)
 *   3 = المتابعون  (التالي 30% → مجموع تراكمي 40%)
 *   4 = الجمهور    (الباقي)
 *
 * المصدر: sports_pool_weekly_points (تُغذّى من settleFinishedMatches عند كل
 * تسوية). الـ snapshot يُؤخَّذ يوم السبت قبل الترقية، ثم تُحدَّث
 * sports_pool_user_divisions بـ upsert.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  sportsPoolWeeklyPoints,
  sportsPoolUserDivisions,
  sportsPoolPredictions,
  notificationsInbox,
} from "@shared/schema";

// ---------------------------------------------------------------------------
// الأقسام — العتبات نسب مئويّة من المتنبّئين النشطين (مرتّبين تنازليًّا).
// ---------------------------------------------------------------------------

export type Division = 1 | 2 | 3 | 4;

export const DIVISION_META: Record<Division, { nameAr: string; emoji: string; color: string }> = {
  1: { nameAr: "النوّاحة",  emoji: "🔮", color: "#7C3AED" },
  2: { nameAr: "المحلّلون", emoji: "⭐", color: "#F59E0B" },
  3: { nameAr: "المتابعون", emoji: "🎯", color: "#3B82F6" },
  4: { nameAr: "الجمهور",   emoji: "👀", color: "#9CA3AF" },
};

// عتبات النسب المئويّة التراكميّة (cumulative) من الأعلى.
const DIVISION_CUTOFFS = [
  { division: 1 as Division, topPct: 0.01 },  // أعلى 1%
  { division: 2 as Division, topPct: 0.10 },  // التالي حتى 10%
  { division: 3 as Division, topPct: 0.40 },  // التالي حتى 40%
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** رقم أسبوع ISO من تاريخ — مطابق لترميز '2026-W27'. */
export function isoWeekId(d: Date = new Date()): string {
  // ISO week date algorithm (الاثنين هو أول أيام الأسبوع).
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // الخميس في نفس أسبوع التاريخ (يُستخدم لحساب سنة ISO).
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNo = 1 + Math.round(
    ((thursday.getTime() - yearStart.getTime()) / 86400000 - 3 + ((yearStart.getUTCDay() + 6) % 7)) / 7,
  );
  return `${thursday.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** أسبوع ISO السابق (لحساب الترقية بنقاط الأسبوع المنتهي). */
export function previousWeekId(d: Date = new Date()): string {
  const prev = new Date(d);
  prev.setUTCDate(prev.getUTCDate() - 7);
  return isoWeekId(prev);
}

// ---------------------------------------------------------------------------
// Weekly points — يُغذّى من settleFinishedMatches عند كل تسوية مباراة.
// ---------------------------------------------------------------------------

/** يُضيف نقاط مباراة مُسوّاة إلى snapshot الأسبوع الجاري للمستخدم. upsert:
 *  إذا لم يكن للمستخدم صفّ في هذا الأسبوع يُنشأ، وإلّا تُزاد النقاط والألعاب.
 *  Idempotent: لا تُستدعى إلّا مرّة لكل تسوية مباراة (حارس settledAt). */
export async function creditWeeklyPoints(
  userId: string,
  fixtureId: number,
  points: number,
  won: boolean,
  weekId: string = isoWeekId(),
): Promise<void> {
  await db
    .insert(sportsPoolWeeklyPoints)
    .values({
      userId,
      weekId,
      points,
      matchesPlayed: 1,
      matchesWon: won ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [sportsPoolWeeklyPoints.userId, sportsPoolWeeklyPoints.weekId],
      set: {
        points: sql`${sportsPoolWeeklyPoints.points} + ${points}`,
        matchesPlayed: sql`${sportsPoolWeeklyPoints.matchesPlayed} + 1`,
        matchesWon: sql`${sportsPoolWeeklyPoints.matchesWon} + ${won ? 1 : 0}`,
        updatedAt: new Date(),
      },
    });
}

// ---------------------------------------------------------------------------
// Recompute — يُستدعى من cron أسبوعيًّا.
// ---------------------------------------------------------------------------

export type DivisionsRecomputeSummary = {
  recomputed: number;
  promoted: number;
  relegated: number;
  weekId: string;
};

/**
 * يُعيد توزيع الأقسام بنقاط أسبوع معيّن. الافتراضي: الأسبوع الجاري `isoWeekId()`
 * (لأنّ أسبوع ISO يبدأ الإثنين وينتهي الأحد، فالترقية يوم السبت تقرأ نفس الأسبوع
 * الذي تضمّن مباريات الأحد-الجمعة). يُحدِّث sports_pool_user_divisions بـ upsert،
 * ويسجّل الترقية/الهبوط في lastPromotedTo / lastRelegatedTo، ويُرسل إشعارًا
 * عند تغيّر القسم.
 *
 * Idempotent: الـ weekId يُستخدم كمفتاح منطقي — إعادة التشغيل في نفس الأسبوع
 * تُعيد الحساب بأمان (upsert).
 */
export async function recomputeDivisions(
  weekId: string = isoWeekId(),
): Promise<DivisionsRecomputeSummary> {
  // رتّب متنبّئي الأسبوع تنازليًّا بالنقاط.
  const rows = await db
    .select({
      userId: sportsPoolWeeklyPoints.userId,
      points: sportsPoolWeeklyPoints.points,
    })
    .from(sportsPoolWeeklyPoints)
    .where(and(
      eq(sportsPoolWeeklyPoints.weekId, weekId),
      sql`${sportsPoolWeeklyPoints.points} > 0`,
    ))
    .orderBy(desc(sportsPoolWeeklyPoints.points));

  const n = rows.length;
  let promoted = 0;
  let relegated = 0;

  if (n === 0) {
    return { recomputed: 0, promoted: 0, relegated: 0, weekId };
  }

  // اجلب الأقسام الحاليّة لكل مستخدم (للمقارنة والترقية/الهبوط).
  const userIds = rows.map((r) => r.userId);
  const current = await db
    .select({
      userId: sportsPoolUserDivisions.userId,
      division: sportsPoolUserDivisions.division,
      seasonPoints: sportsPoolUserDivisions.seasonPoints,
    })
    .from(sportsPoolUserDivisions)
    .where(inArray(sportsPoolUserDivisions.userId, userIds));
  const currentByUser = new Map<string, { division: Division; seasonPoints: number }>(
    current.map((c) => [c.userId, {
      division: c.division as Division,
      seasonPoints: Number(c.seasonPoints ?? 0),
    }]),
  );

  // حساب القسم لكل مستخدم بالنسبة التراكميّة.
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const userId = rows[i].userId;
    const weekPoints = Number(rows[i].points ?? 0);
    const rank = i + 1; // 1-based
    const pct = rank / n;

    let newDivision: Division = 4;
    for (const c of DIVISION_CUTOFFS) {
      if (pct <= c.topPct) {
        newDivision = c.division;
        break;
      }
    }

    const prev = currentByUser.get(userId);
    const prevDivision = prev?.division ?? 4;
    const newSeasonPoints = (prev?.seasonPoints ?? 0) + weekPoints;

    await db
      .insert(sportsPoolUserDivisions)
      .values({
        userId,
        weekId,
        division: newDivision,
        weekPoints,
        seasonPoints: newSeasonPoints,
        lastPromotedTo: newDivision < prevDivision ? newDivision : null,
        lastRelegatedTo: newDivision > prevDivision ? newDivision : null,
        computedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: sportsPoolUserDivisions.userId,
        set: {
          weekId,
          division: newDivision,
          weekPoints,
          seasonPoints: newSeasonPoints,
          lastPromotedTo: newDivision < prevDivision ? newDivision : null,
          lastRelegatedTo: newDivision > prevDivision ? newDivision : null,
          computedAt: now,
          updatedAt: now,
        },
      });

    // إشعار الترقية/الهبوط.
    if (newDivision < prevDivision) {
      promoted++;
      await notifyDivisionChange(userId, newDivision, true);
    } else if (newDivision > prevDivision) {
      relegated++;
      await notifyDivisionChange(userId, newDivision, false);
    }
  }

  return { recomputed: n, promoted, relegated, weekId };
}

/** إشعار ترقية/هبوط قسم — يُرسل فقط عند تغيّر القسم فعلاً. */
async function notifyDivisionChange(userId: string, division: Division, isPromotion: boolean): Promise<void> {
  const meta = DIVISION_META[division];
  try {
    await db.insert(notificationsInbox).values({
      userId,
      type: "SPORTS_DIVISION_CHANGE",
      title: isPromotion ? "🎉 ترقّيت إلى قسم أعلى!" : "📊 تغيّر قسمك",
      body: isPromotion
        ? `أحسنت! صعدت إلى قسم «${meta.nameAr}» ${meta.emoji} — واصل التوقّع!`
        : `انتقلت إلى قسم «${meta.nameAr}» ${meta.emoji} — توقّع بدقّة لتعود للأعلى.`,
      deeplink: "sabqsports://predictions",
      metadata: { division, isPromotion, nameAr: meta.nameAr },
    });
  } catch (err) {
    console.warn(`[Divisions] notify failed for ${userId}:`, err);
  }
}

// ---------------------------------------------------------------------------
// استعلامات قراءة — للـ routes وiOS.
// ---------------------------------------------------------------------------

/** قسم المستخدم الحالي + معلوماته. null إذا لم يكن نشطًا بعد. */
export async function getUserDivision(userId: string): Promise<{
  division: Division;
  weekId: string;
  weekPoints: number;
  seasonPoints: number;
} | null> {
  const [row] = await db
    .select()
    .from(sportsPoolUserDivisions)
    .where(eq(sportsPoolUserDivisions.userId, userId))
    .limit(1);
  if (!row) return null;
  return {
    division: row.division as Division,
    weekId: row.weekId,
    weekPoints: Number(row.weekPoints ?? 0),
    seasonPoints: Number(row.seasonPoints ?? 0),
  };
}

/** أعلى N متنبّئ في قسم معيّن هذا الأسبوع — لعرض لوحات الأقسام. */
export async function getDivisionLeaderboard(
  division: Division,
  weekId: string = isoWeekId(),
  limit = 50,
): Promise<Array<{ userId: string; weekPoints: number; seasonPoints: number }>> {
  const rows = await db
    .select({
      userId: sportsPoolUserDivisions.userId,
      weekPoints: sportsPoolUserDivisions.weekPoints,
      seasonPoints: sportsPoolUserDivisions.seasonPoints,
    })
    .from(sportsPoolUserDivisions)
    .where(and(
      eq(sportsPoolUserDivisions.division, division),
      eq(sportsPoolUserDivisions.weekId, weekId),
    ))
    .orderBy(desc(sportsPoolUserDivisions.weekPoints))
    .limit(limit);
  return rows.map((r) => ({
    userId: r.userId,
    weekPoints: Number(r.weekPoints ?? 0),
    seasonPoints: Number(r.seasonPoints ?? 0),
  }));
}
