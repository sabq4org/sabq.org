// عقد HTTP لواجهة بوت النشر على X — /api/internal/bot-social
// التوثيق: docs/systems/social-publishing/BOT_SOCIAL_API.md
import { z } from "zod";

export const BOT_SOCIAL_BASE_PATH = "/api/internal/bot-social";

export const BOT_SOCIAL_STATUSES = [
  "draft",
  "scheduled",
  "processing",
  "published",
  "failed",
  "canceled",
] as const;

export type BotSocialStatus = (typeof BOT_SOCIAL_STATUSES)[number];

export const botSocialClientReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

const articleIdSchema = z.string().trim().min(1).max(80);
const textSchema = z.string().trim().min(1).max(2000);
const textSourceSchema = z.enum(["title", "title_link", "custom", "ai"]);
const imageSourceSchema = z.enum(["article", "upload", "library", "none"]);

/** حقول التأليف المشتركة. الغياب عند إعادة المحاولة يُبقي المحتوى المخزّن. */
const composeFields = {
  text: textSchema.optional(),
  textSource: textSourceSchema.optional(),
  includeLink: z.boolean().optional(),
  imageSource: imageSourceSchema.optional(),
  imageUrl: z.string().trim().max(2000).nullish(),
};

export const botSocialSuggestSchema = z.object({
  articleId: articleIdSchema,
});

export const botSocialPreviewSchema = z.object({
  articleId: articleIdSchema,
  ...composeFields,
});

export const botSocialPublishSchema = z.object({
  articleId: articleIdSchema,
  clientReference: botSocialClientReferenceSchema,
  ...composeFields,
});

export const botSocialScheduleSchema = botSocialPublishSchema.extend({
  scheduledAt: z.string().datetime({ offset: true }),
});

export const botSocialCancelSchema = z
  .object({
    id: z.string().trim().min(1).max(80).optional(),
    clientReference: botSocialClientReferenceSchema.optional(),
    reason: z.string().trim().max(1000).optional(),
  })
  .refine((value) => Boolean(value.id || value.clientReference), {
    message: "يلزم id أو clientReference",
  });

export const botSocialListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  articleId: articleIdSchema.optional(),
  status: z.enum(BOT_SOCIAL_STATUSES).optional(),
  clientReference: botSocialClientReferenceSchema.optional(),
});

export interface BotSocialErrorBody {
  code: string;
  message: string;
  details?: unknown;
  post?: unknown;
}

export type BotSocialTextSource = z.infer<typeof textSourceSchema>;
export type BotSocialImageSource = z.infer<typeof imageSourceSchema>;
export type BotSocialPublishInput = z.infer<typeof botSocialPublishSchema>;
export type BotSocialScheduleInput = z.infer<typeof botSocialScheduleSchema>;
export type BotSocialPreviewInput = z.infer<typeof botSocialPreviewSchema>;
export type BotSocialCancelInput = z.infer<typeof botSocialCancelSchema>;
export type BotSocialListQuery = z.infer<typeof botSocialListQuerySchema>;
