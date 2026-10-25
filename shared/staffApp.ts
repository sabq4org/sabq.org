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

export const STAFF_SENDER_KINDS = ["writer", "reporter", "agency"] as const;
export type StaffSenderKind = (typeof STAFF_SENDER_KINDS)[number];

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
}

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
