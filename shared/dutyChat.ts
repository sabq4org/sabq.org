// «محادثة المناوب» — عقد مشترك ومنطق خالص (docs/systems/editorial/SYSTEM.md § محادثة المناوب).

export type DutyChatKind = "normal" | "alert";
export type DutyChatTick = "sent" | "delivered" | "read";

/** نافذة «متصل الآن»: نبضة القناة كل 25 ثانية، فثلاث نبضات فائتة تعني غير متصل. */
export const DUTY_CHAT_ONLINE_WINDOW_MS = 75_000;
export const DUTY_CHAT_HEARTBEAT_MS = 25_000;
export const DUTY_CHAT_MAX_BODY = 4000;
export const DUTY_CHAT_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const DUTY_CHAT_PAGE_SIZE = 60;

export const DUTY_CHAT_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

export interface DutyChatPeer {
  id: string;
  name: string;
  initial: string;
  online: boolean;
  lastSeenAt: string | null;
}

export interface DutyChatAttachment {
  name: string;
  mime: string;
  size: number;
  isImage: boolean;
  url: string;
}

export interface DutyChatMessage {
  id: string;
  senderId: string;
  recipientId: string;
  mine: boolean;
  body: string;
  kind: DutyChatKind;
  attachment: DutyChatAttachment | null;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  ackedAt: string | null;
}

export interface DutyChatConversation {
  peer: DutyChatPeer;
  last: DutyChatMessage;
  unread: number;
  /** «تنبيهات» وصلتني ولم أضغط عليها «استلمت» بعد. */
  pendingAcks: number;
}

export interface DutyChatInboxResponse {
  me: string;
  conversations: DutyChatConversation[];
  unreadTotal: number;
}

export interface DutyChatThreadResponse {
  peer: DutyChatPeer;
  messages: DutyChatMessage[];
  hasMore: boolean;
}

/** أحداث قناة البث /api/duty-chat/stream. */
export type DutyChatEvent =
  | { type: "message"; message: DutyChatMessage }
  | { type: "status"; peerId: string; ids: string[]; field: "deliveredAt" | "readAt" | "ackedAt"; at: string }
  | { type: "typing"; peerId: string };

/** حالة علامات الصح لرسالة أرسلتُها. */
export function tickFor(m: Pick<DutyChatMessage, "deliveredAt" | "readAt">): DutyChatTick {
  if (m.readAt) return "read";
  if (m.deliveredAt) return "delivered";
  return "sent";
}

export function isOnline(lastSeenAt: string | Date | null | undefined, now = Date.now()): boolean {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  return Number.isFinite(t) && now - t < DUTY_CHAT_ONLINE_WINDOW_MS && t - now < DUTY_CHAT_ONLINE_WINDOW_MS;
}

export function isAllowedAttachmentMime(mime: string | null | undefined): boolean {
  return !!mime && (DUTY_CHAT_ALLOWED_MIME as readonly string[]).includes(mime.toLowerCase());
}

export function initialOf(name: string): string {
  const trimmed = (name || "").trim();
  return trimmed ? Array.from(trimmed)[0] : "؟";
}

/** يقص النص ويحذف الأسطر الفارغة الزائدة في البداية والنهاية. */
export function normalizeBody(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\r\n/g, "\n").trim().slice(0, DUTY_CHAT_MAX_BODY);
}

/** اسم ملف آمن للعرض والتخزين: بلا مسارات ولا محارف تحكم، وطول محدود. */
export function safeFileName(raw: string | null | undefined, mime: string): string {
  const base = (raw || "").split(/[\\/]/).pop() || "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|*?:]/g, "").trim().slice(0, 120);
  if (cleaned) return cleaned;
  return mime === "application/pdf" ? "مرفق.pdf" : "صورة";
}

/**
 * أي محادثة تظهر في الشريط تحت بطاقة المناوبة:
 * 1) أحدث محادثة فيها رسائل غير مقروءة أو «تنبيه» لم يُؤكَّد، وإلا
 * 2) أحدث محادثة مع أحد المناوبين الآن (للمسؤول: آخر ما دار وحالة التنبيه)، أو
 * 3) إن كنتُ أنا المناوب الآن: أحدث محادثاتي، ليبقى طريق الرد على المدير ظاهرًا. وإلا لا شيء.
 */
export function pickStripConversation(
  conversations: readonly DutyChatConversation[],
  onDutyIds: readonly string[],
  meId?: string | null,
): DutyChatConversation | null {
  const byRecent = [...conversations].sort(
    (a, b) => new Date(b.last.createdAt).getTime() - new Date(a.last.createdAt).getTime(),
  );
  const pending = byRecent.find((c) => c.unread > 0 || c.pendingAcks > 0);
  if (pending) return pending;
  const duty = new Set(onDutyIds);
  const withDuty = byRecent.find((c) => duty.has(c.peer.id));
  if (withDuty) return withDuty;
  if (meId && duty.has(meId)) return byRecent[0] ?? null;
  return null;
}

/** تحديث رسائل محادثة مفتوحة بحدث حالة (تسليم/قراءة/استلام) دون إعادة تحميل. */
export function applyStatusEvent(
  messages: readonly DutyChatMessage[],
  ev: Extract<DutyChatEvent, { type: "status" }>,
): DutyChatMessage[] {
  const ids = new Set(ev.ids);
  return messages.map((m) => {
    if (!ids.has(m.id) || m[ev.field]) return m;
    const next: DutyChatMessage = { ...m, [ev.field]: ev.at };
    // القراءة تعني التسليم، والاستلام يعني القراءة.
    if (ev.field !== "deliveredAt" && !next.deliveredAt) next.deliveredAt = ev.at;
    if (ev.field === "ackedAt" && !next.readAt) next.readAt = ev.at;
    return next;
  });
}

/**
 * يدمج صفحتين من الرسائل بالمعرّف (الأحدث نسخةً يغلب) ويرتبها زمنيًا،
 * لئلا تختفي رسائل حين تتقدم الصفحة الأخيرة بعد تحميل الأقدم.
 */
export function mergeMessages(
  base: readonly DutyChatMessage[],
  newer: readonly DutyChatMessage[],
): DutyChatMessage[] {
  const byId = new Map<string, DutyChatMessage>();
  for (const m of base) byId.set(m.id, m);
  for (const m of newer) byId.set(m.id, m);
  return Array.from(byId.values()).sort((a, b) => {
    const d = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

/** يضيف رسالة جديدة مرة واحدة فقط (قد تصل من البث ومن رد الإرسال معًا). */
export function appendMessage(messages: readonly DutyChatMessage[], m: DutyChatMessage): DutyChatMessage[] {
  if (messages.some((x) => x.id === m.id)) return messages.slice();
  return [...messages, m];
}
