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
}

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
  quietHours: StaffQuietHours;
}

export const DEFAULT_STAFF_ALERT_PREFS: StaffAlertPrefs = {
  aiAlerts: true,
  adminAlerts: true,
  writerMessages: true,
  socialProposals: true,
  opinionDrafts: true,
  quietHours: "off",
};

/** أنواع التنبيه التي يمكن إطفاؤها (كل حقل منطقي في التفضيلات). */
export type StaffAlertKind =
  | "aiAlerts"
  | "adminAlerts"
  | "writerMessages"
  | "socialProposals"
  | "opinionDrafts";

export const staffAlertPrefsUpdateSchema = z
  .object({
    aiAlerts: z.boolean().optional(),
    adminAlerts: z.boolean().optional(),
    writerMessages: z.boolean().optional(),
    socialProposals: z.boolean().optional(),
    opinionDrafts: z.boolean().optional(),
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
  | "server_error";

export interface StaffAppErrorBody {
  code: StaffAppErrorCode;
  message: string;
  details?: unknown;
  post?: unknown;
}
