// ----------------------------------------------------------------------------
// اجتماعات سبق لبوت الديسك — قراءة فقط (ADR-001: استعلامات Drizzle هنا)
//
// البوت يرى ما يراه مالك التوكن في مركز الاجتماعات، بالقواعد نفسها:
//   - الظهور: meetingVisibilityFilter / isUserEligible من meetingsService.
//   - التفريغ الخام: للمضيف أو من يملك meetings.manage فقط (سياسة أمين المحضر).
//   - المحضر: المسودة للمضيف/المدير، والمعتمد لكل مشارك مؤهل.
// لا يُعاد أبداً invite_token ولا guest_key ولا room_name ولا بريد أو جوال.
// ----------------------------------------------------------------------------

import { and, asc, desc, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  meetings,
  meetingEvents,
  meetingParticipants,
  meetingTranscripts,
  users,
  type Meeting,
} from "@shared/schema";
import {
  BOT_DESK_MEETING_LIFECYCLE_EVENTS,
  decodeBotDeskCursor,
  encodeBotDeskCursor,
  type BotDeskMeetingAttendee,
  type BotDeskMeetingEvent,
  type BotDeskMeetingEventsQuery,
  type BotDeskMeetingStatus,
  type BotDeskMeetingSummary,
  type BotDeskMeetingTranscriptQuery,
  type BotDeskMeetingsQuery,
  type BotDeskTranscriptSegment,
} from "@shared/botDeskMeetings";
import { getMeeting, isUserEligible, meetingVisibilityFilter } from "./meetingsService";

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

function staffName(first: string | null | undefined, last: string | null | undefined, fallback: string): string {
  return [first, last].filter(Boolean).join(" ").trim() || fallback;
}

/** وقت الاجتماع المرجعي لنافذة from/to */
const meetingTime = sql`coalesce(${meetings.startedAt}, ${meetings.scheduledAt}, ${meetings.createdAt})`;

export async function listMeetingsForBot(
  viewerId: string,
  canManage: boolean,
  query: BotDeskMeetingsQuery,
): Promise<BotDeskMeetingSummary[]> {
  const statuses: BotDeskMeetingStatus[] = query.status ?? ["live", "scheduled"];
  const visibility = await meetingVisibilityFilter(viewerId, canManage);
  const rows = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      status: meetings.status,
      accessType: meetings.accessType,
      scheduledAt: meetings.scheduledAt,
      startedAt: meetings.startedAt,
      endedAt: meetings.endedAt,
      durationMinutes: meetings.durationMinutes,
      minutesEnabled: meetings.minutesEnabled,
      minutesStatus: meetings.minutesStatus,
      hostUserId: meetings.hostUserId,
      hostFirstName: users.firstName,
      hostLastName: users.lastName,
    })
    .from(meetings)
    .leftJoin(users, eq(users.id, meetings.hostUserId))
    .where(
      and(
        inArray(meetings.status, statuses),
        query.from ? gte(meetingTime, query.from) : undefined,
        query.to ? lte(meetingTime, query.to) : undefined,
        visibility,
      ),
    )
    // المباشر أولاً، ثم القادم بأقرب موعد، ثم المنتهي بالأحدث
    .orderBy(
      sql`case ${meetings.status} when 'live' then 0 when 'scheduled' then 1 when 'ended' then 2 else 3 end`,
      sql`case when ${meetings.status} = 'scheduled' then ${meetings.scheduledAt} end asc nulls last`,
      desc(sql`coalesce(${meetings.endedAt}, ${meetings.startedAt}, ${meetings.createdAt})`),
    )
    .limit(query.limit);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    accessType: r.accessType,
    scheduledAt: iso(r.scheduledAt),
    startedAt: iso(r.startedAt),
    endedAt: iso(r.endedAt),
    durationMinutes: r.durationMinutes,
    minutesEnabled: r.minutesEnabled,
    minutesStatus: r.minutesStatus,
    host: { userId: r.hostUserId, name: staffName(r.hostFirstName, r.hostLastName, "غير معروف") },
    viewerIsHost: canManage || r.hostUserId === viewerId,
  }));
}

export type BotMeetingAccess =
  | { ok: true; meeting: Meeting; viewerIsHost: boolean }
  | { ok: false; status: 404 | 403 };

/** يحمّل الاجتماع ويطبق isUserEligible لمالك التوكن */
export async function loadMeetingForBot(
  meetingId: string,
  viewerId: string,
  canManage: boolean,
): Promise<BotMeetingAccess> {
  const meeting = await getMeeting(meetingId);
  if (!meeting) return { ok: false, status: 404 };
  if (!(await isUserEligible(meeting, viewerId, canManage))) return { ok: false, status: 403 };
  return { ok: true, meeting, viewerIsHost: canManage || meeting.hostUserId === viewerId };
}

export async function getMeetingDetailForBot(
  meeting: Meeting,
  viewerId: string,
  viewerIsHost: boolean,
): Promise<BotDeskMeetingSummary & {
  description: string | null;
  agenda: Array<{ title: string; durationMinutes: number | null; done: boolean }>;
  attendance: { inRoom: number; invited: number; rsvpYes: number; rsvpNo: number };
  attendees: BotDeskMeetingAttendee[];
}> {
  const [hostRow] = await db
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, meeting.hostUserId))
    .limit(1);

  const rows = await db
    .select({
      userId: meetingParticipants.userId,
      guestName: meetingParticipants.guestName,
      role: meetingParticipants.role,
      status: meetingParticipants.status,
      rsvp: meetingParticipants.rsvp,
      joinedAt: meetingParticipants.joinedAt,
      leftAt: meetingParticipants.leftAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(meetingParticipants)
    .leftJoin(users, eq(users.id, meetingParticipants.userId))
    .where(
      and(
        eq(meetingParticipants.meetingId, meeting.id),
        inArray(meetingParticipants.status, ["invited", "pending", "admitted"]),
      ),
    )
    .orderBy(asc(meetingParticipants.createdAt));

  const all = rows.map((r) => ({
    userId: r.userId,
    entry: {
      name: r.userId ? staffName(r.firstName, r.lastName, "منسوب") : `${r.guestName || "ضيف"} (ضيف)`,
      role: r.role,
      status: r.status,
      isGuest: !r.userId,
      rsvp: r.rsvp,
      joinedAt: iso(r.joinedAt),
      leftAt: iso(r.leftAt),
      inRoom: r.status === "admitted" && Boolean(r.joinedAt) && !r.leftAt,
    } satisfies BotDeskMeetingAttendee,
  }));

  // نفس قاعدة GET /api/meetings/:id: التفصيل الكامل للمضيف، والباقون يرون
  // من ردّ على الدعوة والمضيف وصفّهم
  const visible = viewerIsHost
    ? all
    : all.filter(
        (a) => a.entry.rsvp === "yes" || a.entry.rsvp === "no" || a.userId === viewerId || a.entry.role === "host",
      );

  const agenda = Array.isArray(meeting.agenda) ? meeting.agenda : [];
  return {
    id: meeting.id,
    title: meeting.title,
    description: meeting.description,
    status: meeting.status,
    accessType: meeting.accessType,
    scheduledAt: iso(meeting.scheduledAt),
    startedAt: iso(meeting.startedAt),
    endedAt: iso(meeting.endedAt),
    durationMinutes: meeting.durationMinutes,
    minutesEnabled: meeting.minutesEnabled,
    minutesStatus: meeting.minutesStatus,
    host: { userId: meeting.hostUserId, name: staffName(hostRow?.firstName, hostRow?.lastName, "غير معروف") },
    viewerIsHost,
    agenda: agenda.map((a) => ({ title: a.title, durationMinutes: a.durationMinutes, done: a.done })),
    attendance: {
      inRoom: all.filter((a) => a.entry.inRoom).length,
      invited: all.filter((a) => a.entry.role !== "host").length,
      rsvpYes: all.filter((a) => a.entry.rsvp === "yes").length,
      rsvpNo: all.filter((a) => a.entry.rsvp === "no").length,
    },
    attendees: visible.map((a) => a.entry),
  };
}

function speakerOf(identity: string): Pick<BotDeskTranscriptSegment, "speakerKind" | "speakerUserId"> {
  // guest:<key> يحمل مفتاح الضيف السري — لا نعيده
  if (identity.startsWith("guest:")) return { speakerKind: "guest", speakerUserId: null };
  if (identity.startsWith("agent-") || !identity) return { speakerKind: "unknown", speakerUserId: null };
  return { speakerKind: "staff", speakerUserId: identity };
}

/**
 * مقاطع التفريغ بترتيب الكتابة (created_at, start_ms, id): المؤشر يتقدم بوقت
 * الكتابة لا بـ startMs وحده، لأن العامل يعيد إرسال الدفعات الفاشلة فتصل مقاطع
 * أقدم توقيتاً بعد أحدث منها؛ وstart_ms يرتب مقاطع الدفعة الواحدة زمنياً.
 */
export async function getTranscriptPageForBot(
  meetingId: string,
  query: BotDeskMeetingTranscriptQuery,
): Promise<{ segments: BotDeskTranscriptSegment[]; nextCursor: string | null; hasMore: boolean }> {
  const cursor = query.since ? decodeBotDeskCursor(query.since) : null;
  const rows = await db
    .select({
      id: meetingTranscripts.id,
      speakerIdentity: meetingTranscripts.speakerIdentity,
      speakerName: meetingTranscripts.speakerName,
      text: meetingTranscripts.text,
      startMs: meetingTranscripts.startMs,
      createdAt: meetingTranscripts.createdAt,
      createdAtText: sql<string>`${meetingTranscripts.createdAt}::text`.as("created_at_cursor"),
    })
    .from(meetingTranscripts)
    .where(
      and(
        eq(meetingTranscripts.meetingId, meetingId),
        cursor
          ? sql`(${meetingTranscripts.createdAt}, ${meetingTranscripts.startMs}, ${meetingTranscripts.id}) > (${cursor.ts}::timestamp, ${cursor.ms ?? -1}::int, ${cursor.id})`
          : undefined,
      ),
    )
    .orderBy(asc(meetingTranscripts.createdAt), asc(meetingTranscripts.startMs), asc(meetingTranscripts.id))
    .limit(query.limit + 1);

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const last = page[page.length - 1];
  return {
    segments: page.map((r) => ({
      id: r.id,
      speakerName: r.speakerName,
      ...speakerOf(r.speakerIdentity),
      text: r.text,
      startMs: r.startMs,
      createdAt: r.createdAt.toISOString(),
    })),
    // بلا صفوف جديدة يبقى المؤشر كما أُرسل ليعيده البوت في الاستطلاع التالي
    nextCursor: last
      ? encodeBotDeskCursor({ ts: last.createdAtText, ms: last.startMs, id: last.id })
      : (query.since ?? null),
    hasMore,
  };
}

/**
 * أحداث دورة حياة الاجتماعات (بدأ/انتهى/أُلغي/وُلّد المحضر/اعتُمد) للاستطلاع.
 * بلا since: آخر ٢٤ ساعة. المؤشر يُعاد دائماً حتى لو لم تصل أحداث.
 */
export async function listMeetingEventsForBot(
  viewerId: string,
  canManage: boolean,
  query: BotDeskMeetingEventsQuery,
): Promise<{ events: BotDeskMeetingEvent[]; nextCursor: string; hasMore: boolean }> {
  const cursor = query.since ? decodeBotDeskCursor(query.since) : null;
  const visibility = await meetingVisibilityFilter(viewerId, canManage);
  const [rows, [nowRow]] = await Promise.all([
    db
      .select({
        id: meetingEvents.id,
        meetingId: meetingEvents.meetingId,
        meetingTitle: meetings.title,
        type: meetingEvents.eventType,
        createdAt: meetingEvents.createdAt,
        createdAtText: sql<string>`${meetingEvents.createdAt}::text`.as("created_at_cursor"),
      })
      .from(meetingEvents)
      .innerJoin(meetings, eq(meetings.id, meetingEvents.meetingId))
      .where(
        and(
          inArray(meetingEvents.eventType, [...BOT_DESK_MEETING_LIFECYCLE_EVENTS]),
          query.meetingId ? eq(meetingEvents.meetingId, query.meetingId) : undefined,
          cursor
            ? sql`(${meetingEvents.createdAt}, ${meetingEvents.id}) > (${cursor.ts}::timestamp, ${cursor.id})`
            : gt(meetingEvents.createdAt, sql`now() - interval '24 hours'`),
          visibility,
        ),
      )
      .orderBy(asc(meetingEvents.createdAt), asc(meetingEvents.id))
      .limit(query.limit + 1),
    cursor ? Promise.resolve([undefined]) : db
          .execute(sql`select now()::timestamp::text as ts`)
          .then((r) => ((r as { rows?: unknown }).rows ?? r) as Array<{ ts: string }>),
  ]);

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = last
    ? encodeBotDeskCursor({ ts: last.createdAtText, id: last.id })
    : query.since ?? encodeBotDeskCursor({ ts: (nowRow as { ts: string }).ts, id: "0" });

  return {
    events: page.map((r) => ({
      id: r.id,
      meetingId: r.meetingId,
      meetingTitle: r.meetingTitle,
      type: r.type,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor,
    hasMore,
  };
}

export function minutesForBot(meeting: Meeting, viewerIsHost: boolean) {
  const approved = meeting.minutesStatus === "approved";
  return {
    meetingId: meeting.id,
    minutesEnabled: meeting.minutesEnabled,
    // none | recording | generating | draft | approved | failed
    minutesStatus: meeting.minutesStatus,
    approved,
    // المسودة للمضيف/المدير فقط؛ غيرهم يرى المعتمد وحده (نفس GET /api/meetings/:id/minutes)
    minutes: viewerIsHost || approved ? meeting.minutes ?? null : null,
    generatedAt: iso(meeting.minutesGeneratedAt),
    approvedAt: iso(meeting.minutesApprovedAt),
    viewerIsHost,
  };
}
