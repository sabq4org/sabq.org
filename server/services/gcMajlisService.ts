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
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { gcMajalis, gcMajlisMembers, gcPredictions, users } from "@shared/schema";

const MAX_OWNED = 5;
const MAX_MEMBERS = 50;

// أبجدية رمز الدعوة — بلا أحرف/أرقام ملتبسة (0/O، 1/I/L).
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;

function randomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
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
}

export interface GcMajlisLeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  avatar: string | null;
  isOwner: boolean;
  totalPoints: number;
  correctCount: number;
  exactCount: number;
  playedCount: number;
}

function displayName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "عضو سبق";
}

/** إنشاء مجلس جديد — المالك عضو تلقائيًّا، والرمز يُعاد توليده عند التصادم. */
export async function createMajlis(
  userId: string,
  rawName: string,
): Promise<GcMajlisResult<GcMajlisSummary>> {
  const name = (rawName || "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) return { ok: false, reason: "INVALID_NAME" };

  const owned = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(gcMajalis)
    .where(eq(gcMajalis.ownerId, userId));
  if (Number(owned[0]?.n ?? 0) >= MAX_OWNED) return { ok: false, reason: "LIMIT_OWNED" };

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      const [row] = await db
        .insert(gcMajalis)
        .values({ name, code, ownerId: userId })
        .returning();
      await db.insert(gcMajlisMembers).values({ majlisId: row.id, userId });
      return {
        ok: true,
        data: {
          id: row.id,
          name: row.name,
          code: row.code,
          isOwner: true,
          membersCount: 1,
          createdAt: row.createdAt.toISOString(),
        },
      };
    } catch (error: any) {
      // تصادم رمز نادر → محاولة برمز جديد؛ أي خطأ آخر يُرفع.
      if (!String(error?.message || "").includes("idx_gc_majlis_code")) throw error;
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

  const [majlis] = await db.select().from(gcMajalis).where(eq(gcMajalis.code, code)).limit(1);
  if (!majlis) return { ok: false, reason: "NOT_FOUND" };

  const summary = (membersCount: number): GcMajlisSummary => ({
    id: majlis.id,
    name: majlis.name,
    code: majlis.code,
    isOwner: majlis.ownerId === userId,
    membersCount,
    createdAt: majlis.createdAt.toISOString(),
  });

  const [existing] = await db
    .select({ id: gcMajlisMembers.id })
    .from(gcMajlisMembers)
    .where(and(eq(gcMajlisMembers.majlisId, majlis.id), eq(gcMajlisMembers.userId, userId)))
    .limit(1);
  if (existing) return { ok: true, data: summary(majlis.membersCount) };

  if (majlis.membersCount >= MAX_MEMBERS) return { ok: false, reason: "FULL" };

  await db.insert(gcMajlisMembers).values({ majlisId: majlis.id, userId });
  await db
    .update(gcMajalis)
    .set({ membersCount: sql`${gcMajalis.membersCount} + 1` })
    .where(eq(gcMajalis.id, majlis.id));
  return { ok: true, data: summary(majlis.membersCount + 1) };
}

/** مغادرة مجلس (لغير المالك) أو حذفه كاملًا (للمالك). */
export async function leaveMajlis(
  userId: string,
  majlisId: string,
): Promise<GcMajlisResult<{ deleted: boolean }>> {
  const [majlis] = await db.select().from(gcMajalis).where(eq(gcMajalis.id, majlisId)).limit(1);
  if (!majlis) return { ok: false, reason: "NOT_FOUND" };

  if (majlis.ownerId === userId) {
    await db.delete(gcMajlisMembers).where(eq(gcMajlisMembers.majlisId, majlisId));
    await db.delete(gcMajalis).where(eq(gcMajalis.id, majlisId));
    return { ok: true, data: { deleted: true } };
  }

  const removed = await db
    .delete(gcMajlisMembers)
    .where(and(eq(gcMajlisMembers.majlisId, majlisId), eq(gcMajlisMembers.userId, userId)))
    .returning({ id: gcMajlisMembers.id });
  if (removed.length === 0) return { ok: false, reason: "NOT_MEMBER" };
  await db
    .update(gcMajalis)
    .set({ membersCount: sql`greatest(${gcMajalis.membersCount} - 1, 1)` })
    .where(eq(gcMajalis.id, majlisId));
  return { ok: true, data: { deleted: false } };
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
      totalPoints: sql<number>`coalesce(sum(${gcPredictions.pointsAwarded}), 0)::int`,
      correctCount: sql<number>`count(*) filter (where ${gcPredictions.outcomeHit})::int`,
      exactCount: sql<number>`count(*) filter (where ${gcPredictions.exactHit})::int`,
      playedCount: sql<number>`count(*) filter (where ${gcPredictions.status} <> 'pending')::int`,
    })
    .from(gcMajlisMembers)
    .innerJoin(users, eq(gcMajlisMembers.userId, users.id))
    .leftJoin(gcPredictions, eq(gcPredictions.userId, gcMajlisMembers.userId))
    .where(eq(gcMajlisMembers.majlisId, majlisId))
    .groupBy(gcMajlisMembers.userId, users.firstName, users.lastName, users.profileImageUrl)
    .orderBy(
      desc(sql`coalesce(sum(${gcPredictions.pointsAwarded}), 0)`),
      desc(sql`count(*) filter (where ${gcPredictions.exactHit})`),
      desc(sql`count(*) filter (where ${gcPredictions.outcomeHit})`),
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
      },
      rows: rows.map((r, i) => ({
        rank: i + 1,
        userId: r.userId,
        name: displayName(r.firstName, r.lastName),
        avatar: r.avatar,
        isOwner: r.userId === majlis.ownerId,
        totalPoints: Number(r.totalPoints),
        correctCount: Number(r.correctCount),
        exactCount: Number(r.exactCount),
        playedCount: Number(r.playedCount),
      })),
    },
  };
}
