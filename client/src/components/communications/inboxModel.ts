import { displayTimeZone } from "@/lib/displayTimeZone";
// نموذج «الوارد» الموحّد لقنوات الاتصال: يحوّل سجل البريد وسجل واتساب إلى عنصر واحد،
// ويحسب «مسار الرسالة» (وصول، تحقق، تحرير، نشر). منطق خالص يُختبر وحده.

export type InboxChannel = "email" | "whatsapp";
export type InboxState = "processing" | "published" | "draft" | "rejected" | "failed";
export type TrackTone = "done" | "draft" | "fail" | "active" | "idle";
export type InboxFilter = "all" | InboxState;

interface EmailLogLike {
  id: string;
  fromEmail: string;
  fromName?: string | null;
  subject?: string | null;
  status: string;
  rejectionReason?: string | null;
  processingError?: string | null;
  senderVerified?: boolean | null;
  tokenVerified?: boolean | null;
  trustedSenderId?: string | null;
  articleId?: string | null;
  attachmentsCount?: number | null;
  receivedAt?: string | Date | null;
  aiAnalysis?: { contentQuality?: number; suggestedTitle?: string } | null;
}

interface WhatsappLogLike {
  id: string;
  from: string;
  message?: string | null;
  mediaUrls?: string[] | null;
  tokenId?: string | null;
  articleId?: string | null;
  articleLink?: string | null;
  publishStatus?: string | null;
  status: string;
  reason?: string | null;
  qualityScore?: number | null;
  createdAt?: string | Date | null;
}

export interface InboxItem<E = unknown, W = unknown> {
  /** فريد عبر القناتين. */
  key: string;
  id: string;
  channel: InboxChannel;
  at: Date | null;
  sender: string;
  /** البريد أو رقم الهاتف، يُعرض من اليسار لليمين. */
  senderAddress: string;
  title: string;
  state: InboxState;
  /** الخطوة التي توقفت عندها الرسالة (1 وصول، 2 تحقق، 3 تحرير، 4 نشر). */
  stoppedAt: 1 | 2 | 3 | 4;
  reason: string | null;
  articleId: string | null;
  articleLink: string | null;
  quality: number | null;
  attachments: number;
  canReprocess: boolean;
  email?: E;
  whatsapp?: W;
}

export const STATE_LABEL: Record<InboxState, string> = {
  processing: "قيد المعالجة",
  published: "منشور",
  draft: "مسودة",
  rejected: "مرفوض",
  failed: "تعطل",
};

export const INBOX_FILTERS: Array<{ value: InboxFilter; label: string }> = [
  { value: "all", label: "الكل" },
  { value: "published", label: "منشور" },
  { value: "draft", label: "مسودة" },
  { value: "rejected", label: "مرفوض" },
  { value: "failed", label: "تعطل" },
  { value: "processing", label: "قيد المعالجة" },
];

const REPROCESSABLE_REASONS = new Set(["processing_error", "processing_interrupted"]);
/** أسباب رفض تقع عند التحقق من المرسل والرمز، قبل أن يبدأ التحرير. */
const VERIFY_STAGE_REASONS = new Set([
  "sender_not_trusted",
  "sender_inactive",
  "invalid_token",
  "token_expired",
  "duplicate_content",
]);

const REJECTION_TEXT: Record<string, string> = {
  sender_not_trusted: "العنوان ليس في قائمة المرسلين الموثوقين",
  sender_inactive: "حساب المرسل موقوف",
  invalid_token: "الرمز غير موجود في الرسالة أو غير صحيح",
  token_expired: "انتهت صلاحية الرمز",
  duplicate_content: "رسالة مكررة: نفس المرسل والموضوع عولجا قبل قليل",
  quality_too_low: "النص لا يكفي لصياغة خبر",
  no_news_value: "المحتوى لا يحمل قيمة خبرية",
  no_content: "لا يوجد نص للخبر في الرسالة أو مرفقاتها",
  ai_content_empty: "تعذّر تحرير النص",
  processing_error: "انقطعت المعالجة قبل اكتمالها",
  processing_interrupted: "انقطعت المعالجة قبل اكتمالها",
};

export function reasonText(reason?: string | null): string | null {
  if (!reason) return null;
  return REJECTION_TEXT[reason] || reason;
}

function toDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function firstLine(text: string, max = 110): string {
  const line = text.split(/\r?\n/).map((part) => part.trim()).find(Boolean) || "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function fromEmailLog<E extends EmailLogLike>(log: E): InboxItem<E, never> {
  const state: InboxState =
    log.status === "published"
      ? "published"
      : log.status === "processed" || log.status === "drafted"
        ? "draft"
        : log.status === "rejected"
          ? "rejected"
          : log.status === "failed"
            ? "failed"
            : "processing";

  let stoppedAt: 1 | 2 | 3 | 4 = 4;
  if (state === "rejected") {
    stoppedAt = VERIFY_STAGE_REASONS.has(log.rejectionReason || "") ? 2 : log.tokenVerified ? 3 : 2;
  } else if (state === "failed" || state === "processing") {
    stoppedAt = log.tokenVerified ? 3 : 2;
  }

  const subject = (log.subject || "").trim();
  return {
    key: `email:${log.id}`,
    id: log.id,
    channel: "email",
    at: toDate(log.receivedAt),
    sender: (log.fromName || "").trim() || log.fromEmail,
    senderAddress: log.fromEmail,
    title: (log.aiAnalysis?.suggestedTitle || "").trim() || subject || "رسالة بلا عنوان",
    state,
    stoppedAt,
    reason: state === "rejected" || state === "failed" ? log.rejectionReason || null : null,
    articleId: log.articleId || null,
    articleLink: null,
    quality: typeof log.aiAnalysis?.contentQuality === "number" ? log.aiAnalysis.contentQuality : null,
    attachments: log.attachmentsCount || 0,
    canReprocess:
      log.status === "failed" &&
      log.tokenVerified === true &&
      !!log.trustedSenderId &&
      !log.articleId &&
      REPROCESSABLE_REASONS.has(log.rejectionReason || ""),
    email: log,
  };
}

export function fromWhatsappLog<W extends WhatsappLogLike>(log: W): InboxItem<never, W> {
  const state: InboxState =
    log.status === "processed"
      ? log.publishStatus === "published"
        ? "published"
        : "draft"
      : log.status === "rejected"
        ? "rejected"
        : log.status === "error" || log.status === "failed"
          ? "failed"
          : "processing";

  const stoppedAt: 1 | 2 | 3 | 4 = state === "published" || state === "draft" ? 4 : log.tokenId ? 3 : 2;
  const address = (log.from || "").replace(/^whatsapp:/i, "");
  return {
    key: `whatsapp:${log.id}`,
    id: log.id,
    channel: "whatsapp",
    at: toDate(log.createdAt),
    sender: address || "رقم غير معروف",
    senderAddress: address,
    title: firstLine(log.message || "") || "رسالة بلا نص",
    state,
    stoppedAt,
    reason: state === "rejected" || state === "failed" ? log.reason || null : null,
    articleId: log.articleId || null,
    articleLink: log.articleLink || null,
    quality: typeof log.qualityScore === "number" ? log.qualityScore : null,
    attachments: log.mediaUrls?.length || 0,
    canReprocess: false,
    whatsapp: log,
  };
}

/** ألوان الخطوات الأربع في شريط المسار. */
export function trackOf(item: Pick<InboxItem, "state" | "stoppedAt">): [TrackTone, TrackTone, TrackTone, TrackTone] {
  if (item.state === "published") return ["done", "done", "done", "done"];
  if (item.state === "draft") return ["done", "done", "done", "draft"];
  const stopTone: TrackTone = item.state === "processing" ? "active" : "fail";
  const tones = [1, 2, 3, 4].map((step) =>
    step < item.stoppedAt ? "done" : step === item.stoppedAt ? stopTone : "idle",
  ) as [TrackTone, TrackTone, TrackTone, TrackTone];
  return tones;
}

export interface TrackStep {
  n: number;
  title: string;
  note: string;
  tone: TrackTone;
}

export function stepsOf(item: InboxItem, autoPublishOff = false): TrackStep[] {
  const tones = trackOf(item);
  const via = item.channel === "whatsapp" ? "واتساب" : "البريد";
  const why = reasonText(item.reason);
  const failed = item.state === "failed";
  const rejected = item.state === "rejected";

  const verify: TrackStep =
    tones[1] === "fail"
      ? {
          n: 2,
          title: rejected ? "رُفضت عند التحقق" : "تعطلت عند التحقق",
          note: why || "لم يكتمل التحقق من المرسل والرمز",
          tone: "fail",
        }
      : tones[1] === "active"
        ? { n: 2, title: "التحقق من المرسل والرمز", note: "جارٍ الآن", tone: "active" }
        : { n: 2, title: "تحقق المرسل والرمز", note: "مرسل موثوق ورمز ساري", tone: tones[1] };

  let edit: TrackStep;
  if (tones[2] === "fail") {
    edit = {
      n: 3,
      title: rejected ? "رُفضت بعد التحرير" : "تعطل أثناء التحرير",
      note: item.canReprocess
        ? `${why || "انقطعت المعالجة"}. النص${item.attachments > 0 ? " والمرفقات" : ""} محفوظة ويمكن إعادتها بضغطة`
        : why || (failed ? "انقطعت المعالجة ولم يُنشر شيء" : "لم تُقبل الرسالة"),
      tone: "fail",
    };
  } else if (tones[2] === "active") {
    edit = { n: 3, title: "التحرير بالذكاء", note: "جارٍ الآن، يأخذ حتى دقيقة", tone: "active" };
  } else if (tones[2] === "done") {
    edit = {
      n: 3,
      title: "حرّرها المحرر الذكي",
      note: item.quality !== null ? `صياغة بأسلوب سبق · جودة النص ${item.quality} من 100` : "صياغة بأسلوب سبق",
      tone: "done",
    };
  } else {
    edit = { n: 3, title: "التحرير", note: "لم يبدأ", tone: "idle" };
  }

  let publish: TrackStep;
  if (item.state === "published") {
    publish = { n: 4, title: "نُشر الخبر", note: "ظهر في الموقع تلقائيًا", tone: "done" };
  } else if (item.state === "draft") {
    publish = {
      n: 4,
      title: "حُفظت مسودة",
      note: autoPublishOff ? "النشر التلقائي متوقف لهذا المرسل، تنتظر مراجعة محرر" : "تنتظر مراجعة محرر قبل النشر",
      tone: "draft",
    };
  } else {
    publish = {
      n: 4,
      title: "النشر",
      note: item.canReprocess ? "ينتظر إعادة المعالجة" : "لم يبدأ",
      tone: "idle",
    };
  }

  return [{ n: 1, title: "وصلت الرسالة", note: `عبر ${via}`, tone: "done" }, verify, edit, publish];
}

export function mergeInbox(...lists: InboxItem[][]): InboxItem[] {
  return lists
    .flat()
    .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
}

/** قيمة `status` التي يفهمها مسار سجلات البريد لكل مرشّح. */
export function emailStatusFor(filter: InboxFilter): string {
  if (filter === "draft") return "processed";
  if (filter === "processing") return "received";
  return filter;
}

/** قيمة `status` لمسار سجلات واتساب؛ المنشور والمسودة كلاهما `processed` ويُفرزان بعد الجلب. */
export function whatsappStatusFor(filter: InboxFilter): string {
  if (filter === "published" || filter === "draft") return "processed";
  if (filter === "failed") return "error";
  if (filter === "processing") return "received";
  return filter;
}

const riyadhDay = new Intl.DateTimeFormat("en-CA", { timeZone: displayTimeZone(), year: "numeric", month: "2-digit", day: "2-digit" });
const riyadhClock = new Intl.DateTimeFormat("en-GB", { timeZone: displayTimeZone(), hour: "2-digit", minute: "2-digit", hour12: false });
const riyadhShort = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: displayTimeZone(), day: "numeric", month: "short" });

/** وقت الصف بتوقيت جهاز المستخدم: الساعة لرسائل اليوم، واليوم والشهر لما قبله. */
export function inboxTime(at: Date | null, now: Date = new Date()): { primary: string; secondary: string | null } {
  if (!at) return { primary: "—", secondary: null };
  const clock = riyadhClock.format(at);
  if (riyadhDay.format(at) === riyadhDay.format(now)) return { primary: clock, secondary: null };
  return { primary: riyadhShort.format(at), secondary: clock };
}

export interface FlowCounts {
  published: number;
  draft: number;
  rejected: number;
  failed: number;
  total: number;
}

/** أرقام «أين ذهبت رسائل اليوم» من إحصاءات القناتين. */
export function flowCounts(
  email?: { emailsReceived?: number; emailsPublished?: number; emailsDrafted?: number; emailsRejected?: number; emailsFailed?: number } | null,
  whatsapp?: { newMessages?: number; publishedToday?: number; draftedToday?: number; rejectedToday?: number } | null,
): FlowCounts {
  const published = (email?.emailsPublished ?? 0) + (whatsapp?.publishedToday ?? 0);
  const draft = (email?.emailsDrafted ?? 0) + (whatsapp?.draftedToday ?? 0);
  const rejected = (email?.emailsRejected ?? 0) + (whatsapp?.rejectedToday ?? 0);
  const failed = email?.emailsFailed ?? 0;
  const whatsappTotal =
    (whatsapp?.newMessages ?? 0) + (whatsapp?.publishedToday ?? 0) + (whatsapp?.draftedToday ?? 0) + (whatsapp?.rejectedToday ?? 0);
  const total = Math.max((email?.emailsReceived ?? 0) + whatsappTotal, published + draft + rejected + failed);
  return { published, draft, rejected, failed, total };
}
