import { z } from "zod";

// ----------------------------------------------------------------------------
// اجتماعات سبق لبوت الديسك — قراءة فقط (/api/internal/bot-desk/meetings*)
//
// المؤشر (cursor) سلسلة base64url غير شفافة تحمل (created_at::text, id) لآخر
// صف أُعيد. نحفظ created_at نصاً كما يعيده Postgres (دقة الميكروثانية) لأن
// Date في JS تقطع إلى الميلي ثانية فتتكرر الصفوف أو تُفقد عند الاستطلاع.
// ----------------------------------------------------------------------------

export const BOT_DESK_MEETING_STATUSES = ["live", "scheduled", "ended", "cancelled"] as const;
export type BotDeskMeetingStatus = (typeof BOT_DESK_MEETING_STATUSES)[number];

/** أحداث دورة الحياة التي يراها البوت — بلا join/left/muted وغيرها من ضجيج الغرفة */
export const BOT_DESK_MEETING_LIFECYCLE_EVENTS = [
  "created",
  "updated",
  "started",
  "ended",
  "cancelled",
  "minutes_generated",
  "minutes_approved",
] as const;
export type BotDeskMeetingLifecycleEvent = (typeof BOT_DESK_MEETING_LIFECYCLE_EVENTS)[number];

export const BOT_DESK_MEETINGS_PAGE_MAX = 200;
export const BOT_DESK_TRANSCRIPT_PAGE_MAX = 500;

export interface BotDeskCursor {
  /** created_at كما يعيده Postgres نصاً: "2026-11-17 08:12:33.123456" */
  ts: string;
  /** start_ms للتفريغ فقط: يرتب مقاطع الدفعة الواحدة (نفس created_at) زمنياً */
  ms?: number;
  id: string;
}

// timestamp بلا منطقة زمنية بصيغة Postgres النصية، بدقة حتى الميكروثانية
const PG_TS_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function encodeBotDeskCursor(cursor: BotDeskCursor): string {
  const parts = cursor.ms === undefined ? [cursor.ts, cursor.id] : [cursor.ts, String(cursor.ms), cursor.id];
  return Buffer.from(parts.join("|"), "utf8").toString("base64url");
}

export function decodeBotDeskCursor(raw: string): BotDeskCursor | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 200) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const parts = decoded.split("|");
  if (parts.length !== 2 && parts.length !== 3) return null;
  const ts = parts[0];
  const id = parts[parts.length - 1];
  if (!PG_TS_RE.test(ts) || !ID_RE.test(id)) return null;
  if (parts.length === 2) return { ts, id };
  if (!/^\d{1,10}$/.test(parts[1])) return null;
  const ms = Number(parts[1]);
  if (!Number.isSafeInteger(ms) || ms > 2_147_483_647) return null;
  return { ts, ms, id };
}

const cursorSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((v) => decodeBotDeskCursor(v) !== null, { message: "مؤشر غير صالح" });

const isoDate = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "تاريخ غير صالح (ISO 8601)" })
  .transform((v) => new Date(v));

const statusList = z
  .string()
  .trim()
  .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
  .pipe(z.array(z.enum(BOT_DESK_MEETING_STATUSES)).min(1).max(BOT_DESK_MEETING_STATUSES.length));

export const botDeskMeetingsQuerySchema = z
  .object({
    // قائمة مفصولة بفواصل؛ الافتراضي live,scheduled (الجارية والقادمة)
    status: statusList.optional(),
    // نافذة زمنية على «وقت الاجتماع» = coalesce(started_at, scheduled_at, created_at)
    from: isoDate.optional(),
    to: isoDate.optional(),
    limit: z.coerce.number().int().min(1).max(BOT_DESK_MEETINGS_PAGE_MAX).default(50),
  })
  .strict();

export const botDeskMeetingTranscriptQuerySchema = z
  .object({
    since: cursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(BOT_DESK_TRANSCRIPT_PAGE_MAX).default(200),
  })
  .strict();

export const botDeskMeetingEventsQuerySchema = z
  .object({
    since: cursorSchema.optional(),
    meetingId: z.string().trim().min(1).max(64).optional(),
    limit: z.coerce.number().int().min(1).max(BOT_DESK_TRANSCRIPT_PAGE_MAX).default(100),
  })
  .strict();

export type BotDeskMeetingsQuery = z.infer<typeof botDeskMeetingsQuerySchema>;
export type BotDeskMeetingTranscriptQuery = z.infer<typeof botDeskMeetingTranscriptQuerySchema>;
export type BotDeskMeetingEventsQuery = z.infer<typeof botDeskMeetingEventsQuerySchema>;

// ── أشكال الاستجابة — لا invite_token ولا guest_key ولا room_name ولا أسرار LiveKit ──

export interface BotDeskMeetingSummary {
  id: string;
  title: string;
  status: string;
  accessType: string;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number | null;
  minutesEnabled: boolean;
  minutesStatus: string;
  host: { userId: string; name: string };
  /** هل مالك التوكن مضيف أو يملك meetings.manage — يحدد الاطلاع على التفريغ الخام والمسودة */
  viewerIsHost: boolean;
}

export interface BotDeskMeetingAttendee {
  name: string;
  role: string;
  status: string;
  isGuest: boolean;
  rsvp: string | null;
  joinedAt: string | null;
  leftAt: string | null;
  inRoom: boolean;
}

export interface BotDeskTranscriptSegment {
  id: string;
  speakerName: string;
  /** هوية LiveKit: userId للمنسوب أو guest:<key> للضيف — نعيد النوع فقط للضيف */
  speakerKind: "staff" | "guest" | "unknown";
  speakerUserId: string | null;
  text: string;
  startMs: number;
  createdAt: string;
}

export interface BotDeskMeetingEvent {
  id: string;
  meetingId: string;
  meetingTitle: string;
  type: string;
  createdAt: string;
}
