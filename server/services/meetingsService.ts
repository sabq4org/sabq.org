// ----------------------------------------------------------------------------
// اجتماعات سبق — خدمة البيانات (ADR-001: كل استعلامات Drizzle هنا)
//
// المبدأ الأمني: الوسائط عبر LiveKit، لكن لا أحد يدخل غرفة إلا بتذكرة JWT
// قصيرة العمر يوقّعها هذا الخادم بعد التحقق من الجلسة والصلاحية ونمط
// الوصول وموافقة المضيف. هوية المشارك (الاسم/الصورة/الإدارة) تُختم داخل
// التذكرة من دليل المنسوبين فلا يمكن انتحالها.
//
// المتغيرات المطلوبة: LIVEKIT_URL و LIVEKIT_API_KEY و LIVEKIT_API_SECRET —
// غيابها يعطّل النظام برسالة واضحة دون كسر بقية اللوحة.
// ----------------------------------------------------------------------------

import crypto from "crypto";
import { EventEmitter } from "events";
import Redis from "ioredis";
import { and, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { db } from "../db";
import {
  meetings,
  meetingParticipants,
  meetingEvents,
  staffDepartments,
  staffJobTitles,
  staffProfiles,
  users,
  type Meeting,
  type MeetingAgendaItem,
  type MeetingParticipant,
} from "@shared/schema";

// ────────────────────────────────────────────────────────────────────
// إعداد LiveKit
// ────────────────────────────────────────────────────────────────────

export function isMeetingsConfigured(): boolean {
  return Boolean(
    process.env.LIVEKIT_URL &&
      process.env.LIVEKIT_API_KEY &&
      process.env.LIVEKIT_API_SECRET,
  );
}

export function meetingsDisabledMessage(): string {
  return "نظام الاجتماعات غير مفعّل — يلزم ضبط متغيرات LIVEKIT على الخادم";
}

function livekitHttpUrl(): string {
  // LIVEKIT_URL يكون بصيغة wss://xxx.livekit.cloud — واجهة الإدارة نفسها عبر https
  return (process.env.LIVEKIT_URL || "")
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:");
}

function roomService(): RoomServiceClient {
  return new RoomServiceClient(
    livekitHttpUrl(),
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
  );
}

// ────────────────────────────────────────────────────────────────────
// ناقل الأحداث اللحظية — EventEmitter محلي + Redis Pub/Sub بين النسخ
// (نفس نمط editorPresence: النسخة التي تنشر تتجاهل رسالتها العائدة)
// ────────────────────────────────────────────────────────────────────

export interface MeetingBusEvent {
  type:
    | "join_requested"
    | "request_resolved"
    | "participant_joined"
    | "participant_left"
    | "participant_removed"
    | "meeting_started"
    | "meeting_ended"
    | "meeting_locked"
    | "meeting_updated"
    | "rsvp_updated";
  meetingId: string;
  /** حمولة خفيفة للعرض فقط — لا أسرار هنا، القناة تصل لكل مشارك مؤهل */
  payload?: Record<string, unknown>;
}

const POD_ID = `${process.pid}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
const CH_MEETINGS = "meetings:events";
const busEmitter = new EventEmitter();
busEmitter.setMaxListeners(1000);

let busPub: Redis | null = null;
let busSub: Redis | null = null;
let busReady = false;

function initBusRedis(): void {
  if (busReady || !process.env.REDIS_URL) return;
  busReady = true;
  try {
    busPub = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
    busSub = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
    busPub.on("error", (e) => console.error("[Meetings] redis pub error:", e.message));
    busSub.on("error", (e) => console.error("[Meetings] redis sub error:", e.message));
    busSub.subscribe(CH_MEETINGS, (err) => {
      if (err) console.error("[Meetings] subscribe failed:", err.message);
    });
    busSub.on("message", (_ch, raw) => {
      try {
        const msg = JSON.parse(raw) as { podId: string; event: MeetingBusEvent };
        if (msg.podId === POD_ID) return; // نشرناها محلياً بالفعل
        busEmitter.emit(`m:${msg.event.meetingId}`, msg.event);
      } catch {
        /* رسالة مشوهة — تجاهل */
      }
    });
  } catch (e) {
    console.error("[Meetings] redis bus init failed:", (e as Error).message);
  }
}

export function publishMeetingEvent(event: MeetingBusEvent): void {
  busEmitter.emit(`m:${event.meetingId}`, event);
  initBusRedis();
  busPub?.publish(CH_MEETINGS, JSON.stringify({ podId: POD_ID, event })).catch(() => {});
}

export function subscribeMeetingEvents(
  meetingId: string,
  listener: (event: MeetingBusEvent) => void,
): () => void {
  initBusRedis();
  const channel = `m:${meetingId}`;
  busEmitter.on(channel, listener);
  return () => busEmitter.off(channel, listener);
}

// ────────────────────────────────────────────────────────────────────
// سجل التدقيق
// ────────────────────────────────────────────────────────────────────

export function logMeetingEvent(
  meetingId: string,
  eventType: string,
  opts: { actorUserId?: string | null; targetUserId?: string | null; detail?: Record<string, unknown> } = {},
): void {
  db.insert(meetingEvents)
    .values({
      meetingId,
      eventType,
      actorUserId: opts.actorUserId ?? null,
      targetUserId: opts.targetUserId ?? null,
      detail: opts.detail,
    })
    .catch((e) => console.error("[Meetings] audit log failed:", (e as Error).message));
}

// ────────────────────────────────────────────────────────────────────
// هوية المنسوب — من دليل المنسوبين، تُختم داخل تذكرة LiveKit
// ────────────────────────────────────────────────────────────────────

export interface MeetingIdentity {
  identity: string; // userId أو guest:<key>
  name: string;
  avatarUrl: string | null;
  department: string | null;
  jobTitle: string | null;
  isHost: boolean;
  isGuest: boolean;
}

export async function getStaffIdentity(userId: string): Promise<Omit<MeetingIdentity, "isHost"> | null> {
  const [row] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      profileImageUrl: users.profileImageUrl,
      officialPhotoUrl: staffProfiles.officialPhotoUrl,
      departmentName: staffDepartments.nameAr,
      jobTitleName: staffJobTitles.nameAr,
    })
    .from(users)
    .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .leftJoin(staffDepartments, eq(staffDepartments.id, staffProfiles.departmentId))
    .leftJoin(staffJobTitles, eq(staffJobTitles.id, staffProfiles.jobTitleId))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || row.email || "بدون اسم";
  return {
    identity: row.id,
    name,
    avatarUrl: row.officialPhotoUrl || row.profileImageUrl || null,
    department: row.departmentName || null,
    jobTitle: row.jobTitleName || null,
    isGuest: false,
  };
}

async function getUserDepartmentId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ departmentId: staffProfiles.departmentId })
    .from(staffProfiles)
    .where(eq(staffProfiles.userId, userId))
    .limit(1);
  return row?.departmentId ?? null;
}

// ────────────────────────────────────────────────────────────────────
// تذاكر الدخول
// ────────────────────────────────────────────────────────────────────

export async function issueMeetingToken(
  meeting: Meeting,
  ident: MeetingIdentity,
): Promise<{ token: string; url: string }> {
  const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
    identity: ident.identity,
    name: ident.name,
    ttl: "15m", // للدخول فقط — الجلسة نفسها لا تنقطع بانتهاء التذكرة
    metadata: JSON.stringify({
      name: ident.name,
      avatarUrl: ident.avatarUrl,
      department: ident.department,
      jobTitle: ident.jobTitle,
      isHost: ident.isHost,
      isGuest: ident.isGuest,
    }),
  });
  at.addGrant({
    roomJoin: true,
    room: meeting.roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: ident.isHost,
  });
  return { token: await at.toJwt(), url: process.env.LIVEKIT_URL! };
}

// ────────────────────────────────────────────────────────────────────
// إنشاء الاجتماعات وعرضها
// ────────────────────────────────────────────────────────────────────

export interface CreateMeetingInput {
  title: string;
  description?: string;
  accessType: "all" | "department" | "selected" | "link";
  departmentId?: string;
  memberIds?: string[];
  requireApproval: boolean;
  muteOnJoin: boolean;
  scheduledAt?: Date | null;
  /** مدة متوقعة بالدقائق */
  durationMinutes?: number | null;
  /** بنود أجندة (عناوين)؛ تُحوَّل إلى MeetingAgendaItem مع معرّفات */
  agenda?: Array<{ title: string; durationMinutes?: number | null }>;
  /** «أمين المحضر»: تفريغ آلي + محضر بعد الاجتماع */
  minutesEnabled?: boolean;
}

export interface UpdateMeetingInput {
  title?: string;
  description?: string | null;
  scheduledAt?: Date | null;
  durationMinutes?: number | null;
  agenda?: Array<{ id?: string; title: string; durationMinutes?: number | null; done?: boolean }>;
  requireApproval?: boolean;
  muteOnJoin?: boolean;
  minutesEnabled?: boolean;
  /** إلغاء اجتماع مجدول */
  cancel?: boolean;
}

function normalizeAgenda(
  items: Array<{ id?: string; title: string; durationMinutes?: number | null; done?: boolean }> | undefined,
): MeetingAgendaItem[] {
  if (!items?.length) return [];
  return items
    .map((item) => ({
      id: item.id && item.id.length > 0 ? item.id : crypto.randomUUID(),
      title: item.title.trim().slice(0, 200),
      durationMinutes:
        typeof item.durationMinutes === "number" && item.durationMinutes > 0
          ? Math.min(Math.round(item.durationMinutes), 480)
          : null,
      done: Boolean(item.done),
    }))
    .filter((item) => item.title.length > 0)
    .slice(0, 40);
}

// استدعاء عامل «أمين المحضر» عند صيرورة الاجتماع مباشراً — استيراد ديناميكي
// لتفادي دورة استيراد مع meetingMinutesService (الذي يستورد logMeetingEvent)
function fireMinutesDispatch(meeting: Meeting): void {
  if (!meeting.minutesEnabled) return;
  import("./meetingMinutesService")
    .then((m) => m.dispatchMinutesAgent(meeting))
    .catch((e) => console.error("[Meetings] minutes dispatch failed:", (e as Error).message));
}

export async function createMeeting(hostUserId: string, input: CreateMeetingInput): Promise<Meeting> {
  const isScheduled = Boolean(input.scheduledAt && input.scheduledAt.getTime() > Date.now());
  const [meeting] = await db
    .insert(meetings)
    .values({
      title: input.title,
      description: input.description || null,
      hostUserId,
      accessType: input.accessType,
      departmentId: input.accessType === "department" ? input.departmentId : null,
      inviteToken: crypto.randomBytes(24).toString("base64url"),
      requireApproval: input.requireApproval,
      muteOnJoin: input.muteOnJoin,
      status: isScheduled ? "scheduled" : "live",
      roomName: `sbq-${crypto.randomBytes(8).toString("hex")}`,
      minutesEnabled: Boolean(input.minutesEnabled),
      durationMinutes:
        typeof input.durationMinutes === "number" && input.durationMinutes > 0
          ? Math.min(Math.round(input.durationMinutes), 480)
          : null,
      agenda: normalizeAgenda(input.agenda),
      scheduledAt: input.scheduledAt ?? null,
      startedAt: isScheduled ? null : new Date(),
    })
    .returning();

  if (!isScheduled) fireMinutesDispatch(meeting);

  await db.insert(meetingParticipants).values({
    meetingId: meeting.id,
    userId: hostUserId,
    role: "host",
    status: "admitted",
  });

  if (input.accessType === "selected" && input.memberIds?.length) {
    const uniqueIds = Array.from(new Set(input.memberIds)).filter((id) => id !== hostUserId);
    if (uniqueIds.length) {
      await db.insert(meetingParticipants).values(
        uniqueIds.map((userId) => ({ meetingId: meeting.id, userId, status: "invited" })),
      );
    }
  }

  logMeetingEvent(meeting.id, "created", { actorUserId: hostUserId, detail: { accessType: input.accessType } });
  if (!isScheduled) logMeetingEvent(meeting.id, "started", { actorUserId: hostUserId });
  return meeting;
}

export interface MeetingListItem {
  id: string;
  title: string;
  description: string | null;
  accessType: string;
  status: string;
  requireApproval: boolean;
  isLocked: boolean;
  minutesEnabled: boolean;
  minutesStatus: string;
  durationMinutes: number | null;
  agendaCount: number;
  scheduledAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  hostUserId: string;
  hostName: string;
  departmentName: string | null;
  participantCount: number;
  inviteToken: string | null; // للمضيف فقط — تُصفَّر لغيره في المسار
  // تأكيد الحضور للمجدولة
  rsvpYesCount: number;
  rsvpNoCount: number;
  myRsvp: string | null;
}

async function meetingVisibilityFilter(userId: string, canManage: boolean) {
  if (canManage) return undefined;
  const deptId = await getUserDepartmentId(userId);
  // المرفوض والمُخرَج لا يبقى الاجتماع ظاهراً له في المركز
  const myMeetingIds = db
    .select({ meetingId: meetingParticipants.meetingId })
    .from(meetingParticipants)
    .where(
      and(
        eq(meetingParticipants.userId, userId),
        inArray(meetingParticipants.status, ["invited", "pending", "admitted"]),
      ),
    );
  return or(
    eq(meetings.hostUserId, userId),
    eq(meetings.accessType, "all"),
    deptId ? and(eq(meetings.accessType, "department"), eq(meetings.departmentId, deptId)) : sql`false`,
    inArray(meetings.id, myMeetingIds),
  );
}

export async function listMeetingsForUser(
  userId: string,
  canManage: boolean,
): Promise<{ live: MeetingListItem[]; upcoming: MeetingListItem[]; recent: MeetingListItem[] }> {
  // قبل العرض: أقفل الاجتماعات «المباشرة» التي فرغت غرفها فعلياً
  await reconcileLiveMeetings().catch(() => {});
  const visibility = await meetingVisibilityFilter(userId, canManage);

  // باني الاستعلام في Drizzle لا يُعاد استخدامه بعد where — دالة تبني من الصفر لكل قائمة
  const fetchList = async (
    extra: ReturnType<typeof and>,
    order: "started" | "scheduled" | "ended",
    limit?: number,
  ): Promise<MeetingListItem[]> => {
    const q = db
      .select({
        id: meetings.id,
        title: meetings.title,
        description: meetings.description,
        accessType: meetings.accessType,
        status: meetings.status,
        requireApproval: meetings.requireApproval,
        isLocked: meetings.isLocked,
        minutesEnabled: meetings.minutesEnabled,
        minutesStatus: meetings.minutesStatus,
        durationMinutes: meetings.durationMinutes,
        agenda: meetings.agenda,
        scheduledAt: meetings.scheduledAt,
        startedAt: meetings.startedAt,
        endedAt: meetings.endedAt,
        createdAt: meetings.createdAt,
        hostUserId: meetings.hostUserId,
        hostFirstName: users.firstName,
        hostLastName: users.lastName,
        hostEmail: users.email,
        departmentName: staffDepartments.nameAr,
        inviteToken: meetings.inviteToken,
        participantCount: sql<number>`(
          select count(*)::int from ${meetingParticipants} mp
          where mp.meeting_id = ${meetings.id} and mp.status = 'admitted' and mp.joined_at is not null and mp.left_at is null
        )`,
        rsvpYesCount: sql<number>`(
          select count(*)::int from ${meetingParticipants} mp
          where mp.meeting_id = ${meetings.id} and mp.rsvp = 'yes'
        )`,
        rsvpNoCount: sql<number>`(
          select count(*)::int from ${meetingParticipants} mp
          where mp.meeting_id = ${meetings.id} and mp.rsvp = 'no'
        )`,
        myRsvp: sql<string | null>`(
          select mp.rsvp from ${meetingParticipants} mp
          where mp.meeting_id = ${meetings.id} and mp.user_id = ${userId}
          limit 1
        )`,
      })
      .from(meetings)
      .leftJoin(users, eq(users.id, meetings.hostUserId))
      .leftJoin(staffDepartments, eq(staffDepartments.id, meetings.departmentId))
      .where(and(extra, visibility))
      .orderBy(
        order === "started"
          ? desc(meetings.startedAt)
          : order === "scheduled"
            ? meetings.scheduledAt
            : desc(meetings.endedAt),
      );
    const rows = limit ? await q.limit(limit) : await q;
    return rows.map((r) => {
      const { agenda, hostFirstName, hostLastName, hostEmail, ...rest } = r;
      return {
        ...rest,
        agendaCount: Array.isArray(agenda) ? agenda.length : 0,
        hostName:
          [hostFirstName, hostLastName].filter(Boolean).join(" ").trim() || hostEmail || "غير معروف",
        inviteToken: r.hostUserId === userId || canManage ? r.inviteToken : null,
      };
    });
  };

  const [live, upcoming, recent] = await Promise.all([
    fetchList(and(eq(meetings.status, "live")), "started"),
    fetchList(and(eq(meetings.status, "scheduled")), "scheduled", 20),
    // أرشيف المنتهية للمضيف والإدارة فقط — بقية المنسوبين لا يحتاجون سجل العناوين
    fetchList(
      and(
        eq(meetings.status, "ended"),
        gt(meetings.endedAt, sql`now() - interval '7 days'`),
        canManage ? undefined : eq(meetings.hostUserId, userId),
      ),
      "ended",
      10,
    ),
  ]);

  return { live, upcoming, recent };
}

export async function getMeeting(meetingId: string): Promise<Meeting | null> {
  const [m] = await db.select().from(meetings).where(eq(meetings.id, meetingId)).limit(1);
  return m ?? null;
}

export async function updateMeeting(
  meeting: Meeting,
  actorUserId: string,
  input: UpdateMeetingInput,
): Promise<Meeting | { error: string; code: number }> {
  if (meeting.status === "ended" || meeting.status === "cancelled") {
    return { error: "لا يمكن تعديل اجتماع منتهٍ أو ملغى", code: 409 };
  }

  if (input.cancel) {
    if (meeting.status !== "scheduled") {
      return { error: "الإلغاء للاجتماعات المجدولة فقط — أنهِ الاجتماع المباشر بدل ذلك", code: 409 };
    }
    const [cancelled] = await db
      .update(meetings)
      .set({ status: "cancelled", endedAt: new Date() })
      .where(eq(meetings.id, meeting.id))
      .returning();
    logMeetingEvent(meeting.id, "cancelled", { actorUserId });
    publishMeetingEvent({ type: "meeting_ended", meetingId: meeting.id, payload: { cancelled: true } });
    return cancelled;
  }

  const patch: Partial<typeof meetings.$inferInsert> = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (title.length < 3) return { error: "العنوان قصير", code: 400 };
    patch.title = title.slice(0, 120);
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim().slice(0, 500) || null;
  }
  if (input.durationMinutes !== undefined) {
    patch.durationMinutes =
      typeof input.durationMinutes === "number" && input.durationMinutes > 0
        ? Math.min(Math.round(input.durationMinutes), 480)
        : null;
  }
  if (input.agenda !== undefined) {
    patch.agenda = normalizeAgenda(input.agenda);
  }
  if (input.requireApproval !== undefined) patch.requireApproval = input.requireApproval;
  if (input.muteOnJoin !== undefined) patch.muteOnJoin = input.muteOnJoin;
  if (input.minutesEnabled !== undefined && meeting.status === "scheduled") {
    patch.minutesEnabled = input.minutesEnabled;
  }
  if (input.scheduledAt !== undefined) {
    if (meeting.status !== "scheduled") {
      return { error: "إعادة الجدولة للاجتماعات المجدولة فقط", code: 409 };
    }
    if (input.scheduledAt && input.scheduledAt.getTime() <= Date.now()) {
      return { error: "موعد الجدولة يجب أن يكون في المستقبل", code: 400 };
    }
    patch.scheduledAt = input.scheduledAt;
  }

  if (Object.keys(patch).length === 0) return meeting;

  const [updated] = await db
    .update(meetings)
    .set(patch)
    .where(eq(meetings.id, meeting.id))
    .returning();
  logMeetingEvent(meeting.id, "updated", { actorUserId, detail: { fields: Object.keys(patch) } });
  publishMeetingEvent({ type: "meeting_updated", meetingId: meeting.id, payload: { fields: Object.keys(patch) } });
  return updated;
}

export interface MeetingHostInfo {
  userId: string;
  name: string;
  avatarUrl: string | null;
  department: string | null;
  jobTitle: string | null;
}

export interface AttendanceCounts {
  invited: number;
  rsvpYes: number;
  rsvpNo: number;
  rsvpPending: number;
  waiting: number;
  inRoom: number;
}

export interface AttendanceEntry {
  participantId: string;
  userId: string | null;
  name: string;
  avatarUrl: string | null;
  department: string | null;
  role: string;
  status: string;
  rsvp: string | null;
  rsvpAt: Date | null;
  isGuest: boolean;
  joinedAt: Date | null;
  leftAt: Date | null;
}

export async function getMeetingHost(meeting: Meeting): Promise<MeetingHostInfo> {
  const identity = await getStaffIdentity(meeting.hostUserId);
  if (identity) {
    return {
      userId: meeting.hostUserId,
      name: identity.name,
      avatarUrl: identity.avatarUrl,
      department: identity.department,
      jobTitle: identity.jobTitle,
    };
  }
  const [u] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      profileImageUrl: users.profileImageUrl,
    })
    .from(users)
    .where(eq(users.id, meeting.hostUserId))
    .limit(1);
  return {
    userId: meeting.hostUserId,
    name: [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() || u?.email || "المضيف",
    avatarUrl: u?.profileImageUrl || null,
    department: null,
    jobTitle: null,
  };
}

export async function getMeetingAttendance(meeting: Meeting): Promise<{
  counts: AttendanceCounts;
  attendees: AttendanceEntry[];
}> {
  const rows = await db
    .select({
      participantId: meetingParticipants.id,
      userId: meetingParticipants.userId,
      guestName: meetingParticipants.guestName,
      role: meetingParticipants.role,
      status: meetingParticipants.status,
      rsvp: meetingParticipants.rsvp,
      rsvpAt: meetingParticipants.rsvpAt,
      joinedAt: meetingParticipants.joinedAt,
      leftAt: meetingParticipants.leftAt,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      profileImageUrl: users.profileImageUrl,
      officialPhotoUrl: staffProfiles.officialPhotoUrl,
      departmentName: staffDepartments.nameAr,
    })
    .from(meetingParticipants)
    .leftJoin(users, eq(users.id, meetingParticipants.userId))
    .leftJoin(staffProfiles, eq(staffProfiles.userId, meetingParticipants.userId))
    .leftJoin(staffDepartments, eq(staffDepartments.id, staffProfiles.departmentId))
    .where(
      and(
        eq(meetingParticipants.meetingId, meeting.id),
        inArray(meetingParticipants.status, ["invited", "pending", "admitted"]),
      ),
    )
    .orderBy(meetingParticipants.createdAt);

  const attendees: AttendanceEntry[] = rows.map((r) => ({
    participantId: r.participantId,
    userId: r.userId,
    name: r.userId
      ? [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || r.email || "منسوب"
      : `${r.guestName || "ضيف"} (ضيف)`,
    avatarUrl: r.officialPhotoUrl || r.profileImageUrl || null,
    department: r.departmentName || null,
    role: r.role,
    status: r.status,
    rsvp: r.rsvp,
    rsvpAt: r.rsvpAt,
    isGuest: !r.userId,
    joinedAt: r.joinedAt,
    leftAt: r.leftAt,
  }));

  const counts: AttendanceCounts = {
    invited: attendees.filter((a) => a.role !== "host").length,
    rsvpYes: attendees.filter((a) => a.rsvp === "yes").length,
    rsvpNo: attendees.filter((a) => a.rsvp === "no").length,
    rsvpPending: attendees.filter(
      (a) => a.role !== "host" && !a.isGuest && a.rsvp !== "yes" && a.rsvp !== "no",
    ).length,
    waiting: attendees.filter((a) => a.status === "pending").length,
    inRoom: attendees.filter(
      (a) => a.status === "admitted" && a.joinedAt && !a.leftAt,
    ).length,
  };

  return { counts, attendees };
}

export async function getMeetingByInviteToken(token: string): Promise<Meeting | null> {
  const [m] = await db.select().from(meetings).where(eq(meetings.inviteToken, token)).limit(1);
  return m ?? null;
}

/** هل يحق للمنسوب رؤية هذا الاجتماع والانضمام إليه من داخل اللوحة؟ */
export async function isUserEligible(meeting: Meeting, userId: string, canManage: boolean): Promise<boolean> {
  if (canManage || meeting.hostUserId === userId) return true;
  if (meeting.accessType === "all") return true;
  if (meeting.accessType === "department") {
    if (!meeting.departmentId) return false;
    const deptId = await getUserDepartmentId(userId);
    return deptId === meeting.departmentId;
  }
  // selected أو link: يلزم صف مشارك موجود (دعوة أو طلب سابق)
  const [row] = await db
    .select({ id: meetingParticipants.id })
    .from(meetingParticipants)
    .where(and(eq(meetingParticipants.meetingId, meeting.id), eq(meetingParticipants.userId, userId)))
    .limit(1);
  return Boolean(row);
}

// ────────────────────────────────────────────────────────────────────
// الانضمام وغرفة الانتظار
// ────────────────────────────────────────────────────────────────────

async function upsertUserParticipant(
  meetingId: string,
  userId: string,
  status: "pending" | "admitted",
  role: "host" | "member" = "member",
): Promise<MeetingParticipant> {
  const [existing] = await db
    .select()
    .from(meetingParticipants)
    .where(and(eq(meetingParticipants.meetingId, meetingId), eq(meetingParticipants.userId, userId)))
    .limit(1);
  if (existing) {
    const [updated] = await db
      .update(meetingParticipants)
      .set({
        status,
        role: existing.role === "host" ? "host" : role,
        joinedAt: status === "admitted" ? new Date() : existing.joinedAt,
        leftAt: null,
      })
      .where(eq(meetingParticipants.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(meetingParticipants)
    .values({
      meetingId,
      userId,
      role,
      status,
      joinedAt: status === "admitted" ? new Date() : null,
    })
    .returning();
  return created;
}

export interface JoinResult {
  admitted: boolean;
  denied?: boolean;
  participantId: string;
  token?: string;
  url?: string;
  muteOnJoin?: boolean;
  /** للضيوف فقط — يثبت به المتصفح ملكية طلبه عند الاستعلام عن القرار */
  guestKey?: string;
}

export async function requestJoin(
  meeting: Meeting,
  userId: string,
  canManage: boolean,
): Promise<JoinResult | { error: string; code: number }> {
  const isHost = meeting.hostUserId === userId || canManage;

  if (meeting.status === "ended" || meeting.status === "cancelled") {
    return { error: "انتهى هذا الاجتماع", code: 410 };
  }
  if (meeting.status === "scheduled") {
    if (!isHost) return { error: "لم يبدأ الاجتماع بعد", code: 409 };
    await db
      .update(meetings)
      .set({ status: "live", startedAt: new Date() })
      .where(eq(meetings.id, meeting.id));
    meeting = { ...meeting, status: "live" };
    logMeetingEvent(meeting.id, "started", { actorUserId: userId });
    publishMeetingEvent({ type: "meeting_started", meetingId: meeting.id });
    fireMinutesDispatch(meeting);
  }

  const identityBase = await getStaffIdentity(userId);
  if (!identityBase) return { error: "تعذر جلب بيانات المستخدم", code: 500 };
  const ident: MeetingIdentity = { ...identityBase, isHost };

  // من أخرجه المضيف لا يعود تلقائياً حتى في اجتماع بلا موافقة — يمر بغرفة الانتظار.
  // ومن سبق قبوله (ثم انقطع أو غادر) يعود مباشرة دون موافقة ثانية — كسلوك Meet.
  const [existingRow] = await db
    .select({ status: meetingParticipants.status })
    .from(meetingParticipants)
    .where(and(eq(meetingParticipants.meetingId, meeting.id), eq(meetingParticipants.userId, userId)))
    .limit(1);
  const wasRemoved = existingRow?.status === "removed" || existingRow?.status === "denied";
  const wasAdmitted = existingRow?.status === "admitted";

  if (isHost || wasAdmitted || (!meeting.requireApproval && !wasRemoved)) {
    if (meeting.isLocked && !isHost) return { error: "الغرفة مقفلة أمام الدخول الجديد", code: 423 };
    const participant = await upsertUserParticipant(
      meeting.id,
      userId,
      "admitted",
      isHost ? "host" : "member",
    );
    const { token, url } = await issueMeetingToken(meeting, ident);
    logMeetingEvent(meeting.id, "joined", { actorUserId: userId });
    publishMeetingEvent({
      type: "participant_joined",
      meetingId: meeting.id,
      payload: { participantId: participant.id, name: ident.name },
    });
    return { admitted: true, participantId: participant.id, token, url, muteOnJoin: meeting.muteOnJoin };
  }

  if (meeting.isLocked) return { error: "الغرفة مقفلة أمام الدخول الجديد", code: 423 };

  const participant = await upsertUserParticipant(meeting.id, userId, "pending");
  logMeetingEvent(meeting.id, "join_requested", { actorUserId: userId });
  publishMeetingEvent({
    type: "join_requested",
    meetingId: meeting.id,
    payload: {
      participantId: participant.id,
      name: ident.name,
      avatarUrl: ident.avatarUrl,
      department: ident.department,
    },
  });
  return { admitted: false, participantId: participant.id };
}

/** ضيف عبر رابط الدعوة — ينتظر موافقة المضيف دائماً مهما كانت الإعدادات */
export async function requestGuestJoin(
  meeting: Meeting,
  guestName: string,
): Promise<JoinResult | { error: string; code: number }> {
  if (meeting.status !== "live") {
    return { error: meeting.status === "scheduled" ? "لم يبدأ الاجتماع بعد" : "انتهى هذا الاجتماع", code: 409 };
  }
  if (meeting.isLocked) return { error: "الغرفة مقفلة أمام الدخول الجديد", code: 423 };

  const guestKey = crypto.randomBytes(24).toString("base64url");
  const [participant] = await db
    .insert(meetingParticipants)
    .values({ meetingId: meeting.id, guestName, guestKey, status: "pending" })
    .returning();

  logMeetingEvent(meeting.id, "join_requested", { detail: { guestName } });
  publishMeetingEvent({
    type: "join_requested",
    meetingId: meeting.id,
    payload: { participantId: participant.id, name: guestName, isGuest: true },
  });
  return { admitted: false, participantId: participant.id, guestKey };
}

/** يستدعيها المنتظِر (منسوباً أو ضيفاً) لمعرفة قرار المضيف واستلام تذكرته */
export async function getRequestStatus(
  meeting: Meeting,
  participantId: string,
  auth: { userId?: string; guestKey?: string },
): Promise<{ status: string; token?: string; url?: string; muteOnJoin?: boolean } | null> {
  const [p] = await db
    .select()
    .from(meetingParticipants)
    .where(and(eq(meetingParticipants.id, participantId), eq(meetingParticipants.meetingId, meeting.id)))
    .limit(1);
  if (!p) return null;
  // إثبات الملكية: صاحب الحساب نفسه أو حامل مفتاح الضيف نفسه
  const owns =
    (p.userId && p.userId === auth.userId) ||
    (p.guestKey && auth.guestKey && p.guestKey === auth.guestKey);
  if (!owns) return null;

  if (p.status !== "admitted") return { status: p.status };

  let ident: MeetingIdentity;
  if (p.userId) {
    const base = await getStaffIdentity(p.userId);
    if (!base) return { status: p.status };
    ident = { ...base, isHost: meeting.hostUserId === p.userId };
  } else {
    ident = {
      identity: `guest:${p.guestKey}`,
      name: `${p.guestName} (ضيف)`,
      avatarUrl: null,
      department: null,
      jobTitle: null,
      isHost: false,
      isGuest: true,
    };
  }
  const { token, url } = await issueMeetingToken(meeting, ident);
  if (!p.joinedAt) {
    await db
      .update(meetingParticipants)
      .set({ joinedAt: new Date() })
      .where(eq(meetingParticipants.id, p.id));
  }
  return { status: "admitted", token, url, muteOnJoin: meeting.muteOnJoin };
}

export async function resolveJoinRequest(
  meeting: Meeting,
  participantId: string,
  approve: boolean,
  actorUserId: string,
): Promise<MeetingParticipant | null> {
  const [p] = await db
    .update(meetingParticipants)
    .set({ status: approve ? "admitted" : "denied" })
    .where(
      and(
        eq(meetingParticipants.id, participantId),
        eq(meetingParticipants.meetingId, meeting.id),
        eq(meetingParticipants.status, "pending"),
      ),
    )
    .returning();
  if (!p) return null;
  logMeetingEvent(meeting.id, approve ? "admitted" : "denied", {
    actorUserId,
    targetUserId: p.userId,
    detail: p.guestName ? { guestName: p.guestName } : undefined,
  });
  publishMeetingEvent({
    type: "request_resolved",
    meetingId: meeting.id,
    payload: { participantId: p.id, approved: approve },
  });
  return p;
}

// ────────────────────────────────────────────────────────────────────
// تأكيد الحضور (RSVP) للاجتماعات المجدولة — الدعوة تبقى قائمة بالحالين،
// الهدف أن يتكوّن عند المضيف تصور مسبق: من سيحضر ومن اعتذر
// ────────────────────────────────────────────────────────────────────

export async function setRsvp(
  meeting: Meeting,
  userId: string,
  response: "yes" | "no",
): Promise<void> {
  const [existing] = await db
    .select({ id: meetingParticipants.id })
    .from(meetingParticipants)
    .where(and(eq(meetingParticipants.meetingId, meeting.id), eq(meetingParticipants.userId, userId)))
    .limit(1);
  if (existing) {
    await db
      .update(meetingParticipants)
      .set({ rsvp: response, rsvpAt: new Date() })
      .where(eq(meetingParticipants.id, existing.id));
  } else {
    // مؤهل عبر «الكل/الإدارة» بلا صف دعوة — ننشئ صفاً يحمل رده
    await db.insert(meetingParticipants).values({
      meetingId: meeting.id,
      userId,
      status: "invited",
      rsvp: response,
      rsvpAt: new Date(),
    });
  }
  logMeetingEvent(meeting.id, response === "yes" ? "rsvp_yes" : "rsvp_no", { actorUserId: userId });
  const identity = await getStaffIdentity(userId);
  publishMeetingEvent({
    type: "rsvp_updated",
    meetingId: meeting.id,
    payload: {
      userId,
      response,
      name: identity?.name || "منسوب",
      avatarUrl: identity?.avatarUrl || null,
    },
  });
}

export interface RsvpEntry {
  name: string;
  avatarUrl: string | null;
  department: string | null;
  rsvp: string;
  rsvpAt: Date | null;
}

export async function getMeetingRsvps(meeting: Meeting): Promise<RsvpEntry[]> {
  const rows = await db
    .select({
      rsvp: meetingParticipants.rsvp,
      rsvpAt: meetingParticipants.rsvpAt,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      profileImageUrl: users.profileImageUrl,
      officialPhotoUrl: staffProfiles.officialPhotoUrl,
      departmentName: staffDepartments.nameAr,
    })
    .from(meetingParticipants)
    .innerJoin(users, eq(users.id, meetingParticipants.userId))
    .leftJoin(staffProfiles, eq(staffProfiles.userId, meetingParticipants.userId))
    .leftJoin(staffDepartments, eq(staffDepartments.id, staffProfiles.departmentId))
    .where(
      and(
        eq(meetingParticipants.meetingId, meeting.id),
        inArray(meetingParticipants.rsvp, ["yes", "no"]),
      ),
    )
    .orderBy(meetingParticipants.rsvpAt);

  return rows.map((r) => ({
    name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || r.email || "بدون اسم",
    avatarUrl: r.officialPhotoUrl || r.profileImageUrl || null,
    department: r.departmentName || null,
    rsvp: r.rsvp!,
    rsvpAt: r.rsvpAt,
  }));
}

// ────────────────────────────────────────────────────────────────────
// قائمة المشاركين (للوحة الجانبية في الغرفة)
// ────────────────────────────────────────────────────────────────────

export interface RosterEntry {
  participantId: string;
  userId: string | null;
  name: string;
  avatarUrl: string | null;
  department: string | null;
  jobTitle: string | null;
  role: string;
  status: string;
  isGuest: boolean;
  identity: string | null; // هوية LiveKit — للمطابقة مع أحداث الغرفة
}

export async function getRoster(meeting: Meeting, includePending: boolean): Promise<RosterEntry[]> {
  const rows = await db
    .select({
      participantId: meetingParticipants.id,
      userId: meetingParticipants.userId,
      guestName: meetingParticipants.guestName,
      guestKey: meetingParticipants.guestKey,
      role: meetingParticipants.role,
      status: meetingParticipants.status,
      leftAt: meetingParticipants.leftAt,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      profileImageUrl: users.profileImageUrl,
      officialPhotoUrl: staffProfiles.officialPhotoUrl,
      departmentName: staffDepartments.nameAr,
      jobTitleName: staffJobTitles.nameAr,
    })
    .from(meetingParticipants)
    .leftJoin(users, eq(users.id, meetingParticipants.userId))
    .leftJoin(staffProfiles, eq(staffProfiles.userId, meetingParticipants.userId))
    .leftJoin(staffDepartments, eq(staffDepartments.id, staffProfiles.departmentId))
    .leftJoin(staffJobTitles, eq(staffJobTitles.id, staffProfiles.jobTitleId))
    .where(
      and(
        eq(meetingParticipants.meetingId, meeting.id),
        inArray(meetingParticipants.status, includePending ? ["admitted", "pending"] : ["admitted"]),
      ),
    )
    .orderBy(meetingParticipants.createdAt);

  return rows.map((r) => ({
    participantId: r.participantId,
    userId: r.userId,
    name: r.userId
      ? [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || r.email || "منسوب"
      : `${r.guestName} (ضيف)`,
    avatarUrl: r.officialPhotoUrl || r.profileImageUrl || null,
    department: r.departmentName || null,
    jobTitle: r.jobTitleName || null,
    role: r.role,
    status: r.status,
    isGuest: !r.userId,
    identity: r.userId ? r.userId : r.guestKey ? `guest:${r.guestKey}` : null,
  }));
}

export async function markParticipantLeft(meetingId: string, userId: string): Promise<void> {
  await db
    .update(meetingParticipants)
    .set({ leftAt: new Date() })
    .where(and(eq(meetingParticipants.meetingId, meetingId), eq(meetingParticipants.userId, userId)));
  logMeetingEvent(meetingId, "left", { actorUserId: userId });
  publishMeetingEvent({ type: "participant_left", meetingId, payload: { userId } });
}

// ────────────────────────────────────────────────────────────────────
// أدوات المضيف — تنفَّذ على LiveKit مباشرة
// ────────────────────────────────────────────────────────────────────

export async function muteParticipantMic(meeting: Meeting, identity: string, actorUserId: string): Promise<boolean> {
  try {
    const svc = roomService();
    const info = await svc.getParticipant(meeting.roomName, identity);
    const audioTracks = (info.tracks || []).filter((t) => t.type === 1 /* AUDIO */ && !t.muted);
    for (const t of audioTracks) {
      await svc.mutePublishedTrack(meeting.roomName, identity, t.sid, true);
    }
    logMeetingEvent(meeting.id, "muted", {
      actorUserId,
      targetUserId: identity.startsWith("guest:") ? null : identity,
    });
    return true;
  } catch (e) {
    console.error("[Meetings] mute failed:", (e as Error).message);
    return false;
  }
}

export async function removeParticipantFromRoom(
  meeting: Meeting,
  participantId: string,
  actorUserId: string,
): Promise<boolean> {
  const [p] = await db
    .update(meetingParticipants)
    .set({ status: "removed", leftAt: new Date() })
    .where(and(eq(meetingParticipants.id, participantId), eq(meetingParticipants.meetingId, meeting.id)))
    .returning();
  if (!p) return false;
  const identity = p.userId || (p.guestKey ? `guest:${p.guestKey}` : null);
  if (identity) {
    try {
      await roomService().removeParticipant(meeting.roomName, identity);
    } catch {
      /* قد يكون غادر بالفعل */
    }
  }
  logMeetingEvent(meeting.id, "removed", { actorUserId, targetUserId: p.userId });
  publishMeetingEvent({
    type: "participant_removed",
    meetingId: meeting.id,
    payload: { participantId: p.id, userId: p.userId },
  });
  return true;
}

export async function setMeetingLocked(meeting: Meeting, locked: boolean, actorUserId: string): Promise<void> {
  await db.update(meetings).set({ isLocked: locked }).where(eq(meetings.id, meeting.id));
  logMeetingEvent(meeting.id, locked ? "locked" : "unlocked", { actorUserId });
  publishMeetingEvent({ type: "meeting_locked", meetingId: meeting.id, payload: { locked } });
}

export async function endMeeting(
  meeting: Meeting,
  actorUserId: string,
  opts: { auto?: boolean } = {},
): Promise<void> {
  await db
    .update(meetings)
    .set({ status: "ended", endedAt: new Date() })
    .where(eq(meetings.id, meeting.id));
  await db
    .update(meetingParticipants)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(meetingParticipants.meetingId, meeting.id),
        eq(meetingParticipants.status, "admitted"),
        sql`${meetingParticipants.leftAt} is null`,
      ),
    );
  try {
    await roomService().deleteRoom(meeting.roomName);
  } catch {
    /* الغرفة قد لا تكون أُنشئت أصلاً على LiveKit */
  }
  logMeetingEvent(meeting.id, "ended", {
    actorUserId,
    detail: opts.auto ? { auto: true } : undefined,
  });
  publishMeetingEvent({ type: "meeting_ended", meetingId: meeting.id });

  // توليد المحضر بالخلفية بعد الإنهاء (استيراد ديناميكي — انظر fireMinutesDispatch)
  if (meeting.minutesEnabled) {
    import("./meetingMinutesService")
      .then(async (m) => {
        await m.generateMinutes(meeting.id);
        await m.cleanupOldTranscripts();
      })
      .catch((e) => console.error("[Meetings] minutes generation failed:", (e as Error).message));
  }
}

/**
 * حذف نهائي للاجتماع — المشاركون/الأحداث/التفريغ تُحذف cascade.
 * يُغلق غرفة LiveKit إن وُجدت ثم يحذف الصف.
 */
export async function deleteMeeting(meeting: Meeting, actorUserId: string): Promise<void> {
  if (meeting.status === "live" && isMeetingsConfigured()) {
    try {
      await roomService().deleteRoom(meeting.roomName);
    } catch {
      /* الغرفة قد تكون فارغة أصلاً */
    }
  }
  publishMeetingEvent({ type: "meeting_ended", meetingId: meeting.id, payload: { deleted: true } });
  await db.delete(meetings).where(eq(meetings.id, meeting.id));
  // لا logMeetingEvent بعد الحذف — صف الأحداث يُ cascade مع الاجتماع
  console.info(`[Meetings] deleted meeting ${meeting.id} by ${actorUserId}`);
}

/** مسح كل الاجتماعات (تنظيف تجريبي) — للمخوّلين بـ meetings.manage فقط عبر المسار */
export async function purgeAllMeetings(actorUserId: string): Promise<{ deleted: number }> {
  const rows = await db.select({ id: meetings.id, roomName: meetings.roomName, status: meetings.status }).from(meetings);
  if (isMeetingsConfigured()) {
    await Promise.all(
      rows
        .filter((r) => r.status === "live")
        .map(async (r) => {
          try {
            await roomService().deleteRoom(r.roomName);
          } catch {
            /* تجاهل */
          }
        }),
    );
  }
  for (const r of rows) {
    publishMeetingEvent({ type: "meeting_ended", meetingId: r.id, payload: { deleted: true } });
  }
  await db.delete(meetings);
  console.info(`[Meetings] purged ${rows.length} meetings by ${actorUserId}`);
  return { deleted: rows.length };
}

// ────────────────────────────────────────────────────────────────────
// المصالحة التلقائية — الاجتماع «المباشر» الذي فرغت غرفته على LiveKit
// (غادر الجميع أو انقطعوا) يُقفل تلقائياً بدل بقائه «مباشراً» للأبد.
// تُستدعى عند فتح مركز الاجتماعات، بخانق ٣٠ ثانية عبر النسخة الواحدة.
// ────────────────────────────────────────────────────────────────────

// مهلة سماح: الغرفة لا تُنشأ على LiveKit إلا بدخول أول مشارك، فلا نقفل
// اجتماعاً أُنشئ للتو ومضيفه ما زال يتصل
const RECONCILE_GRACE_MS = 3 * 60_000;
let lastReconcileAt = 0;

export async function reconcileLiveMeetings(): Promise<void> {
  if (!isMeetingsConfigured()) return;
  if (Date.now() - lastReconcileAt < 30_000) return;
  lastReconcileAt = Date.now();

  const liveMeetings = await db.select().from(meetings).where(eq(meetings.status, "live"));
  const candidates = liveMeetings.filter(
    (m) => m.startedAt && Date.now() - m.startedAt.getTime() > RECONCILE_GRACE_MS,
  );
  if (!candidates.length) return;

  let rooms;
  try {
    rooms = await roomService().listRooms(candidates.map((m) => m.roomName));
  } catch (e) {
    console.error("[Meetings] reconcile listRooms failed:", (e as Error).message);
    return;
  }
  const participantsByRoom = new Map(rooms.map((r) => [r.name, r.numParticipants]));

  for (const m of candidates) {
    const count = participantsByRoom.get(m.roomName) ?? 0;
    if (count > 0) continue;
    try {
      await endMeeting(m, m.hostUserId, { auto: true });
      console.log(`[Meetings] auto-ended empty meeting ${m.id} (${m.title})`);
    } catch (e) {
      console.error("[Meetings] auto-end failed:", (e as Error).message);
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// قوائم مساعدة لنموذج الإنشاء
// ────────────────────────────────────────────────────────────────────

export async function getMeetingFormOptions(): Promise<{
  departments: { id: string; nameAr: string }[];
  staff: { userId: string; name: string; avatarUrl: string | null; department: string | null }[];
}> {
  const departments = await db
    .select({ id: staffDepartments.id, nameAr: staffDepartments.nameAr })
    .from(staffDepartments)
    .where(eq(staffDepartments.isActive, true))
    .orderBy(staffDepartments.sortOrder, staffDepartments.nameAr);

  const staffRows = await db
    .select({
      userId: staffProfiles.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      profileImageUrl: users.profileImageUrl,
      officialPhotoUrl: staffProfiles.officialPhotoUrl,
      departmentName: staffDepartments.nameAr,
    })
    .from(staffProfiles)
    .innerJoin(users, eq(users.id, staffProfiles.userId))
    .leftJoin(staffDepartments, eq(staffDepartments.id, staffProfiles.departmentId))
    .where(eq(users.status, "active"))
    .orderBy(users.firstName);

  return {
    departments,
    staff: staffRows.map((r) => ({
      userId: r.userId,
      name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || r.email || "بدون اسم",
      avatarUrl: r.officialPhotoUrl || r.profileImageUrl || null,
      department: r.departmentName || null,
    })),
  };
}
