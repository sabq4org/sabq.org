/**
 * مزادات إنفاذ — استعلامات Drizzle. المسارات لا تستورد db.
 * دورة الأسبوع: draft → pending (إرسال إنفاذ) → approved (اعتماد سبق) أو returned (إعادة بملاحظة).
 * أي حفظ يعيد الأسبوع مسودة، والصفحة العامة تبقى على لقطة آخر اعتماد حتى يُعتمد من جديد.
 * كل كتابة تُسجل في infath_changes.
 */
import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { infathChanges, infathWeeks, users, type InfathWeekRow } from "@shared/schema";
import {
  INFATH_STALE_MESSAGE,
  auctionsWriteSchema,
  buildPublicView,
  createWeekSchema,
  normalizeAuctions,
  returnWeekSchema,
  reviewActionSchema,
  pickCurrentWeek,
  riyadhToday,
  summarizeWeek,
  weekEndOf,
  type InfathAuction,
  type InfathPublishedIndexRow,
  type InfathPublicView,
  type InfathWeekStatus,
  type InfathWeekSummary,
} from "@shared/infath";
import { db } from "../db";

export class InfathError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type InfathWeekListItem = {
  id: string;
  weekStart: string;
  weekEnd: string;
  status: InfathWeekStatus;
  auctionsCount: number;
  reviewNote: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

export type InfathChangeItem = {
  id: string;
  action: string;
  note: string | null;
  actorName: string | null;
  createdAt: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export type InfathWeekDetail = InfathWeekListItem & {
  auctions: InfathAuction[];
  publishedAuctions: InfathAuction[] | null;
  submittedAt: string | null;
  approvedAt: string | null;
  submittedByName: string | null;
  approvedByName: string | null;
  changes: InfathChangeItem[];
};

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function day(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function asStatus(value: string): InfathWeekStatus {
  return value === "pending" || value === "returned" || value === "approved" ? value : "draft";
}

function asAuctions(value: unknown): InfathAuction[] {
  return Array.isArray(value) ? (value as InfathAuction[]) : [];
}

function isStale(expected: string | null | undefined, current: Date | string): boolean {
  if (!expected) return false;
  return new Date(expected).getTime() !== new Date(current).getTime();
}

function listItem(row: Pick<InfathWeekRow, "id" | "weekStart" | "weekEnd" | "status" | "reviewNote" | "publishedAt" | "updatedAt">, auctionsCount: number): InfathWeekListItem {
  return {
    id: row.id,
    weekStart: day(row.weekStart),
    weekEnd: day(row.weekEnd),
    status: asStatus(row.status),
    auctionsCount,
    reviewNote: row.reviewNote,
    publishedAt: iso(row.publishedAt),
    updatedAt: iso(row.updatedAt) || new Date(0).toISOString(),
  };
}

function nameOf(first: string | null | undefined, last: string | null | undefined): string | null {
  return [first, last].filter(Boolean).join(" ") || null;
}

// ---------- العام ----------


async function loadPublishedIndex(): Promise<InfathPublishedIndexRow[]> {
  const rows = await db
    .select({
      id: infathWeeks.id,
      weekStart: infathWeeks.weekStart,
      summary: infathWeeks.publishedSummary,
      publishedAt: infathWeeks.publishedAt,
    })
    .from(infathWeeks)
    .where(isNotNull(infathWeeks.publishedAt))
    .orderBy(desc(infathWeeks.weekStart))
    .limit(104);
  return rows.map((row) => ({
    id: row.id,
    weekStart: day(row.weekStart),
    summary: (row.summary as InfathWeekSummary | null) ?? null,
    publishedAt: row.publishedAt,
  }));
}

export async function getPublicView(weekParam: string | null, now = new Date()): Promise<InfathPublicView | null> {
  const index = await loadPublishedIndex();
  if (!index.length) return null;
  const target = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)
    ? index.find((row) => row.weekStart === weekParam)?.weekStart ?? null
    : pickCurrentWeek(index.map((row) => row.weekStart), riyadhToday(now));
  if (!target) return null;
  const row = index.find((item) => item.weekStart === target)!;
  const [full] = await db
    .select({ publishedJson: infathWeeks.publishedJson, publishedAt: infathWeeks.publishedAt })
    .from(infathWeeks)
    .where(eq(infathWeeks.id, row.id))
    .limit(1);
  if (!full) return null;
  return buildPublicView(index, {
    weekStart: target,
    auctions: asAuctions(full.publishedJson),
    updatedAt: iso(full.publishedAt) || new Date(0).toISOString(),
  });
}

/** معاينة المسودة بشكل الصفحة العامة نفسه، لمن يملك صلاحية اللوحة فقط. */
export async function getPreview(id: string): Promise<InfathPublicView> {
  const [row] = await db.select().from(infathWeeks).where(eq(infathWeeks.id, id)).limit(1);
  if (!row) throw new InfathError(404, "الأسبوع غير موجود");
  const index = (await loadPublishedIndex()).filter((item) => item.id !== row.id);
  const weekStart = day(row.weekStart);
  // نضع الأسبوع المعاين في موضعه الزمني ليحسب «الأسبوع الماضي» والأرشيف كما سيظهران بعد الاعتماد.
  const merged = [...index, { id: row.id, weekStart, summary: null, publishedAt: null }]
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  const view = buildPublicView(merged, {
    weekStart,
    auctions: asAuctions(row.auctionsJson),
    updatedAt: iso(row.updatedAt) || new Date(0).toISOString(),
  });
  return { ...view, preview: true };
}

// ---------- اللوحة ----------

export async function listWeeks(): Promise<InfathWeekListItem[]> {
  const rows = await db
    .select({
      id: infathWeeks.id,
      weekStart: infathWeeks.weekStart,
      weekEnd: infathWeeks.weekEnd,
      status: infathWeeks.status,
      reviewNote: infathWeeks.reviewNote,
      publishedAt: infathWeeks.publishedAt,
      updatedAt: infathWeeks.updatedAt,
      count: sql<number>`jsonb_array_length(${infathWeeks.auctionsJson})`,
    })
    .from(infathWeeks)
    .orderBy(desc(infathWeeks.weekStart))
    .limit(60);
  return rows.map((row) => listItem(row, Number(row.count) || 0));
}

export async function getWeekDetail(id: string): Promise<InfathWeekDetail> {
  const [row] = await db.select().from(infathWeeks).where(eq(infathWeeks.id, id)).limit(1);
  if (!row) throw new InfathError(404, "الأسبوع غير موجود");
  const people = [row.submittedBy, row.approvedBy].filter((v): v is string => Boolean(v));
  const names = new Map<string, string | null>();
  for (const userId of people) {
    if (names.has(userId)) continue;
    const [person] = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, userId)).limit(1);
    names.set(userId, person ? nameOf(person.firstName, person.lastName) : null);
  }
  const changes = await db
    .select({
      id: infathChanges.id,
      action: infathChanges.action,
      note: infathChanges.note,
      beforeJson: infathChanges.beforeJson,
      afterJson: infathChanges.afterJson,
      createdAt: infathChanges.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(infathChanges)
    .leftJoin(users, eq(infathChanges.actorUserId, users.id))
    .where(eq(infathChanges.weekId, id))
    .orderBy(desc(infathChanges.createdAt))
    .limit(40);
  const auctions = asAuctions(row.auctionsJson);
  return {
    ...listItem(row, auctions.length),
    auctions,
    publishedAuctions: row.publishedJson ? asAuctions(row.publishedJson) : null,
    submittedAt: iso(row.submittedAt),
    approvedAt: iso(row.approvedAt),
    submittedByName: row.submittedBy ? names.get(row.submittedBy) ?? null : null,
    approvedByName: row.approvedBy ? names.get(row.approvedBy) ?? null : null,
    changes: changes.map((change) => ({
      id: change.id,
      action: change.action,
      note: change.note,
      actorName: nameOf(change.firstName, change.lastName),
      createdAt: iso(change.createdAt) || new Date(0).toISOString(),
      before: change.beforeJson ?? null,
      after: change.afterJson ?? null,
    })),
  };
}

export async function createWeek(actorUserId: string, body: unknown): Promise<InfathWeekListItem> {
  const { weekStart } = createWeekSchema.parse(body);
  const [existing] = await db.select({ id: infathWeeks.id }).from(infathWeeks).where(eq(infathWeeks.weekStart, weekStart)).limit(1);
  if (existing) throw new InfathError(409, "هذا الأسبوع موجود. افتحه من القائمة.");
  const row = await db.transaction(async (tx) => {
    const [created] = await tx.insert(infathWeeks).values({
      weekStart,
      weekEnd: weekEndOf(weekStart),
      status: "draft",
      auctionsJson: [],
      createdBy: actorUserId,
      updatedBy: actorUserId,
    }).returning();
    await tx.insert(infathChanges).values({
      weekId: created.id,
      actorUserId,
      action: "create",
      afterJson: { weekStart },
    });
    return created;
  });
  return listItem(row, 0);
}

type Transition = {
  action: "save" | "submit" | "approve" | "return";
  allowedFrom: InfathWeekStatus[];
  notAllowedMessage: string;
};

async function transition(
  actorUserId: string,
  id: string,
  expectedUpdatedAt: string | null | undefined,
  rule: Transition,
  apply: (row: InfathWeekRow, now: Date) => {
    set: Partial<typeof infathWeeks.$inferInsert>;
    note?: string | null;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  },
): Promise<InfathWeekDetail> {
  await db.transaction(async (tx) => {
    // قفل الصف داخل المعاملة: طلبان بالختم نفسه لا يمرّان معًا.
    const [row] = await tx.select().from(infathWeeks).where(eq(infathWeeks.id, id)).for("update");
    if (!row) throw new InfathError(404, "الأسبوع غير موجود");
    if (isStale(expectedUpdatedAt, row.updatedAt)) throw new InfathError(409, INFATH_STALE_MESSAGE);
    if (!rule.allowedFrom.includes(asStatus(row.status))) throw new InfathError(409, rule.notAllowedMessage);
    const now = new Date();
    const change = apply(row, now);
    await tx.update(infathWeeks).set({ ...change.set, updatedBy: actorUserId, updatedAt: now }).where(eq(infathWeeks.id, id));
    await tx.insert(infathChanges).values({
      weekId: id,
      actorUserId,
      action: rule.action,
      note: change.note ?? null,
      beforeJson: change.before,
      afterJson: change.after,
    });
  });
  return getWeekDetail(id);
}

export async function saveAuctions(actorUserId: string, id: string, body: unknown): Promise<InfathWeekDetail> {
  const [row] = await db.select({ weekStart: infathWeeks.weekStart }).from(infathWeeks).where(eq(infathWeeks.id, id)).limit(1);
  if (!row) throw new InfathError(404, "الأسبوع غير موجود");
  const parsed = auctionsWriteSchema(day(row.weekStart)).parse(body);
  const auctions = normalizeAuctions(parsed.auctions);
  return transition(actorUserId, id, parsed.expectedUpdatedAt, {
    action: "save",
    allowedFrom: ["draft", "pending", "returned", "approved"],
    notAllowedMessage: "",
  }, (current) => ({
    set: { auctionsJson: auctions, status: "draft" },
    before: { status: current.status, auctions: asAuctions(current.auctionsJson) },
    after: { status: "draft", auctions },
  }));
}

export async function submitWeek(actorUserId: string, id: string, body: unknown): Promise<InfathWeekDetail> {
  const parsed = reviewActionSchema.parse(body ?? {});
  return transition(actorUserId, id, parsed.expectedUpdatedAt, {
    action: "submit",
    allowedFrom: ["draft", "returned"],
    notAllowedMessage: "الأسبوع أُرسل أو اعتُمد. عدّل البيانات أولًا ثم أرسل.",
  }, (current, now) => {
    if (!asAuctions(current.auctionsJson).length) throw new InfathError(400, "أضف مزادًا واحدًا على الأقل قبل الإرسال");
    return {
      set: { status: "pending", submittedBy: actorUserId, submittedAt: now, reviewNote: null },
      note: parsed.note || null,
      before: { status: current.status },
      after: { status: "pending" },
    };
  });
}

export async function approveWeek(actorUserId: string, id: string, body: unknown): Promise<InfathWeekDetail> {
  const parsed = reviewActionSchema.parse(body ?? {});
  return transition(actorUserId, id, parsed.expectedUpdatedAt, {
    action: "approve",
    // المحرر يعتمد مسودة أدخلها بنفسه أيضًا؛ المعتمد لا يُعاد اعتماده دون تعديل.
    allowedFrom: ["draft", "pending", "returned"],
    notAllowedMessage: "الأسبوع معتمد ومنشور بالفعل.",
  }, (current, now) => {
    const auctions = asAuctions(current.auctionsJson);
    if (!auctions.length) throw new InfathError(400, "لا مزادات في هذا الأسبوع للنشر");
    const summary = summarizeWeek(day(current.weekStart), auctions);
    return {
      set: {
        status: "approved",
        approvedBy: actorUserId,
        approvedAt: now,
        publishedJson: auctions,
        publishedSummary: summary as unknown as Record<string, unknown>,
        publishedAt: now,
        reviewNote: null,
      },
      note: parsed.note || null,
      before: { status: current.status, published: current.publishedJson ? asAuctions(current.publishedJson) : null },
      after: { status: "approved", published: auctions },
    };
  });
}

export async function returnWeek(actorUserId: string, id: string, body: unknown): Promise<InfathWeekDetail> {
  const parsed = returnWeekSchema.parse(body ?? {});
  return transition(actorUserId, id, parsed.expectedUpdatedAt, {
    action: "return",
    allowedFrom: ["pending"],
    notAllowedMessage: "يُعاد الأسبوع فقط وهو بانتظار الاعتماد.",
  }, (current) => ({
    set: { status: "returned", reviewNote: parsed.note },
    note: parsed.note,
    before: { status: current.status },
    after: { status: "returned" },
  }));
}

