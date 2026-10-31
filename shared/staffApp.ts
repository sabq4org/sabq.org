import { z } from "zod";
import { opinionTicketStatuses } from "./schema";

export const STAFF_APP_BASE_PATH = "/api/v1/staff" as const;
export const STAFF_APP_AUDIT_CHANNEL = "staff-app" as const;
export const STAFF_APP_BUNDLE_ID = "com.sabq.desk" as const;
export const READER_APP_BUNDLE_ID = "com.sabq.sabqorg" as const;

export const STAFF_INBOX_TYPES = ["all", "ticket", "social"] as const;
export type StaffInboxType = (typeof STAFF_INBOX_TYPES)[number];

export const STAFF_INBOX_ITEM_KINDS = ["ticket", "social"] as const;
export type StaffInboxItemKind = (typeof STAFF_INBOX_ITEM_KINDS)[number];

export const STAFF_SENDER_KINDS = ["writer", "reporter", "agency", "organization"] as const;
export type StaffSenderKind = (typeof STAFF_SENDER_KINDS)[number];

/** صورة المرسل: تمرّر الروابط المطلقة https فقط، وإلا null. */
export function safeStaffAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^https:\/\/[^\s]+$/i.test(trimmed) ? trimmed : null;
}

const STAFF_WRITER_ROLE_NAMES = new Set(["opinion_author", "angle_writer"]);
const STAFF_REPORTER_ROLE_NAMES = new Set(["reporter", "journalist", "correspondent"]);

/**
 * نوع مرسل المنشور الاجتماعي: وكالة ← agency؛ كاتب رأي ← writer؛
 * مراسل/صحفي ← reporter؛ وأي حساب منسوب آخر (مدير، محرر…) ← organization.
 * `roles` غير معروفة (undefined) تبقي السلوك القديم: writer.
 */
export function resolveStaffSocialSenderKind(input: {
  isAgency: boolean;
  roles?: readonly string[] | null;
}): StaffSenderKind {
  if (input.isAgency) return "agency";
  if (!input.roles) return "writer";
  if (input.roles.some((r) => STAFF_WRITER_ROLE_NAMES.has(r))) return "writer";
  if (input.roles.some((r) => STAFF_REPORTER_ROLE_NAMES.has(r))) return "reporter";
  return "organization";
}

/** true = سحبه صاحبه، false = رفضه غيره، null = غير ملغى أو غير معروف. */
export function computeStaffCanceledBySelf(post: {
  status: string;
  canceledByUserId?: string | null;
  createdByUserId?: string | null;
}): boolean | null {
  if (post.status !== "canceled" || !post.canceledByUserId || !post.createdByUserId) return null;
  return post.canceledByUserId === post.createdByUserId;
}

const unreadQuerySchema = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((val) => val === true || val === "true" || val === "1")
  .optional();

export const staffInboxQuerySchema = z.object({
  type: z.enum(STAFF_INBOX_TYPES).default("all"),
  status: z.string().trim().min(1).max(64).optional(),
  unread: unreadQuerySchema,
  q: z.string().trim().max(200).optional(),
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const staffTicketReplySchema = z
  .object({
    message: z.string().trim().min(1, "نص الرسالة مطلوب").max(10_000, "الرسالة طويلة جداً"),
    parentMessageId: z.string().trim().min(1).max(128).nullish(),
  })
  .strict();

export const staffTicketStatusSchema = z
  .object({
    status: z.enum(opinionTicketStatuses),
  })
  .strict();

export const staffSocialPublishSchema = z.object({}).strict();

export const staffSocialScheduleSchema = z
  .object({
    scheduledAt: z
      .string()
      .datetime({ offset: true, message: "صيغة وقت الجدولة غير صالحة (ISO مع المنطقة الزمنية)" }),
  })
  .strict();

export const staffSocialRejectSchema = z
  .object({
    reason: z.string().trim().max(1000, "السبب طويل جداً").nullish(),
  })
  .strict();

export type StaffInboxQuery = z.infer<typeof staffInboxQuerySchema>;
export type StaffTicketReplyInput = z.infer<typeof staffTicketReplySchema>;
export type StaffTicketStatusInput = z.infer<typeof staffTicketStatusSchema>;
export type StaffSocialScheduleInput = z.infer<typeof staffSocialScheduleSchema>;
export type StaffSocialRejectInput = z.infer<typeof staffSocialRejectSchema>;

export interface StaffCapabilities {
  canTickets: boolean;
  canSocial: {
    view: boolean;
    publish: boolean;
    schedule: boolean;
    reject: boolean;
  };
  /** صحة النظام (ai_hub.view). */
  canSystemHealth: boolean;
  /** تنبيهات الإدارة — القاعدة نفسها (ai_hub.view). */
  canAdminAlerts: boolean;
  /** تحديث أرصدة النماذج وحدود تنبيهها (ai_hub.view + ai_hub.manage). القراءة تكفيها canSystemHealth. */
  canManageBalances: boolean;
  /**
   * تبويب «الرأي» (منذ 2026-10-28). اختياري في فك ترميز iOS (الافتراضي كله false).
   * القواعد في computeStaffOpinionCapabilities.
   */
  canOpinion: StaffOpinionCapabilities;
  /**
   * أخبار «نشر سبق» في مركز التنبيهات (articles.publish، منذ 2026-10-29).
   * اختياري في فك ترميز iOS (الافتراضي false).
   */
  canPublisherNews: boolean;
  /**
   * تبويب «الأخبار» للمشرف (مسودات المراسلين وطلبات التعديل) — articles.publish
   * (قرار المالك 2026-10-31). اختياري في فك ترميز iOS (الافتراضي false).
   */
  canNews: boolean;
  /** يرسل خبراً من التطبيق: دور مراسل (reporter/correspondent/journalist). */
  canReport: boolean;
  /** يرسل مقال رأي من التطبيق: دور كاتب (opinion_author/columnist/…). */
  canWrite: boolean;
}

export interface StaffOpinionCapabilities {
  view: boolean;
  schedule: boolean;
  publish: boolean;
  returnToWriter: boolean;
}

/**
 * صلاحيات تبويب الرأي من RBAC الحي، مطابقة لمسارات الويب:
 *  - view: opinion.review أو articles.schedule (مثل week-board وnext-slot).
 *  - schedule: articles.schedule أو articles.publish (جدولة الويب schedule-article تشترط articles.publish).
 *  - publish: articles.publish (مثل /api/dashboard/opinion/:id/publish).
 *  - returnToWriter: opinion.review أو articles.edit_any (request-revision على الويب يشترط edit_any).
 * أي فعل يشترط view أيضاً، فلا يظهر زر بلا شاشة.
 */
export function computeStaffOpinionCapabilities(has: {
  opinionReview: boolean;
  articlesSchedule: boolean;
  articlesPublish: boolean;
  articlesEditAny: boolean;
}): StaffOpinionCapabilities {
  const view = has.opinionReview || has.articlesSchedule;
  return {
    view,
    schedule: view && (has.articlesSchedule || has.articlesPublish),
    publish: view && has.articlesPublish,
    returnToWriter: view && (has.opinionReview || has.articlesEditAny),
  };
}

// ── تبويب الرأي (/opinion/*) ─────────────────────────────────────────

/** حالة المقال كما يراها المكتب. published للعرض فقط (بلا أزرار). */
export const STAFF_OPINION_ARTICLE_STATUSES = ["new_draft", "in_prep", "scheduled", "published"] as const;
export type StaffOpinionArticleStatus = (typeof STAFF_OPINION_ARTICLE_STATUSES)[number];

export type StaffOpinionSlotState = "arrived" | "missing" | "scheduled" | "published" | "late";

/**
 * يحوّل صف مقال رأي إلى حالة المكتب، أو null إن لم يكن من شأن المكتب
 * (مسودة الكاتب الخاصة، أعيد للكاتب، مرفوض، مؤرشف).
 *  - new_draft: بانتظار التحرير (pending_review أو مسودة موبايل قديمة بلا reviewStatus).
 *  - in_prep: معتمد (approved) ولم يُجدول بعد.
 */
export function resolveStaffOpinionArticleStatus(row: {
  status: string | null | undefined;
  reviewStatus: string | null | undefined;
  source?: string | null;
}): StaffOpinionArticleStatus | null {
  if (row.status === "published") return "published";
  if (row.status === "scheduled") return "scheduled";
  if (row.status !== "draft") return null;
  if (row.reviewStatus === "approved") return "in_prep";
  if (row.reviewStatus === "pending_review") return "new_draft";
  if (row.reviewStatus == null && (row.source === "ios-app" || row.source === "android-app")) {
    return "new_draft";
  }
  return null;
}

export interface StaffOpinionWriter {
  id: string;
  name: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  /** weekday: 0 = الأحد … 6 = السبت؛ publishTime HH:mm بتوقيت الرياض. */
  fixedSlot: { weekday: number; publishTime: string } | null;
}

export interface StaffOpinionItem {
  writer: StaffOpinionWriter;
  /** موعد الخانة (أو موعد الجدولة الفعلي للمجدول). null = بلا موعد ثابت. */
  slotAt: string | null;
  state: StaffOpinionSlotState;
  article: {
    id: string;
    title: string;
    status: StaffOpinionArticleStatus;
    /** آخر إرسال/تعديل من الكاتب (updatedAt). */
    submittedAt: string | null;
    scheduledAt: string | null;
    publishedAt: string | null;
  } | null;
  deeplink: string | null;
}

export interface StaffOpinionBoardDay {
  /** YYYY-MM-DD بتوقيت الرياض */
  date: string;
  weekday: number;
  counts: { draft: number; prep: number; scheduled: number; missing: number };
}

export interface StaffOpinionBoard {
  weekStart: string;
  days: StaffOpinionBoardDay[];
  slots: StaffOpinionItem[];
  unslotted: StaffOpinionItem[];
  /** new_draft + in_prep — شارة التبويب. */
  pendingCount: number;
}

export interface StaffOpinionWarning {
  code: "slot_clash";
  message: string;
  otherWriterName: string;
  otherArticleId: string;
}

const isoDateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "صيغة التاريخ YYYY-MM-DD");

/** POST /opinion/:id/renotify — ما أرسلته قنوات المكتب فعلاً (لا تغيير على المقال). */
export interface StaffOpinionRenotifyResponse {
  ok: true;
  /** عدد أجهزة تطبيق الديسك التي قبلت الـ push (0 إن عطّل الجميع تنبيه مسودات الرأي). */
  pushSent: number;
  /** قبل مزوّد البريد رسالة واحدة على الأقل لبوت «مكتب سبق». */
  emailSent: boolean;
  /** عدد مستلمي بريد البوت المهيّئين (DESK_BOT_ALERT_EMAILS + deskBotAlertEmails). */
  emailRecipients: number;
}

export const staffOpinionBoardQuerySchema = z.object({
  weekStart: isoDateOnly.optional(),
});

export const staffOpinionScheduleSchema = z.union([
  z.object({ mode: z.literal("fixed_slot") }).strict(),
  z
    .object({
      scheduledAt: z
        .string()
        .datetime({ offset: true, message: "صيغة وقت الجدولة غير صالحة (ISO مع المنطقة الزمنية)" }),
    })
    .strict(),
]);

export const staffOpinionSlotCheckQuerySchema = z.object({
  scheduledAt: z
    .string()
    .datetime({ offset: true, message: "صيغة وقت الجدولة غير صالحة (ISO مع المنطقة الزمنية)" }),
});

export const staffOpinionReturnSchema = z
  .object({
    note: z
      .string({ error: "اكتب ملاحظتك للكاتب" })
      .trim()
      .min(3, "اكتب ملاحظتك للكاتب (3 أحرف على الأقل)")
      .max(2000, "الملاحظة طويلة جداً"),
  })
  .strict();

/** «جهّز وجدول»: بلا جسم = موعد الكاتب الثابت؛ أو scheduledAt لموعد آخر. */
export const staffOpinionPrepareSchema = z
  .object({
    scheduledAt: z
      .string()
      .datetime({ offset: true, message: "صيغة وقت الجدولة غير صالحة (ISO مع المنطقة الزمنية)" })
      .optional(),
  })
  .strict();

/** خطوات التجهيز بالترتيب: تدقيق ← ملحقات ← صورة ← حفظ وجدولة. */
export const STAFF_OPINION_PREP_STEPS = ["proofread", "enrich", "image", "schedule"] as const;
export type StaffOpinionPrepStep = (typeof STAFF_OPINION_PREP_STEPS)[number];

export const STAFF_OPINION_PREP_STEP_LABELS: Record<StaffOpinionPrepStep, string> = {
  proofread: "تدقيق العنوان والنص",
  enrich: "توليد الموجز والكلمات المفتاحية وSEO",
  image: "توليد صورة GPT",
  schedule: "الحفظ والجدولة",
};

export interface StaffOpinionPrepJob {
  articleId: string;
  status: "running" | "done" | "failed";
  /** الخطوة الجارية، أو التي فشلت. */
  step: StaffOpinionPrepStep | null;
  stepLabel: string | null;
  startedAt: string;
  finishedAt: string | null;
  scheduledAt: string | null;
  titleChanged: boolean;
  contentFixes: number;
  /** generated = صورة جديدة؛ kept = للمقال صورة فأُبقيت؛ failed = تعذرت فجُدول بلا صورة. */
  image: "generated" | "kept" | "failed" | null;
  /** التصنيف الذي اختاره التجهيز (اسمه العربي)، أو null إن بقي تصنيف الكاتب. */
  categoryName?: string | null;
  message: string | null;
}

export type StaffOpinionScheduleInput = z.infer<typeof staffOpinionScheduleSchema>;
export type StaffOpinionReturnInput = z.infer<typeof staffOpinionReturnSchema>;

/**
 * الساعات الهادئة لتطبيق الديسك (بتوقيت الرياض): ما يصل خلالها يصل بصمت
 * (interruption-level = passive، بلا صوت) ويبقى في مركز الإشعارات.
 */
export const STAFF_QUIET_HOURS = ["off", "night", "offhours"] as const;
export type StaffQuietHours = (typeof STAFF_QUIET_HOURS)[number];

/** [بداية, نهاية) بالساعة؛ النافذة تعبر منتصف الليل. */
export const STAFF_QUIET_HOURS_WINDOWS: Record<Exclude<StaffQuietHours, "off">, [number, number]> = {
  night: [23, 7],
  offhours: [17, 8],
};

export function isStaffQuietHour(quietHours: StaffQuietHours, riyadhHour: number): boolean {
  if (quietHours === "off") return false;
  const window = STAFF_QUIET_HOURS_WINDOWS[quietHours];
  if (!window) return false;
  const [start, end] = window;
  return start > end ? riyadhHour >= start || riyadhHour < end : riyadhHour >= start && riyadhHour < end;
}

export interface StaffAlertPrefs {
  aiAlerts: boolean;
  adminAlerts: boolean;
  /** رسائل الكتّاب: استفسار جديد أو رد من كاتب. */
  writerMessages: boolean;
  /** مقترحات النشر على X من الكتّاب والوكالات. */
  socialProposals: boolean;
  /** مقالات الرأي الجديدة بانتظار المراجعة والجدولة (منذ 2026-10-28). */
  opinionDrafts: boolean;
  /** خبر جديد نشره زميل أو شريك من تطبيق «نشر سبق» (منذ 2026-10-29). */
  publisherNews: boolean;
  /** خبر من مراسل بانتظار القرار، أو طلب تعديل على خبر (منذ 2026-10-31). */
  newsDrafts: boolean;
  quietHours: StaffQuietHours;
}

export const DEFAULT_STAFF_ALERT_PREFS: StaffAlertPrefs = {
  aiAlerts: true,
  adminAlerts: true,
  writerMessages: true,
  socialProposals: true,
  opinionDrafts: true,
  publisherNews: true,
  newsDrafts: true,
  quietHours: "off",
};

/** أنواع التنبيه التي يمكن إطفاؤها (كل حقل منطقي في التفضيلات). */
export type StaffAlertKind =
  | "aiAlerts"
  | "adminAlerts"
  | "writerMessages"
  | "socialProposals"
  | "opinionDrafts"
  | "publisherNews"
  | "newsDrafts";

export const staffAlertPrefsUpdateSchema = z
  .object({
    aiAlerts: z.boolean().optional(),
    adminAlerts: z.boolean().optional(),
    writerMessages: z.boolean().optional(),
    socialProposals: z.boolean().optional(),
    opinionDrafts: z.boolean().optional(),
    publisherNews: z.boolean().optional(),
    newsDrafts: z.boolean().optional(),
    quietHours: z.enum(STAFF_QUIET_HOURS).optional(),
  })
  .strict();

// ── أرصدة النماذج (للمدراء) ─────────────────────────────────────────
export const STAFF_AI_BALANCE_PROVIDERS = ["deepseek", "openai", "anthropic", "gemini", "elevenlabs"] as const;
export const staffAiBalanceProviderSchema = z.enum(STAFF_AI_BALANCE_PROVIDERS);
export type StaffAiBalanceProvider = z.infer<typeof staffAiBalanceProviderSchema>;

/**
 * POST /system/balances/:provider/topup
 *  - add: «أضفتُ شحنة جديدة» (amountUsd = مبلغ الشحنة، topupAt = تاريخها).
 *  - set: «الرصيد الحالي في اللوحة» (amountUsd = الرصيد المعروض الآن).
 *  - budget: الميزانية الشهرية لـ Gemini.
 * threshold اختياري يحفظ حد التنبيه في الطلب نفسه.
 */
export const staffAiBalanceTopupSchema = z
  .object({
    mode: z.enum(["add", "set", "budget"]),
    amountUsd: z.number().positive().max(1_000_000),
    topupAt: z.string().datetime({ offset: true }).optional().nullable(),
    threshold: z.number().positive().max(100_000_000).optional().nullable(),
  })
  .strict();

/** PUT /system/balances/:provider/threshold — الحد بوحدة المزوّد (دولار، أو أحرف لـ ElevenLabs). */
export const staffAiBalanceThresholdSchema = z
  .object({
    threshold: z.number().positive().max(100_000_000),
  })
  .strict();

export interface StaffInboxItem {
  id: string;
  kind: StaffInboxItemKind;
  title: string;
  previewText: string;
  preview: string;
  sender: {
    id: string | null;
    name: string;
    kind: StaffSenderKind;
    roleKind?: string;
    /** رابط https مطلق أو null. */
    avatarUrl?: string | null;
  };
  createdAt: string;
  updatedAt: string;
  status: string;
  hasUnread: boolean;
  deeplink: string;
  /** Social only: ISO time the post is scheduled for (status `scheduled`). */
  scheduledAt?: string | null;
  /** Social only: ISO time the post went out (status `published`). */
  publishedAt?: string | null;
  /** Social only: the rejection reason (`canceled`) or last publish error (`failed`). */
  lastError?: string | null;
  /** Social only: true سحب صاحبه، false رفض غيره، null غير ملغى. */
  canceledBySelf?: boolean | null;
  article?: {
    id: string;
    title: string | null;
    url: string | null;
    imageUrl: string | null;
  } | null;
}

export interface StaffInboxCursorPayload {
  t: string;
  k: StaffInboxItemKind;
  id: string;
}

const cursorPayloadSchema = z.object({
  t: z.string().refine((val) => !Number.isNaN(Date.parse(val)), "invalid timestamp"),
  k: z.enum(STAFF_INBOX_ITEM_KINDS),
  id: z.string().min(1).max(128),
});

export function encodeStaffInboxCursor(payload: StaffInboxCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeStaffInboxCursor(raw: string): StaffInboxCursorPayload | null {
  try {
    if (!raw || typeof raw !== "string") return null;
    const jsonText = Buffer.from(raw.trim(), "base64url").toString("utf8");
    const parsed = JSON.parse(jsonText);
    const validated = cursorPayloadSchema.safeParse(parsed);
    if (!validated.success) return null;
    return validated.data;
  } catch {
    return null;
  }
}

export type StaffAppErrorCode =
  | "unauthorized"
  | "two_factor_required"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "ticket_closed"
  | "conflict"
  | "rate_limited"
  | "publish_failed"
  | "not_implemented"
  | "server_error";

export interface StaffAppErrorBody {
  code: StaffAppErrorCode;
  message: string;
  details?: unknown;
  post?: unknown;
}

const TITLE_PUNCT_RE = /[،,؛;:.!?؟…\-–—"«»'()]/g;

/**
 * حارس عنوان مقال الرأي في «جهّز وجدول»: التدقيق لا يضيف فواصل.
 * يحذف كل فاصلة (، أو ,) لم تكن في الأصل، وإن كان الفرق ترقيماً فقط يُعاد الأصل.
 */
export function guardOpinionTitleCommas(original: string, corrected: string): string {
  const orig = original.replace(/\s+/g, " ").trim();
  const hadComma = /[،,]/.test(orig);
  let out = hadComma ? corrected : corrected.replace(/\s*[،,]\s*/g, " ");
  out = out.replace(/\s+/g, " ").trim();
  const bare = (t: string) => t.replace(TITLE_PUNCT_RE, "").replace(/\s+/g, " ").trim();
  if (!out || bare(out) === bare(orig)) return original;
  return out;
}
