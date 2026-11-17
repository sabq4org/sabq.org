// ----------------------------------------------------------------------------
// أرشيف محاضر الاجتماعات والمهام الناتجة عنها (ADR-001: الاستعلامات هنا)
//
// قبل هذا الملف كان المحضر لا يُفتح إلا من قائمة «انتهت خلال الأسبوع» في
// المركز؛ بعد ٧ أيام لا طريق إليه. الأرشيف دائم، بالبحث، وبقاعدة الاطلاع
// نفسها في GET /api/meetings/:id/minutes: المضيف (أو meetings.manage) يرى كل
// حالات محاضر اجتماعاته، وغيره يرى المعتمد فقط من الاجتماعات الظاهرة له.
//
// المهام تعيش داخل meetings.minutes (jsonb) — بلا جدول جديد ولا ترحيل. حقل
// done اختياري؛ غيابه = مهمة مفتوحة.
// ----------------------------------------------------------------------------

import { and, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  meetings,
  meetingParticipants,
  users,
  type Meeting,
  type MeetingMinutes,
} from "@shared/schema";
import { boundedLimit } from "../utils/pagination";
import { logMeetingEvent, meetingVisibilityFilter } from "./meetingsService";

export const ARCHIVE_PAGE_SIZE = 20;
export const ARCHIVE_MAX_QUERY_CHARS = 80;
/** المهام المفتوحة تُجمع من اجتماعات آخر ٩٠ يوماً — أقدم من ذلك تاريخ لا متابعة */
export const OPEN_TASKS_WINDOW_DAYS = 90;
export const OPEN_TASKS_LIMIT = 30;

export interface ArchiveItem {
  id: string;
  title: string;
  startedAt: string | null;
  endedAt: string | null;
  /** المدة الفعلية بالدقائق (انتهى − بدأ)، أو null إن نقص أحدهما */
  durationMinutes: number | null;
  minutesStatus: string;
  isHost: boolean;
  decisions: number;
  tasks: number;
  openTasks: number;
}

// ─── دوال نقية (tests/unit/meetingArchive.test.ts) ───────────────────────────

/** نص البحث: مقصوص ومحدود الطول؛ فارغ = بلا بحث */
export function normalizeArchiveQuery(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, ARCHIVE_MAX_QUERY_CHARS);
}

/** تهريب محارف LIKE حتى يُبحث عن النص حرفياً (٪ و_ ليست بدائل) */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * مؤشر الترقيم: وقت الانتهاء بدقة Postgres كاملة + معرّف الاجتماع، مطابقاً لترتيب
 * القائمة (ended_at ثم id). بالوقت وحده يُفقد اجتماع يشارك آخر صف في الصفحة وقته.
 */
export type ArchiveCursor = { ts: string; id: string };

export function encodeArchiveCursor(c: ArchiveCursor): string {
  return `${c.ts}|${c.id}`;
}

export function decodeArchiveCursor(raw: unknown): ArchiveCursor | null {
  if (typeof raw !== "string" || raw.length > 120) return null;
  const m = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)\|([A-Za-z0-9_-]{1,64})$/.exec(raw);
  return m ? { ts: m[1], id: m[2] } : null;
}

export function actualDurationMinutes(
  startedAt: Date | null | undefined,
  endedAt: Date | null | undefined,
): number | null {
  if (!startedAt || !endedAt) return null;
  const ms = endedAt.getTime() - startedAt.getTime();
  return ms > 0 ? Math.max(1, Math.round(ms / 60_000)) : null;
}

export function countMinutes(minutes: MeetingMinutes | null | undefined): {
  decisions: number;
  tasks: number;
  openTasks: number;
} {
  const decisions = Array.isArray(minutes?.decisions) ? minutes!.decisions.length : 0;
  const items = Array.isArray(minutes?.actionItems) ? minutes!.actionItems : [];
  return {
    decisions,
    tasks: items.length,
    openTasks: items.filter((a) => !a?.done).length,
  };
}

/** يعيد نسخة من المحضر بعد تغيير حالة مهمة واحدة، أو null إن كان الفهرس خارج المدى */
export function withTaskDone(
  minutes: MeetingMinutes,
  index: number,
  done: boolean,
  /** نص المهمة كما يراه صاحب الطلب — الفهرس وحده يشير لمهمة أخرى إن عُدّلت القائمة */
  expectedTask?: string,
): MeetingMinutes | null | "mismatch" {
  const items = Array.isArray(minutes.actionItems) ? minutes.actionItems : [];
  if (!Number.isInteger(index) || index < 0 || index >= items.length) return null;
  if (expectedTask !== undefined && items[index].task !== expectedTask) return "mismatch";
  return {
    ...minutes,
    actionItems: items.map((a, i) => (i === index ? { ...a, done } : a)),
  };
}

// ─── الأرشيف ─────────────────────────────────────────────────────────────────

export async function listMinutesArchive(
  viewerId: string,
  canManage: boolean,
  opts: { q?: string; before?: ArchiveCursor | null; limit?: number } = {},
): Promise<{ items: ArchiveItem[]; nextBefore: string | null }> {
  const limit = Math.min(boundedLimit(opts.limit ?? ARCHIVE_PAGE_SIZE, ARCHIVE_PAGE_SIZE), 50);
  const q = normalizeArchiveQuery(opts.q);
  const visibility = await meetingVisibilityFilter(viewerId, canManage);
  const pattern = `%${escapeLike(q)}%`;

  const rows = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      hostUserId: meetings.hostUserId,
      startedAt: meetings.startedAt,
      endedAt: meetings.endedAt,
      minutesStatus: meetings.minutesStatus,
      minutes: meetings.minutes,
      endedAtText: sql<string>`${meetings.endedAt}::text`.as("ended_at_cursor"),
    })
    .from(meetings)
    .where(
      and(
        eq(meetings.status, "ended"),
        eq(meetings.minutesEnabled, true),
        visibility,
        // غير المضيف لا يرى إلا المعتمد — فكل صف يعود هنا محضره مسموح لصاحب الطلب،
        // والبحث في نص المحضر لا يكشف مسودة لغير مضيفها
        canManage
          ? undefined
          : or(eq(meetings.hostUserId, viewerId), eq(meetings.minutesStatus, "approved")),
        opts.before
          ? sql`(${meetings.endedAt}, ${meetings.id}) < (${opts.before.ts}::timestamp, ${opts.before.id})`
          : undefined,
        q
          ? or(
              sql`${meetings.title} ILIKE ${pattern} ESCAPE '\\'`,
              // نصوص المحضر فقط (ملخص، قرارات، مهام، أسماء) — لا مفاتيح JSON مثل task/owner
              sql`jsonb_path_query_array(${meetings.minutes}, 'strict $.**?(@.type() == "string")')::text ILIKE ${pattern} ESCAPE '\\'`,
            )
          : undefined,
      ),
    )
    .orderBy(desc(meetings.endedAt), desc(meetings.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => ({
      id: r.id,
      title: r.title,
      startedAt: r.startedAt ? r.startedAt.toISOString() : null,
      endedAt: r.endedAt ? r.endedAt.toISOString() : null,
      durationMinutes: actualDurationMinutes(r.startedAt, r.endedAt),
      minutesStatus: r.minutesStatus,
      isHost: canManage || r.hostUserId === viewerId,
      ...countMinutes(r.minutes),
    })),
    nextBefore:
      rows.length > limit && last?.endedAtText
        ? encodeArchiveCursor({ ts: last.endedAtText, id: last.id })
        : null,
  };
}

// ─── المهام المفتوحة ─────────────────────────────────────────────────────────

export interface OpenTask {
  meetingId: string;
  meetingTitle: string;
  endedAt: string | null;
  index: number;
  task: string;
  owner: string | null;
  due: string | null;
}

/** المهام غير المنجزة من محاضر الاجتماعات التي استضافها المستخدم (مسودة أو معتمد) */
export async function listOpenTasksForHost(hostUserId: string): Promise<OpenTask[]> {
  const since = new Date(Date.now() - OPEN_TASKS_WINDOW_DAYS * 24 * 60 * 60_000);
  const rows = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      endedAt: meetings.endedAt,
      minutes: meetings.minutes,
    })
    .from(meetings)
    .where(
      and(
        eq(meetings.hostUserId, hostUserId),
        eq(meetings.status, "ended"),
        inArray(meetings.minutesStatus, ["draft", "approved"]),
        gt(meetings.endedAt, since),
      ),
    )
    .orderBy(desc(meetings.endedAt))
    .limit(40);

  const out: OpenTask[] = [];
  for (const r of rows) {
    const items = Array.isArray(r.minutes?.actionItems) ? r.minutes!.actionItems : [];
    items.forEach((a, index) => {
      if (a?.done || !a?.task) return;
      out.push({
        meetingId: r.id,
        meetingTitle: r.title,
        endedAt: r.endedAt ? r.endedAt.toISOString() : null,
        index,
        task: a.task,
        owner: a.owner ?? null,
        due: a.due ?? null,
      });
    });
    if (out.length >= OPEN_TASKS_LIMIT) break;
  }
  return out.slice(0, OPEN_TASKS_LIMIT);
}

/**
 * تغيير حالة مهمة واحدة. تحت قفل الصف حتى لا يضيع تعديل متزامن (المحضر كله
 * عمود jsonb واحد). مسموح في المسودة والمعتمد؛ لا يغيّر حالة المحضر.
 */
export async function setMinutesTaskDone(
  meeting: Meeting,
  index: number,
  done: boolean,
  actorUserId: string,
  expectedTask: string,
): Promise<"ok" | "not_found" | "not_editable" | "changed"> {
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ minutes: meetings.minutes, status: meetings.minutesStatus })
      .from(meetings)
      .where(eq(meetings.id, meeting.id))
      .for("update");
    if (!row?.minutes || !["draft", "approved"].includes(row.status)) return "not_editable" as const;
    const next = withTaskDone(row.minutes, index, done, expectedTask);
    if (!next) return "not_found" as const;
    // القائمة تغيّرت منذ عرضها (حذف/إضافة في تبويب آخر) — لا نعلّم مهمة غير المقصودة
    if (next === "mismatch") return "changed" as const;
    await tx.update(meetings).set({ minutes: next }).where(eq(meetings.id, meeting.id));
    return "ok" as const;
  });
  if (result === "ok") {
    logMeetingEvent(meeting.id, done ? "minutes_task_done" : "minutes_task_reopened", {
      actorUserId,
      detail: { index },
    });
  }
  return result;
}

/** عدد من سيصلهم بريد المحضر عند الاعتماد (المقبولون أصحاب الحسابات ببريد) */
export async function countMinutesRecipients(meetingId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(meetingParticipants)
    .innerJoin(users, eq(meetingParticipants.userId, users.id))
    .where(
      and(
        eq(meetingParticipants.meetingId, meetingId),
        eq(meetingParticipants.status, "admitted"),
        sql`${users.email} is not null and ${users.email} <> ''`,
      ),
    );
  return row?.n ?? 0;
}
