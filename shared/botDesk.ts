import { z } from "zod";
import { opinionTicketStatuses } from "./schema";

export const BOT_DESK_BASE_PATH = "/api/internal/bot-desk" as const;
export const BOT_DESK_AUDIT_CHANNEL = "bot-desk-api" as const;

export const BOT_DESK_AUTHOR_KINDS = [
  "reporter",
  "opinion_author",
  "angle_writer",
  "other",
  "all",
] as const;

export const BOT_DESK_SOCIAL_PROPOSAL_KINDS = ["author", "agency", "all"] as const;
export type BotDeskSocialProposalKind = (typeof BOT_DESK_SOCIAL_PROPOSAL_KINDS)[number];

const unreadFilterSchema = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((val) => val === true || val === "true" || val === "1")
  .optional();

export const botDeskTicketsQuerySchema = z.object({
  status: z.enum(opinionTicketStatuses).optional(),
  authorKind: z.enum(BOT_DESK_AUTHOR_KINDS).optional(),
  unread: unreadFilterSchema,
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const botDeskTicketReplySchema = z
  .object({
    message: z.string().trim().min(1, "نص الرسالة مطلوب").max(10_000, "الرسالة طويلة جداً"),
    parentMessageId: z.string().trim().min(1).max(128).nullish(),
  })
  .strict();

export const botDeskTicketStatusSchema = z
  .object({
    status: z.enum(opinionTicketStatuses),
  })
  .strict();

export const botDeskSocialPendingQuerySchema = z.object({
  kind: z.enum(BOT_DESK_SOCIAL_PROPOSAL_KINDS).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const botDeskSocialRejectSchema = z
  .object({
    reason: z.string().trim().max(1000, "السبب طويل جداً").nullish(),
  })
  .strict();

export const botDeskSocialPublishSchema = z.object({}).strict();

/** تغريدة يطلبها المحرر من «نشر سبق» لخبر منشور (تُنشر أو تُحال للمكتب حسب صلاحيته). */
const editorTweetTarget = {
  articleId: z.string().trim().min(1).max(128).optional(),
  /** رابط الخبر العام على sabq.org بديلاً عن المعرّف. */
  articleUrl: z.string().trim().min(1).max(2048).optional(),
  includeLink: z.boolean().default(true),
  includeImage: z.boolean().default(true),
};
const hasEditorTweetTarget = (v: { articleId?: string; articleUrl?: string }) =>
  Boolean(v.articleId || v.articleUrl);

export const botDeskEditorTweetSchema = z
  .object({
    ...editorTweetTarget,
    text: z.string().trim().min(1, "نص التغريدة مطلوب").max(25_000, "النص طويل جداً"),
  })
  .strict()
  .refine(hasEditorTweetTarget, { message: "معرّف الخبر أو رابطه مطلوب" });

/** معاينة بلا كتابة: النص اختياري (غيابه = عنوان الخبر). */
export const botDeskEditorTweetPreviewSchema = z
  .object({
    ...editorTweetTarget,
    text: z.string().trim().max(25_000, "النص طويل جداً").optional(),
  })
  .strict()
  .refine(hasEditorTweetTarget, { message: "معرّف الخبر أو رابطه مطلوب" });

export const botDeskSocialScheduleSchema = z
  .object({
    scheduledAt: z
      .string()
      .datetime({ offset: true, message: "صيغة وقت الجدولة غير صالحة (ISO مع المنطقة الزمنية)" }),
  })
  .strict();

export type BotDeskTicketsQuery = z.infer<typeof botDeskTicketsQuerySchema>;
export type BotDeskTicketReplyInput = z.infer<typeof botDeskTicketReplySchema>;
export type BotDeskTicketStatusInput = z.infer<typeof botDeskTicketStatusSchema>;
export type BotDeskSocialPendingQuery = z.infer<typeof botDeskSocialPendingQuerySchema>;
export type BotDeskSocialRejectInput = z.infer<typeof botDeskSocialRejectSchema>;
export type BotDeskSocialScheduleInput = z.infer<typeof botDeskSocialScheduleSchema>;

export type BotDeskErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "ticket_closed"
  | "conflict"
  | "rate_limited"
  | "publish_failed"
  | "social_disabled"
  | "server_error";

export interface BotDeskErrorBody {
  code: BotDeskErrorCode;
  message: string;
  details?: unknown;
  post?: unknown;
}
