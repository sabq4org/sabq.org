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
  // منذ 2026-11-10: مسودة خبر من بوت، خبر مراسل، طلب تعديل، ورسالة كاتب.
  "news_bot_draft",
  "news_draft",
  "news_edit_request",
  "ticket_message",
] as const;
export type StaffDeskEventKind = (typeof STAFF_DESK_EVENT_KINDS)[number];

/**
 * تبويبات الشاشة: الكل، تغريدات، مقالات رأي، أخبار، رسائل. «رسائل» تُعرض فقط
 * لتطبيق يطلبها (`v=2`): النسخ الأقدم تتجاهل فئة لا تعرفها فيبقى رقم جرسها بلا صفوف.
 */
export const STAFF_DESK_EVENT_CATEGORIES = ["tweet", "opinion", "news", "message"] as const;
/** نسخة عقد مركز التنبيهات التي تعرف فئة «رسائل». */
export const STAFF_DESK_NOTIFICATIONS_V_MESSAGES = 2;
export type StaffDeskEventCategory = (typeof STAFF_DESK_EVENT_CATEGORIES)[number];

export function staffDeskEventCategory(kind: StaffDeskEventKind): StaffDeskEventCategory {
  if (kind.startsWith("tweet_")) return "tweet";
  if (kind.startsWith("opinion_")) return "opinion";
  if (kind.startsWith("ticket_")) return "message";
  return "news";
}

export const STAFF_DESK_EVENT_LABELS: Record<StaffDeskEventKind, { label: string; action: string }> = {
  tweet_draft: { label: "مسودة تغريدة جديدة", action: "مراجعة المسودة" },
  tweet_scheduled: { label: "جُدولت تغريدة", action: "فتح التغريدة" },
  tweet_published: { label: "نُشرت تغريدة", action: "فتح التغريدة" },
  opinion_draft: { label: "مسودة مقال رأي جديدة", action: "مراجعة المقال" },
  opinion_scheduled: { label: "جُدول مقال رأي", action: "معاينة المقال" },
  news_published: { label: "خبر جديد عبر بوت النشر", action: "فتح الخبر" },
  news_bot_draft: { label: "مسودة خبر من بوت", action: "مراجعة المسودة" },
  news_draft: { label: "خبر من مراسل", action: "مراجعة الخبر" },
  news_edit_request: { label: "طلب تعديل على خبر", action: "فتح الطلب" },
  ticket_message: { label: "رسالة من كاتب", action: "فتح الرسالة" },
};

/**
 * اسم يُعرض لبوت مسودات يستخدم توكن البيئة المشترك (بلا توكن شخصي). كل البوتات
 * تمر على /api/internal/bot-drafts، فلا يصح نسبة كل خبر إلى «نشر سبق».
 */
export function botDraftsPublisherDisplayName(botName: string): string {
  const name = botName.trim().toLowerCase();
  if (name.includes("grok")) return "قروك بوت";
  if (name === "nashr-sabq") return "نشر سبق";
  return botName.trim();
}

/** التنبيهات المعروضة: آخر 30 يوماً فقط. */
export const STAFF_DESK_EVENTS_WINDOW_DAYS = 30;
/** أقصى رقم يُعرض على الجرس. */
export const STAFF_DESK_UNREAD_CAP = 99;

/** ما يراه العضو من الفئات، من صلاحياته الحية. */
export function visibleStaffDeskCategories(caps: {
  canSocial: { view: boolean };
  canOpinion?: { view: boolean } | null;
  canPublisherNews?: boolean;
  canTickets?: boolean;
}, options: { includeMessages?: boolean } = {}): StaffDeskEventCategory[] {
  const out: StaffDeskEventCategory[] = [];
  if (caps.canSocial?.view) out.push("tweet");
  if (caps.canOpinion?.view) out.push("opinion");
  if (caps.canPublisherNews) out.push("news");
  if (options.includeMessages && caps.canTickets) out.push("message");
  return out;
}

/**
 * رابط التطبيق: التغريدة، مقال الرأي، الخبر أو طلب التعديل في تبويب «الأخبار»،
 * تذكرة الكاتب، أو مركز التنبيهات للخبر المنشور (يُفتح برابط linkUrl).
 */
export function staffDeskEventDeeplink(kind: StaffDeskEventKind, targetId: string): string {
  if (kind === "news_bot_draft" || kind === "news_draft") return `sabqdesk://news/${targetId}`;
  if (kind === "news_edit_request") return `sabqdesk://news/edit-request/${targetId}`;
  if (kind === "ticket_message") return `sabqdesk://ticket/${targetId}`;
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
      return actor ? `الناشر: ${actor}` : "نُشر عبر بوت";
    case "news_bot_draft":
      return actor ? `من: ${actor} · بانتظار قرارك` : "مسودة بانتظار قرارك";
    case "news_draft":
      return actor ? `من: ${actor}` : "بانتظار قرار المكتب";
    case "news_edit_request":
      return actor ? `طلبه: ${actor}` : "بانتظار قرار المكتب";
    case "ticket_message":
      return actor ? `من: ${actor}` : "رسالة بانتظار الرد";
    default:
      // نوع أحدث من هذا الكود (صف كتبه خادم أحدث): سطر محايد بدل undefined.
      return actor ?? "";
  }
}

/** من وراء الحدث: شخص، وكالة، بوت، أو النظام (نشر آلي في موعده). */
export const STAFF_DESK_ACTOR_KINDS = ["person", "agency", "bot", "system"] as const;
export type StaffDeskActorKind = (typeof STAFF_DESK_ACTOR_KINDS)[number];

/** الأنواع التي تنتظر قراراً من المكتب؛ الباقي «للعلم». */
export const STAFF_DESK_DECISION_KINDS: readonly StaffDeskEventKind[] = [
  "tweet_draft",
  "opinion_draft",
  "news_bot_draft",
  "news_draft",
  "news_edit_request",
  "ticket_message",
];

export function staffDeskEventIsDecisionKind(kind: StaffDeskEventKind): boolean {
  return STAFF_DESK_DECISION_KINDS.includes(kind);
}

/**
 * مصدر الحدث. تغريدة البوت تُعرف من `tweetBotName` (social_post_bot_keys)؛
 * مسودة خبر البوت بوت دائماً؛ الخبر المنشور بلا صاحب توكن = بوت بتوكن البيئة؛
 * وحدث نشر أو جدولة بلا فاعل = النظام.
 */
export function resolveStaffDeskActorKind(event: {
  kind: StaffDeskEventKind;
  actorName: string | null;
  actorUserId: string | null;
  tweetBotName?: string | null;
  /** اسم الفاعل يطابق اسم وكالة مسجّلة (publishers.agencyName). */
  isAgency?: boolean;
}): StaffDeskActorKind {
  if (event.kind === "news_bot_draft") return "bot";
  if (event.kind.startsWith("tweet_") && event.tweetBotName) return "bot";
  if (event.isAgency) return "agency";
  if (event.kind === "news_published") return event.actorUserId ? "person" : "bot";
  const automatic =
    event.kind === "tweet_scheduled" || event.kind === "tweet_published" || event.kind === "opinion_scheduled";
  if (automatic && !event.actorName?.trim()) return "system";
  return "person";
}

/** سطر المصدر بجانب وسم النوع: «مسودة من بوت · قروك بوت»، «من مراسل · سالم». */
export function buildStaffDeskEventSource(
  event: {
    kind: StaffDeskEventKind;
    actorName: string | null;
    actorKind: StaffDeskActorKind;
    scheduledAt: Date | null;
  },
  now: Date = new Date(),
): string {
  const actor = event.actorName?.trim() || null;
  const bot = event.actorKind === "bot";
  const when = event.scheduledAt ? formatStaffDeskWhen(event.scheduledAt, now) : null;
  const join = (...parts: Array<string | null>) => parts.filter(Boolean).join(" · ");
  switch (event.kind) {
    case "tweet_draft":
      return bot ? join("مقترح من بوت", actor) : actor ? `مقترح من ${actor}` : "مقترح بانتظار المراجعة";
    case "tweet_scheduled":
      // الموعد أولاً: السطر يُقص في الصف المختصر، والموعد أهم من الاسم.
      return join(when ? `تُنشر ${when}` : "جُدولت", bot ? join("جدولها بوت", actor) : actor ? `جدولها ${actor}` : null);
    case "tweet_published":
      return bot ? join("نشرها بوت", actor) : actor ? `نشرها ${actor}` : "نُشرت تلقائيًا في موعدها";
    case "opinion_draft":
      return join("من كاتب", actor);
    case "opinion_scheduled":
      return join(when ? `يُنشر ${when}` : "جُدول", actor);
    case "news_published":
      return bot ? join("نشره بوت", actor) : join("نُشر عبر «نشر سبق»", actor);
    case "news_bot_draft":
      return join("مسودة من بوت", actor);
    case "news_draft":
      return join("من مراسل", actor);
    case "news_edit_request":
      return join("طلب تعديل", actor);
    case "ticket_message":
      return join("من كاتب", actor);
    default:
      return actor ?? "";
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
  /** منذ 2026-11-12: شخص، وكالة، بوت، أو النظام. */
  actorKind: StaffDeskActorKind;
  /** صورة الشخص أو شعار الوكالة (https مطلق)، وإلا null. */
  actorAvatarUrl: string | null;
  /** ينتظر قراراً الآن (النوع يحتاج قراراً وهدفه لم يُحسم بعد). */
  needsDecision: boolean;
  /** سطر المصدر الجديد؛ `detail` يبقى للنسخ الأقدم من التطبيق. */
  source: string;
}

export interface StaffDeskNotificationsResponse {
  items: StaffDeskNotification[];
  nextCursor: string | null;
  /** الفئات المتاحة لهذا العضو بترتيب التبويبات. */
  categories: StaffDeskEventCategory[];
  /** عدد آخر 30 يوماً لكل تبويب. */
  counts: { all: number; tweet: number; opinion: number; news: number; message: number };
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
  /** نسخة العقد التي يفهمها التطبيق؛ 2 فأعلى تعرف فئة «رسائل». */
  v: z.coerce.number().int().min(1).max(99).optional().default(1),
});

/** POST /notifications/clear: «مسح الكل» في تبويب واحد أو في كل ما يراه العضو. */
export const staffDeskClearSchema = z.object({
  category: z.enum(["all", ...STAFF_DESK_EVENT_CATEGORIES]).optional().default("all"),
  v: z.coerce.number().int().min(1).max(99).optional().default(1),
});

export const staffDeskUnreadQuerySchema = z.object({
  v: z.coerce.number().int().min(1).max(99).optional().default(1),
});

export function staffDeskIncludesMessages(v: number | undefined): boolean {
  return (v ?? 1) >= STAFF_DESK_NOTIFICATIONS_V_MESSAGES;
}

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
    case "opinion_draft":
    case "news_draft":
    case "ticket_message": {
      // إعادة الإرسال بعد الإرجاع (أو رسالة ثانية على التذكرة) حدث جديد؛ النداء المزدوج في الدقيقة نفسها لا.
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
