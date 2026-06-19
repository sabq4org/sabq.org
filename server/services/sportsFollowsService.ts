/**
 * متابعات الرياضة (المرحلة 3 — الشخصنة).
 *
 * وصول قاعدة البيانات لمتابعات المستخدم للفِرق/البطولات في /sports2. مفصول عن
 * الراوتر التزامًا بـ ADR-001 (الراوتر لا يستورد db). متابعة فريدة لكل
 * (مستخدم، نوع، مرجع) — الإضافة المكرّرة لا تُنشئ صفًّا جديدًا.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { sportsFollows, type SportsFollow } from "@shared/schema";

export type SportsFollowKind = "team" | "competition";

export function isValidFollowKind(kind: unknown): kind is SportsFollowKind {
  return kind === "team" || kind === "competition";
}

export interface AddFollowInput {
  kind: SportsFollowKind;
  refId: string;
  refName: string;
  refLogo?: string | null;
}

/** كل متابعات المستخدم (الأحدث أولًا). */
export async function listFollows(userId: string): Promise<SportsFollow[]> {
  return db
    .select()
    .from(sportsFollows)
    .where(eq(sportsFollows.userId, userId))
    .orderBy(desc(sportsFollows.createdAt));
}

/** إضافة متابعة (idempotent — تتجاهل التكرار وتعيد الصف القائم). */
export async function addFollow(userId: string, input: AddFollowInput): Promise<SportsFollow> {
  const [row] = await db
    .insert(sportsFollows)
    .values({
      userId,
      kind: input.kind,
      refId: input.refId,
      refName: input.refName,
      refLogo: input.refLogo ?? null,
    })
    .onConflictDoNothing({
      target: [sportsFollows.userId, sportsFollows.kind, sportsFollows.refId],
    })
    .returning();

  if (row) return row;

  // كانت موجودة مسبقًا (تجاهل التعارض) — نعيد الصف القائم.
  const [existing] = await db
    .select()
    .from(sportsFollows)
    .where(
      and(
        eq(sportsFollows.userId, userId),
        eq(sportsFollows.kind, input.kind),
        eq(sportsFollows.refId, input.refId),
      ),
    )
    .limit(1);
  return existing;
}

/** إلغاء متابعة. يعيد عدد الصفوف المحذوفة (0 إن لم تكن متابَعة). */
export async function removeFollow(
  userId: string,
  kind: SportsFollowKind,
  refId: string,
): Promise<void> {
  await db
    .delete(sportsFollows)
    .where(
      and(
        eq(sportsFollows.userId, userId),
        eq(sportsFollows.kind, kind),
        eq(sportsFollows.refId, refId),
      ),
    );
}

/** تفعيل/كتم إشعارات متابعة قائمة. */
export async function setFollowNotify(
  userId: string,
  kind: SportsFollowKind,
  refId: string,
  notify: boolean,
): Promise<void> {
  await db
    .update(sportsFollows)
    .set({ notify })
    .where(
      and(
        eq(sportsFollows.userId, userId),
        eq(sportsFollows.kind, kind),
        eq(sportsFollows.refId, refId),
      ),
    );
}

/**
 * معرّفات المستخدمين الذين يتابعون أيًّا من الفِرق المعطاة وإشعاراتهم مفعّلة.
 * تُستخدم في جوب التنبيهات الرياضية لتوجيه إشعار الهدف/النتيجة للمتابعين فقط.
 */
export async function getTeamFollowerUserIds(teamRefIds: string[]): Promise<string[]> {
  if (teamRefIds.length === 0) return [];
  const rows = await db
    .selectDistinct({ userId: sportsFollows.userId })
    .from(sportsFollows)
    .where(
      and(
        eq(sportsFollows.kind, "team"),
        eq(sportsFollows.notify, true),
        inArray(sportsFollows.refId, teamRefIds),
      ),
    );
  return rows.map((r) => r.userId);
}
