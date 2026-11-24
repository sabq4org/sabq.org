/**
 * فرصة تغيير الموعد الأسبوعي لكاتب الرأي (المنطق الخالص في shared/opinionSlotChange.ts).
 * الإدارة تفتح جولة وتغلقها، والكاتب يغيّر يومه ووقته مرة واحدة في الجولة.
 * القفل الاستشاري يجعل فحص امتلاء اليوم والكتابة خطوة واحدة بين الكتّاب.
 */
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  articles,
  opinionSlotChangeRounds,
  opinionSlotChanges,
  opinionWriterSchedules,
  users,
} from "@shared/schema";
import { OPINION_WRITERS_PER_DAY_CAP } from "@shared/opinionWriterConstants";
import { isRoundOpen, slotChangeTargetError } from "@shared/opinionSlotChange";
import { computeNextSlot, getWriterDayLoads } from "./opinionWritersService";

/** لا يُنقل مقال يحين نشره خلال ساعة، ولا يُنقل إلى موعد قبل ساعة من الآن. */
const MOVE_MIN_LEAD_MS = 60 * 60 * 1000;

export type MovedArticle = { id: string; fromAt: string; toAt: string };

const SLOT_CHANGE_LOCK_KEY = 0x0a5c4a17;

export type SlotChangeRoundInfo = {
  id: string;
  openedAt: string;
  closesAt: string | null;
  note: string | null;
};

export type SlotChangeRecord = {
  fromWeekday: number;
  fromTime: string;
  toWeekday: number;
  toTime: string;
  createdAt: string;
};

export type WriterSlotChangeState = {
  /** جولة مفتوحة الآن (null = لا فرصة متاحة) */
  round: SlotChangeRoundInfo | null;
  /** تغيير الكاتب في هذه الجولة إن استخدمها */
  used: SlotChangeRecord | null;
  current: { weekday: number; publishTime: string } | null;
  canChange: boolean;
  dayLoads?: number[];
  cap: number;
};

function roundInfo(r: typeof opinionSlotChangeRounds.$inferSelect): SlotChangeRoundInfo {
  return {
    id: r.id,
    openedAt: r.openedAt.toISOString(),
    closesAt: r.closesAt ? r.closesAt.toISOString() : null,
    note: r.note,
  };
}

/** آخر جولة لم تُغلق يدويًا، إن كانت مفتوحة الآن. */
export async function getOpenSlotChangeRound(now = new Date()) {
  const [row] = await db
    .select()
    .from(opinionSlotChangeRounds)
    .where(isNull(opinionSlotChangeRounds.closedAt))
    .orderBy(desc(opinionSlotChangeRounds.openedAt))
    .limit(1);
  return row && isRoundOpen(row, now.getTime()) ? row : null;
}

export async function getWriterSlotChangeState(writerId: string, now = new Date()): Promise<WriterSlotChangeState> {
  const [round, [schedule]] = await Promise.all([
    getOpenSlotChangeRound(now),
    db
      .select({
        weekday: opinionWriterSchedules.weekday,
        publishTime: opinionWriterSchedules.publishTime,
        active: opinionWriterSchedules.active,
      })
      .from(opinionWriterSchedules)
      .where(eq(opinionWriterSchedules.writerId, writerId))
      .limit(1),
  ]);
  const current = schedule?.active ? { weekday: schedule.weekday, publishTime: schedule.publishTime } : null;
  if (!round) return { round: null, used: null, current, canChange: false, cap: OPINION_WRITERS_PER_DAY_CAP };

  const [used] = await db
    .select()
    .from(opinionSlotChanges)
    .where(and(eq(opinionSlotChanges.roundId, round.id), eq(opinionSlotChanges.writerId, writerId)))
    .limit(1);
  const canChange = Boolean(current) && !used;
  return {
    round: roundInfo(round),
    used: used
      ? {
          fromWeekday: used.fromWeekday,
          fromTime: used.fromTime,
          toWeekday: used.toWeekday,
          toTime: used.toTime,
          createdAt: used.createdAt.toISOString(),
        }
      : null,
    current,
    canChange,
    dayLoads: canChange ? await getWriterDayLoads() : undefined,
    cap: OPINION_WRITERS_PER_DAY_CAP,
  };
}

type ApplyResult =
  | {
      ok: true;
      from: { weekday: number; publishTime: string };
      to: { weekday: number; publishTime: string };
      roundId: string;
      /** مقالات الكاتب المجدولة التي انتقلت إلى موعده الجديد */
      moved: MovedArticle[];
    }
  | { ok: false; status: number; message: string };

/** الكاتب يعتمد موعده الجديد: مرة واحدة في الجولة، وبعد الموافقة على الإيضاحات. */
export async function applyWriterSlotChange(
  writerId: string,
  input: { weekday: number; time: string; acceptedTerms: boolean },
  now = new Date(),
): Promise<ApplyResult> {
  if (!input.acceptedTerms) return { ok: false, status: 400, message: "اقرأ الإيضاحات ووافق عليها أولًا" };

  return db.transaction(async (tx): Promise<ApplyResult> => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SLOT_CHANGE_LOCK_KEY})`);

    const [round] = await tx
      .select()
      .from(opinionSlotChangeRounds)
      .where(isNull(opinionSlotChangeRounds.closedAt))
      .orderBy(desc(opinionSlotChangeRounds.openedAt))
      .limit(1);
    if (!round || !isRoundOpen(round, now.getTime())) {
      return { ok: false, status: 409, message: "انتهت فرصة تغيير الموعد" };
    }
    const [schedule] = await tx
      .select()
      .from(opinionWriterSchedules)
      .where(eq(opinionWriterSchedules.writerId, writerId))
      .limit(1);
    if (!schedule || !schedule.active) {
      return { ok: false, status: 409, message: "ليس لك موعد أسبوعي بعد، اختر يومك أولًا" };
    }
    const [used] = await tx
      .select({ id: opinionSlotChanges.id })
      .from(opinionSlotChanges)
      .where(and(eq(opinionSlotChanges.roundId, round.id), eq(opinionSlotChanges.writerId, writerId)))
      .limit(1);
    if (used) return { ok: false, status: 409, message: "استخدمت فرصة تغيير الموعد من قبل" };

    const loadRows = await tx
      .select({ weekday: opinionWriterSchedules.weekday, count: sql<number>`count(*)::int` })
      .from(opinionWriterSchedules)
      .where(eq(opinionWriterSchedules.active, true))
      .groupBy(opinionWriterSchedules.weekday);
    const dayLoads = Array(7).fill(0) as number[];
    for (const r of loadRows) dayLoads[r.weekday] = r.count;

    const error = slotChangeTargetError({
      fromWeekday: schedule.weekday,
      fromTime: schedule.publishTime,
      toWeekday: input.weekday,
      toTime: input.time,
      dayLoads,
    });
    if (error) return { ok: false, status: 409, message: error };

    await tx.insert(opinionSlotChanges).values({
      roundId: round.id,
      writerId,
      fromWeekday: schedule.weekday,
      fromTime: schedule.publishTime,
      toWeekday: input.weekday,
      toTime: input.time,
      termsAcceptedAt: now,
    });
    await tx
      .update(opinionWriterSchedules)
      .set({ weekday: input.weekday, publishTime: input.time, updatedBy: writerId, updatedAt: now })
      .where(eq(opinionWriterSchedules.writerId, writerId));

    // النشر القادم على الموعد الجديد: كل مقال مجدول للكاتب (لم يبقَ عليه أقل من ساعة)
    // ينتقل إلى أقرب موعد جديد يحترم الفاصل الأسبوعي بعد آخر نشر، ثم الذي يليه أسبوعًا بأسبوع.
    const leadNow = new Date(now.getTime() + MOVE_MIN_LEAD_MS);
    const upcoming = await tx
      .select({ id: articles.id, scheduledAt: articles.scheduledAt })
      .from(articles)
      .where(and(
        eq(articles.authorId, writerId),
        eq(articles.articleType, "opinion"),
        eq(articles.status, "scheduled"),
        gt(articles.scheduledAt, leadNow),
      ))
      .orderBy(asc(articles.scheduledAt));
    const moved: MovedArticle[] = [];
    if (upcoming.length > 0) {
      const [last] = await tx
        .select({ at: sql<string | null>`max(${articles.publishedAt})` })
        .from(articles)
        .where(and(
          eq(articles.authorId, writerId),
          eq(articles.articleType, "opinion"),
          eq(articles.status, "published"),
        ));
      let floor: Date | null = last?.at ? new Date(last.at) : null;
      for (const a of upcoming) {
        const toAt = computeNextSlot(input.weekday, input.time, floor, leadNow);
        if (!toAt || !a.scheduledAt) break;
        if (toAt.getTime() !== a.scheduledAt.getTime()) {
          await tx.update(articles).set({ scheduledAt: toAt, updatedAt: now }).where(eq(articles.id, a.id));
          moved.push({ id: a.id, fromAt: a.scheduledAt.toISOString(), toAt: toAt.toISOString() });
        }
        floor = toAt;
      }
    }

    return {
      ok: true,
      from: { weekday: schedule.weekday, publishTime: schedule.publishTime },
      to: { weekday: input.weekday, publishTime: input.time },
      roundId: round.id,
      moved,
    };
  });
}

// ── جهة الإدارة ──

export type SlotChangeAdminSummary = {
  round: SlotChangeRoundInfo | null;
  /** آخر جولة (مفتوحة أو مغلقة) وتغييراتها */
  lastRound: (SlotChangeRoundInfo & { closedAt: string | null }) | null;
  changes: Array<SlotChangeRecord & { writerId: string; writerName: string }>;
  eligibleWriters: number;
};

export async function getSlotChangeAdminSummary(now = new Date()): Promise<SlotChangeAdminSummary> {
  const [last] = await db
    .select()
    .from(opinionSlotChangeRounds)
    .orderBy(desc(opinionSlotChangeRounds.openedAt))
    .limit(1);
  const [{ eligible }] = await db
    .select({ eligible: sql<number>`count(*)::int` })
    .from(opinionWriterSchedules)
    .where(eq(opinionWriterSchedules.active, true));
  if (!last) return { round: null, lastRound: null, changes: [], eligibleWriters: eligible };

  const rows = await db
    .select({
      writerId: opinionSlotChanges.writerId,
      firstName: users.firstName,
      lastName: users.lastName,
      fromWeekday: opinionSlotChanges.fromWeekday,
      fromTime: opinionSlotChanges.fromTime,
      toWeekday: opinionSlotChanges.toWeekday,
      toTime: opinionSlotChanges.toTime,
      createdAt: opinionSlotChanges.createdAt,
    })
    .from(opinionSlotChanges)
    .leftJoin(users, eq(users.id, opinionSlotChanges.writerId))
    .where(eq(opinionSlotChanges.roundId, last.id))
    .orderBy(desc(opinionSlotChanges.createdAt));

  return {
    round: isRoundOpen(last, now.getTime()) ? roundInfo(last) : null,
    lastRound: { ...roundInfo(last), closedAt: last.closedAt ? last.closedAt.toISOString() : null },
    changes: rows.map((r) => ({
      writerId: r.writerId,
      writerName: [r.firstName, r.lastName].filter(Boolean).join(" ") || "كاتب",
      fromWeekday: r.fromWeekday,
      fromTime: r.fromTime,
      toWeekday: r.toWeekday,
      toTime: r.toTime,
      createdAt: r.createdAt.toISOString(),
    })),
    eligibleWriters: eligible,
  };
}

/** فتح فرصة جديدة للجميع: تُغلق أي جولة سابقة، فيحق لكل كاتب تغيير واحد جديد. */
export async function openSlotChangeRound(
  adminId: string,
  input: { days: number | null; note: string | null },
  now = new Date(),
): Promise<SlotChangeRoundInfo> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SLOT_CHANGE_LOCK_KEY})`);
    await tx
      .update(opinionSlotChangeRounds)
      .set({ closedAt: now, closedBy: adminId })
      .where(isNull(opinionSlotChangeRounds.closedAt));
    const closesAt = input.days ? new Date(now.getTime() + input.days * 24 * 60 * 60 * 1000) : null;
    const [row] = await tx
      .insert(opinionSlotChangeRounds)
      .values({ openedBy: adminId, openedAt: now, closesAt, note: input.note })
      .returning();
    return roundInfo(row);
  });
}

export async function closeSlotChangeRound(adminId: string, now = new Date()): Promise<number> {
  const closed = await db
    .update(opinionSlotChangeRounds)
    .set({ closedAt: now, closedBy: adminId })
    .where(isNull(opinionSlotChangeRounds.closedAt))
    .returning({ id: opinionSlotChangeRounds.id });
  return closed.length;
}
