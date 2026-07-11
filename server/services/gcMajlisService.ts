/**
 * «مجالس التوقعات» — دوريات خاصة برمز دعوة فوق مسابقة توقّعات خليجي 27.
 *
 * الفكرة الخليجية الأصيلة: أنشئ «مجلسك»، شارك رمزه القصير، ونافس أهل
 * ديوانيتك وزملاء عملك في ترتيب خاص. لا نقاط منفصلة: ترتيب المجلس تجميع
 * لنقاط المسابقة العامة (gc_predictions) مرشّحًا بأعضائه — فأي إصابة تُحسب
 * تلقائيًّا في كل مجالس صاحبها.
 *
 * الحدود: 5 مجالس يملكها المستخدم كحد أقصى، و50 عضوًا للمجلس، والاسم 2–60
 * حرفًا. المالك لا «يغادر» — يحذف المجلس كاملًا (يبقى الأعضاء أحرارًا في
 * البقية). كله خلف علم GC_PREDICTIONS_ENABLED نفسه.
 */
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { db } from "../db";
import { gcBadges, gcDuels, gcMajalis, gcMajlisMembers, gcPredictions, users } from "@shared/schema";
import { enqueueGcMajlisMemberJoinedInTransaction } from "./gcMajlisNotificationsService";
import { resolveMajlisDayChampionUserIds } from "./gcMajlisSocialService";

const MAX_OWNED = 5;
const MAX_MEMBERS = 50;

// أبجدية رمز الدعوة — بلا أحرف/أرقام ملتبسة (0/O، 1/I/L).
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;

function randomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export type GcMajlisResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export interface GcMajlisSummary {
  id: string;
  name: string;
  code: string;
  isOwner: boolean;
  membersCount: number;
  createdAt: string;
  /** true only when this request inserted the membership (create/join). */
  joinedNow: boolean;
}

export interface GcMajlisLeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  avatar: string | null;
  isOwner: boolean;
  /** بطل جولة اليوم في هذا المجلس — يبقى معلّقًا حتى تُسوّى جولة تالية. */
  isDayChampion: boolean;
  totalPoints: number;
  correctCount: number;
  exactCount: number;
  playedCount: number;
}

function displayName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "عضو سبق";
}

/** Transaction-scoped lock that also works when the target row does not exist yet. */
async function advisoryLock(tx: any, scope: string, id: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${scope}:${id}`}))`);
}

function isInviteCodeCollision(error: any): boolean {
  const cause = error?.cause ?? error;
  return cause?.code === "23505" && (
    cause?.constraint === "idx_gc_majlis_code" ||
    String(cause?.message ?? error?.message ?? "").includes("idx_gc_majlis_code")
  );
}

/** إنشاء مجلس جديد — المالك عضو تلقائيًّا، والرمز يُعاد توليده عند التصادم. */
export async function createMajlis(
  userId: string,
  rawName: string,
): Promise<GcMajlisResult<GcMajlisSummary>> {
  const name = (rawName || "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) return { ok: false, reason: "INVALID_NAME" };

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      return await db.transaction(async (tx) => {
        // Serialise the owner-limit check even before a new majlis row exists.
        await advisoryLock(tx, "gc-majlis-owner", userId);
        const owned = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(gcMajalis)
          .where(eq(gcMajalis.ownerId, userId));
        if (Number(owned[0]?.n ?? 0) >= MAX_OWNED) {
          return { ok: false, reason: "LIMIT_OWNED" } as const;
        }

        const [row] = await tx
          .insert(gcMajalis)
          .values({ name, code, ownerId: userId })
          .returning();
        await tx.insert(gcMajlisMembers).values({ majlisId: row.id, userId });
        return {
          ok: true,
          data: {
            id: row.id,
            name: row.name,
            code: row.code,
            isOwner: true,
            membersCount: 1,
            createdAt: row.createdAt.toISOString(),
            joinedNow: true,
          },
        } as const;
      });
    } catch (error: any) {
      // تصادم رمز نادر → محاولة برمز جديد؛ أي خطأ آخر يُرفع.
      if (!isInviteCodeCollision(error)) throw error;
    }
  }
  return { ok: false, reason: "CODE_COLLISION" };
}

/** انضمام برمز دعوة — تكرار الانضمام يعيد المجلس نفسه بلا خطأ. */
export async function joinMajlis(
  userId: string,
  rawCode: string,
): Promise<GcMajlisResult<GcMajlisSummary>> {
  const code = (rawCode || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(code)) return { ok: false, reason: "INVALID_CODE" };

  return db.transaction(async (tx) => {
    const [found] = await tx.select().from(gcMajalis).where(eq(gcMajalis.code, code)).limit(1);
    if (!found) return { ok: false, reason: "NOT_FOUND" } as const;

    await advisoryLock(tx, "gc-majlis", found.id);
    const [majlis] = await tx
      .select()
      .from(gcMajalis)
      .where(eq(gcMajalis.id, found.id))
      .for("update")
      .limit(1);
    if (!majlis) return { ok: false, reason: "NOT_FOUND" } as const;

    const makeSummary = (membersCount: number, joinedNow: boolean): GcMajlisSummary => ({
      id: majlis.id,
      name: majlis.name,
      code: majlis.code,
      isOwner: majlis.ownerId === userId,
      membersCount,
      createdAt: majlis.createdAt.toISOString(),
      joinedNow,
    });

    const [existing] = await tx
      .select({ id: gcMajlisMembers.id })
      .from(gcMajlisMembers)
      .where(and(eq(gcMajlisMembers.majlisId, majlis.id), eq(gcMajlisMembers.userId, userId)))
      .limit(1);

    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(gcMajlisMembers)
      .where(eq(gcMajlisMembers.majlisId, majlis.id));
    const actualCount = Number(n ?? 0);
    if (existing) {
      if (majlis.membersCount !== actualCount) {
        await tx.update(gcMajalis).set({ membersCount: actualCount }).where(eq(gcMajalis.id, majlis.id));
      }
      return { ok: true, data: makeSummary(actualCount, false) } as const;
    }
    if (actualCount >= MAX_MEMBERS) return { ok: false, reason: "FULL" } as const;

    await tx.insert(gcMajlisMembers).values({ majlisId: majlis.id, userId });
    const nextCount = actualCount + 1;
    await tx.update(gcMajalis).set({ membersCount: nextCount }).where(eq(gcMajalis.id, majlis.id));
    if (nextCount >= 10) {
      // مكانة اجتماعية دائمة بلا نقاط: من أوصل مجلسه إلى عشرة أعضاء يحتفظ
      // بوسام «عميد المجلس» حتى لو غادر بعض الأعضاء لاحقًا.
      await tx.insert(gcBadges).values({
        userId: majlis.ownerId,
        badge: `majlis_dean:${majlis.id}`,
        metadata: { majlisId: majlis.id, majlisName: majlis.name, membersReached: nextCount },
      }).onConflictDoNothing();
    }
    await enqueueGcMajlisMemberJoinedInTransaction(tx, majlis.id, userId);
    return { ok: true, data: makeSummary(nextCount, true) } as const;
  });
}

/** مغادرة مجلس (لغير المالك) أو حذفه كاملًا (للمالك). */
export async function leaveMajlis(
  userId: string,
  majlisId: string,
): Promise<GcMajlisResult<{ deleted: boolean }>> {
  return db.transaction(async (tx) => {
    await advisoryLock(tx, "gc-majlis", majlisId);
    const [majlis] = await tx
      .select()
      .from(gcMajalis)
      .where(eq(gcMajalis.id, majlisId))
      .for("update")
      .limit(1);
    if (!majlis) return { ok: false, reason: "NOT_FOUND" } as const;

    // Never cascade-delete an escrowed duel: both participants must settle or
    // explicitly cancel/decline it first so reserved loyalty points cannot vanish.
    const activeDuelWhere = [
      eq(gcDuels.majlisId, majlisId),
      inArray(gcDuels.status, ["pending", "accepted"]),
    ];
    if (majlis.ownerId !== userId) {
      activeDuelWhere.push(or(eq(gcDuels.challengerId, userId), eq(gcDuels.challengedId, userId))!);
    }
    const [activeDuel] = await tx
      .select({ id: gcDuels.id })
      .from(gcDuels)
      .where(and(...activeDuelWhere))
      .limit(1);
    if (activeDuel) return { ok: false, reason: "ACTIVE_DUELS" } as const;

    if (majlis.ownerId === userId) {
      await tx.delete(gcMajlisMembers).where(eq(gcMajlisMembers.majlisId, majlisId));
      await tx.delete(gcMajalis).where(eq(gcMajalis.id, majlisId));
      return { ok: true, data: { deleted: true } } as const;
    }

    const removed = await tx
      .delete(gcMajlisMembers)
      .where(and(eq(gcMajlisMembers.majlisId, majlisId), eq(gcMajlisMembers.userId, userId)))
      .returning({ id: gcMajlisMembers.id });
    if (removed.length === 0) return { ok: false, reason: "NOT_MEMBER" } as const;
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(gcMajlisMembers)
      .where(eq(gcMajlisMembers.majlisId, majlisId));
    await tx.update(gcMajalis).set({ membersCount: Number(n ?? 0) }).where(eq(gcMajalis.id, majlisId));
    return { ok: true, data: { deleted: false } } as const;
  });
}

/** مجالسي — ما أملكه وما انضممت إليه، الأحدث أولًا. */
export async function getMyMajalis(userId: string): Promise<GcMajlisSummary[]> {
  const rows = await db
    .select({
      id: gcMajalis.id,
      name: gcMajalis.name,
      code: gcMajalis.code,
      ownerId: gcMajalis.ownerId,
      membersCount: gcMajalis.membersCount,
      createdAt: gcMajalis.createdAt,
    })
    .from(gcMajlisMembers)
    .innerJoin(gcMajalis, eq(gcMajlisMembers.majlisId, gcMajalis.id))
    .where(eq(gcMajlisMembers.userId, userId))
    .orderBy(desc(gcMajalis.createdAt));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    isOwner: r.ownerId === userId,
    membersCount: r.membersCount,
    createdAt: r.createdAt.toISOString(),
    joinedNow: false,
  }));
}

/**
 * ترتيب مجلس — أعضاؤه مرتّبين بنقاط المسابقة العامة (نفس معايير اللوحة
 * العامة: النقاط ثم الدقيقة ثم الاتجاه). من لم يلعب بعد يظهر بصفر في الذيل
 * (بعكس اللوحة العامة) — في المجلس الصغير حضور الجميع أهم من التأهيل.
 */
export async function getMajlisLeaderboard(
  userId: string,
  majlisId: string,
): Promise<GcMajlisResult<{ majlis: GcMajlisSummary; rows: GcMajlisLeaderboardRow[] }>> {
  const [majlis] = await db.select().from(gcMajalis).where(eq(gcMajalis.id, majlisId)).limit(1);
  if (!majlis) return { ok: false, reason: "NOT_FOUND" };

  const [membership] = await db
    .select({ id: gcMajlisMembers.id })
    .from(gcMajlisMembers)
    .where(and(eq(gcMajlisMembers.majlisId, majlisId), eq(gcMajlisMembers.userId, userId)))
    .limit(1);
  if (!membership) return { ok: false, reason: "NOT_MEMBER" };

  const rows = await db
    .select({
      userId: gcMajlisMembers.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      avatar: users.profileImageUrl,
      joinedAt: gcMajlisMembers.joinedAt,
      totalPoints: sql<number>`coalesce(sum(${gcPredictions.pointsAwarded}), 0)::int`,
      correctCount: sql<number>`count(*) filter (where ${gcPredictions.outcomeHit})::int`,
      exactCount: sql<number>`count(*) filter (where ${gcPredictions.exactHit})::int`,
      playedCount: sql<number>`count(*) filter (where ${gcPredictions.status} in ('correct', 'incorrect'))::int`,
    })
    .from(gcMajlisMembers)
    .innerJoin(users, eq(gcMajlisMembers.userId, users.id))
    .leftJoin(gcPredictions, eq(gcPredictions.userId, gcMajlisMembers.userId))
    .where(eq(gcMajlisMembers.majlisId, majlisId))
    .groupBy(
      gcMajlisMembers.userId,
      gcMajlisMembers.joinedAt,
      users.firstName,
      users.lastName,
      users.profileImageUrl,
    )
    .orderBy(
      desc(sql`coalesce(sum(${gcPredictions.pointsAwarded}), 0)`),
      desc(sql`count(*) filter (where ${gcPredictions.exactHit})`),
      desc(sql`count(*) filter (where ${gcPredictions.outcomeHit})`),
      asc(gcMajlisMembers.joinedAt),
      asc(gcMajlisMembers.userId),
    );

  const dayChampionIds = new Set(
    await resolveMajlisDayChampionUserIds(rows.map((r) => r.userId)),
  );

  return {
    ok: true,
    data: {
      majlis: {
        id: majlis.id,
        name: majlis.name,
        code: majlis.code,
        isOwner: majlis.ownerId === userId,
        membersCount: majlis.membersCount,
        createdAt: majlis.createdAt.toISOString(),
        joinedNow: false,
      },
      rows: rows.map((r, i) => ({
        rank: i + 1,
        userId: r.userId,
        name: displayName(r.firstName, r.lastName),
        avatar: r.avatar,
        isOwner: r.userId === majlis.ownerId,
        isDayChampion: dayChampionIds.has(r.userId),
        totalPoints: Number(r.totalPoints),
        correctCount: Number(r.correctCount),
        exactCount: Number(r.exactCount),
        playedCount: Number(r.playedCount),
      })),
    },
  };
}
