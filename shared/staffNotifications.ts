// مركز تنبيهات «مكتب سبق» (2026-10-29): خط زمني لأحداث التغريدات ومقالات
// الرأي وأخبار «نشر سبق». منطق نقي يشترك فيه الخادم والاختبارات.
import { z } from "zod";

export const STAFF_DESK_EVENT_KINDS = [
  "tweet_draft",
  "tweet_scheduled",
  "tweet_published",
  "opinion_draft",
  "opinion_scheduled",
  "news_published",
] as const;
export type StaffDeskEventKind = (typeof STAFF_DESK_EVENT_KINDS)[number];

/** تبويبات الشاشة: الكل، تغريدات، مقالات رأي، أخبار. */
export const STAFF_DESK_EVENT_CATEGORIES = ["tweet", "opinion", "news"] as const;
export type StaffDeskEventCategory = (typeof STAFF_DESK_EVENT_CATEGORIES)[number];

export function staffDeskEventCategory(kind: StaffDeskEventKind): StaffDeskEventCategory {
  if (kind.startsWith("tweet_")) return "tweet";
  if (kind.startsWith("opinion_")) return "opinion";
  return "news";
}

export const STAFF_DESK_EVENT_LABELS: Record<StaffDeskEventKind, { label: string; action: string }> = {
  tweet_draft: { label: "مسودة تغريدة جديدة", action: "مراجعة المسودة" },
  tweet_scheduled: { label: "جُدولت تغريدة", action: "فتح التغريدة" },
  tweet_published: { label: "نُشرت تغريدة", action: "فتح التغريدة" },
  opinion_draft: { label: "مسودة مقال رأي جديدة", action: "مراجعة المقال" },
  opinion_scheduled: { label: "جُدول مقال رأي", action: "معاينة المقال" },
  news_published: { label: "خبر جديد عبر «نشر سبق»", action: "فتح الخبر" },
};

/** التنبيهات المعروضة: آخر 30 يوماً فقط. */
export const STAFF_DESK_EVENTS_WINDOW_DAYS = 30;
/** أقصى رقم يُعرض على الجرس. */
export const STAFF_DESK_UNREAD_CAP = 99;

/** ما يراه العضو من الفئات، من صلاحياته الحية. */
export function visibleStaffDeskCategories(caps: {
  canSocial: { view: boolean };
  canOpinion?: { view: boolean } | null;
  canPublisherNews?: boolean;
}): StaffDeskEventCategory[] {
  const out: StaffDeskEventCategory[] = [];
  if (caps.canSocial?.view) out.push("tweet");
  if (caps.canOpinion?.view) out.push("opinion");
  if (caps.canPublisherNews) out.push("news");
  return out;
}

/** رابط التطبيق: التغريدة أو مقال الرأي أو مركز التنبيهات للخبر (يُفتح الخبر برابط linkUrl). */
export function staffDeskEventDeeplink(kind: StaffDeskEventKind, targetId: string): string {
  const category = staffDeskEventCategory(kind);
  if (category === "tweet") return `sabqdesk://social/${targetId}`;
  if (category === "opinion") return `sabqdesk://opinion/${targetId}`;
  return "sabqdesk://notifications";
}

function riyadhParts(date: Date): { weekday: string; time: string; dayKey: string } {
  const weekday = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    weekday: "long",
    timeZone: "Asia/Riyadh",
  }).format(date);
  const time = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Riyadh",
  }).format(date);
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(date);
  return { weekday, time, dayKey };
}

/** «اليوم 12:30 م» أو «الأحد 9:00 ص» بتوقيت الرياض وأرقام لاتينية. */
export function formatStaffDeskWhen(date: Date, now: Date = new Date()): string {
  const target = riyadhParts(date);
  const today = riyadhParts(now);
  const tomorrow = riyadhParts(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const day =
    target.dayKey === today.dayKey ? "اليوم" : target.dayKey === tomorrow.dayKey ? "غدًا" : target.weekday;
  return `${day} ${target.time}`;
}

/** السطر الثانوي تحت العنوان: من فعل ماذا ومتى يُنشر. */
export function buildStaffDeskEventDetail(
  event: { kind: StaffDeskEventKind; actorName: string | null; scheduledAt: Date | null },
  now: Date = new Date(),
): string {
  const actor = event.actorName?.trim() || null;
  const when = event.scheduledAt ? formatStaffDeskWhen(event.scheduledAt, now) : null;
  switch (event.kind) {
    case "tweet_draft":
      return actor ? `من: ${actor}` : "مسودة بانتظار المراجعة";
    case "tweet_scheduled":
      return [actor ? `جدولها: ${actor}` : null, when ? `تُنشر ${when}` : null].filter(Boolean).join(" · ");
    case "tweet_published":
      return actor ? `نشرها: ${actor}` : "نُشرت تلقائيًا في موعدها";
    case "opinion_draft":
      return actor ?? "بانتظار المراجعة والجدولة";
    case "opinion_scheduled":
      return [actor, when ? `يُنشر ${when}` : null].filter(Boolean).join(" · ");
    case "news_published":
      return actor ? `الناشر: ${actor}` : "نُشر عبر «نشر سبق»";
  }
}

export interface StaffDeskNotification {
  id: string;
  kind: StaffDeskEventKind;
  category: StaffDeskEventCategory;
  label: string;
  actionLabel: string;
  title: string;
  detail: string;
  actorName: string | null;
  targetId: string;
  /** رابط الخبر المنشور (news_published فقط). */
  linkUrl: string | null;
  deeplink: string;
  scheduledAt: string | null;
  createdAt: string;
  isUnread: boolean;
}

export interface StaffDeskNotificationsResponse {
  items: StaffDeskNotification[];
  nextCursor: string | null;
  /** الفئات المتاحة لهذا العضو بترتيب التبويبات. */
  categories: StaffDeskEventCategory[];
  /** عدد آخر 30 يوماً لكل تبويب. */
  counts: { all: number; tweet: number; opinion: number; news: number };
  unreadCount: number;
  seenAt: string | null;
}

export interface StaffDeskUnreadResponse {
  unreadCount: number;
  latest: StaffDeskNotification | null;
}

export const staffDeskNotificationsQuerySchema = z.object({
  category: z.enum(["all", ...STAFF_DESK_EVENT_CATEGORIES]).optional().default("all"),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(30),
});

export interface StaffDeskEventCursor {
  createdAt: string;
  id: string;
}

export function encodeStaffDeskEventCursor(cursor: StaffDeskEventCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeStaffDeskEventCursor(raw: string): StaffDeskEventCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      parsed &&
      typeof parsed.createdAt === "string" &&
      typeof parsed.id === "string" &&
      !Number.isNaN(new Date(parsed.createdAt).getTime()) &&
      parsed.id.length <= 64
    ) {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
  } catch {
    // يُعامل كمؤشر غير صالح.
  }
  return null;
}

/** مفتاح منع التكرار: الحدث نفسه لا يُسجَّل مرتين (إعادة محاولة، أو نداء مزدوج). */
export function staffDeskEventDedupeKey(input: {
  kind: StaffDeskEventKind;
  targetId: string;
  scheduledAt?: Date | null;
  at?: Date;
}): string {
  switch (input.kind) {
    case "tweet_scheduled":
    case "opinion_scheduled":
      // إعادة الجدولة لموعد مختلف حدث جديد.
      return `${input.kind}:${input.targetId}:${input.scheduledAt ? input.scheduledAt.toISOString() : "none"}`;
    case "opinion_draft": {
      // إعادة الإرسال بعد الإرجاع للكاتب حدث جديد؛ النداء المزدوج في الدقيقة نفسها لا.
      const minute = Math.floor((input.at ?? new Date()).getTime() / 60_000);
      return `${input.kind}:${input.targetId}:${minute}`;
    }
    default:
      return `${input.kind}:${input.targetId}`;
  }
}

/** نص العنوان: سطر واحد مقصوص (التغريدة قد تكون طويلة). */
export function clipStaffDeskTitle(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}
