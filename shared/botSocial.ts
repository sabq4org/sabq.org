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
const articleUrlSchema = z.string().trim().min(1).max(2000);
/** تغريدة الخبر: سقف النص كما هو (2000 حرفاً). الحد الموزون 25000 يبقى في الخدمة. */
const textSchema = z.string().trim().min(1).max(2000);
/**
 * منشور بلا خبر: السقف الصلب 2000 موزوناً يُفرض في الخدمة.
 * 4000 هنا حتى يصل نص أطول من 2000 إلى فحص الوزن بدل أن يُرفض كطول نص خام.
 */
const originalTextSchema = z.string().trim().min(1).max(4000);
const textSourceSchema = z.enum(["title", "title_link", "custom", "ai"]);
const imageSourceSchema = z.enum(["article", "upload", "library", "none"]);
const originalImageUrlSchema = z.string().trim().min(1).max(2000);

/** رفع صور مصممة قبل النشر. نفس توكن البوت، وليس مساراً عاماً. */
export const BOT_SOCIAL_IMAGES_PATH = `${BOT_SOCIAL_BASE_PATH}/images`;
export const BOT_SOCIAL_IMAGE_FIELD = "file";
export const BOT_SOCIAL_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/**
 * يطابق `bot-article` في `isNewsImagePurpose` حتى يُخزَّن الملف على
 * media.sabq.org عبر `forceR2`، ثم يُجلب عند النشر كصورة الخبر.
 */
export const BOT_SOCIAL_IMAGE_PURPOSE = "bot-article-image";
export const BOT_SOCIAL_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

/** أسماء وسوم الموقع الأربعة. القيم الافتراضية يضعها الخادم، لا البوت. */
export const BOT_SOCIAL_MEASUREMENT = {
  sourceKey: "utm_source",
  sourceValue: "x",
  mediumKey: "utm_medium",
  mediumValue: "social",
  campaignKey: "utm_campaign",
  campaignValue: "sabqorg",
  contentKey: "utm_content",
} as const;

/** يلزم أحدهما. إن وُجدا معاً فالتحقق أنهما نفس الخبر يتم بعد حل الرابط. */
const articleRefFields = {
  articleId: articleIdSchema.optional(),
  articleUrl: articleUrlSchema.optional(),
};

function requireArticleRef(
  value: { articleId?: string; articleUrl?: string },
  ctx: z.RefinementCtx,
): void {
  if (!value.articleId && !value.articleUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "يلزم articleId أو articleUrl",
      path: ["articleId"],
    });
  }
}

/** حقول التأليف المشتركة لتغريدة الخبر. الغياب عند إعادة المحاولة يُبقي المحتوى المخزّن. */
const composeFields = {
  text: textSchema.optional(),
  textSource: textSourceSchema.optional(),
  includeLink: z.boolean().optional(),
  imageSource: imageSourceSchema.optional(),
  imageUrl: z.string().trim().max(2000).nullish(),
};

const originalFields = {
  text: originalTextSchema.optional(),
  textSource: z.enum(["custom", "ai"]).optional(),
  linkUrl: z.string().trim().max(2000).nullish(),
  imageUrl: originalImageUrlSchema.nullish(),
  imageUrls: z.array(originalImageUrlSchema).max(4).optional(),
  campaign: z.string().trim().min(1).max(41).optional(),
};

function rejectArticleBindingOnOriginal(
  value: { articleId?: string; articleUrl?: string },
  ctx: z.RefinementCtx,
): void {
  if (value.articleId || value.articleUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "منشور original لا يرتبط بخبر — لا ترسل articleId أو articleUrl",
      path: ["articleId"],
    });
  }
}

export const botSocialSuggestSchema = z.object({
  ...articleRefFields,
}).superRefine(requireArticleRef);

const botSocialArticlePreviewObject = z.object({
  kind: z.literal("article").optional(),
  ...articleRefFields,
  ...composeFields,
});

const botSocialOriginalPreviewObject = z.object({
  kind: z.literal("original"),
  ...articleRefFields,
  ...originalFields,
});

export const botSocialPreviewSchema = z.union([
  botSocialOriginalPreviewObject.superRefine(rejectArticleBindingOnOriginal),
  botSocialArticlePreviewObject.superRefine(requireArticleRef),
]);

const botSocialArticlePublishObject = z.object({
  kind: z.literal("article").optional(),
  ...articleRefFields,
  clientReference: botSocialClientReferenceSchema,
  ...composeFields,
});

const botSocialOriginalPublishObject = z.object({
  kind: z.literal("original"),
  ...articleRefFields,
  clientReference: botSocialClientReferenceSchema,
  ...originalFields,
});

export const botSocialPublishSchema = z.union([
  botSocialOriginalPublishObject.superRefine(rejectArticleBindingOnOriginal),
  botSocialArticlePublishObject.superRefine(requireArticleRef),
]);

export const botSocialResolveQuerySchema = z.object({
  url: articleUrlSchema,
});

export const botSocialScheduleSchema = z.union([
  botSocialOriginalPublishObject.extend({
    scheduledAt: z.string().datetime({ offset: true }),
  }).superRefine(rejectArticleBindingOnOriginal),
  botSocialArticlePublishObject.extend({
    scheduledAt: z.string().datetime({ offset: true }),
  }).superRefine(requireArticleRef),
]);

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
export type BotSocialResolveQuery = z.infer<typeof botSocialResolveQuerySchema>;
