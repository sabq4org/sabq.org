import { z } from "zod";

const httpsUrl = z.string().trim().url().max(2000).refine((s) => s.startsWith("https://"));
const text = (max: number) => z.string().trim().max(max);

/** Contract of the privileged editorial API; attribution and source are never writable. */
export const botEditorEditSchema = z.object({
  title: text(300).min(3).optional(),
  authorId: text(64).min(1).optional(),
  reporterId: text(64).min(1).nullable().optional(),
  subtitle: text(300).nullable().optional(),
  content: text(300000).min(20).optional(),
  contentFormat: z.enum(["html", "text"]).optional(),
  excerpt: text(1000).nullable().optional(),
  categoryId: text(64).min(1).optional(),
  categorySlug: text(150).min(1).optional(),
  imageUrl: httpsUrl.nullable().optional(),
  isAiGeneratedImage: z.boolean().optional(),
  infographic: z.boolean().optional(),
  infographicBannerUrl: httpsUrl.nullable().optional(),
  imageUrls: z.array(httpsUrl).max(20).optional(),
  bodyImages: z.array(z.object({ url: httpsUrl, alt: text(300).nullable().optional(), caption: text(500).nullable().optional() }).strict().refine((v) => v.alt !== undefined || v.caption !== undefined)).max(40).optional(),
  imageCaption: text(300).nullable().optional(),
  imageAltText: text(125).nullable().optional(),
  sourceUrl: z.string().trim().url().max(2000).refine((s) => /^https?:\/\//.test(s)).nullable().optional(),
  sourceArticleId: text(64).min(1).nullable().optional(),
  riskLabel: z.enum(["safe", "needs_look", "sensitive"]).nullable().optional(),
  clientReference: text(120).min(1).optional(),
  notes: text(2000).nullable().optional(),
  tagIds: z.array(text(64).min(1)).max(20).refine((ids) => new Set(ids).size === ids.length).optional(),
  keywords: z.array(text(60).min(1)).max(20).optional(),
  alternativeTitle: text(300).nullable().optional(),
  seoTitle: text(70).nullable().optional(),
  seoDescription: text(160).nullable().optional(),
  imageFocalPoint: z.object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    needsReview: z.boolean().optional(),
    confidence: z.enum(["high", "medium", "low"]).optional(),
  }).strict().nullable().optional(),
  thumbnailUrl: httpsUrl.nullable().optional(),
  albumImages: z.array(z.record(z.string(), z.unknown())).max(30).nullable().optional(),
  isVideoTemplate: z.boolean().optional(),
  videoUrl: z.string().trim().max(2000).nullable().optional(),
  videoThumbnailUrl: httpsUrl.nullable().optional(),
  hideFromHomepage: z.boolean().optional(),
  newsType: z.enum(["breaking", "featured", "regular"]).optional(),
  isFeatured: z.boolean().optional(),
  isReading: z.boolean().optional(),
  updateReason: text(500).nullable().optional(),
}).strict().refine((v) => Object.keys(v).some((k) => k !== "contentFormat"), { message: "لا توجد حقول للتحديث" });

export const botEditorVisibilitySchema = z.object({
  specialSections: z.array(z.enum(["featured", "reading"])).max(2).refine((v) => new Set(v).size === v.length).optional(),
  isFeatured: z.boolean().optional(),
  newsType: z.enum(["breaking", "regular"]).optional(),
  hideFromHomepage: z.boolean().optional(),
  isReading: z.boolean().optional(),
  displayOrder: z.number().int().nonnegative().optional(),
  updateReason: text(500).nullable().optional(),
}).strict().refine((v) => Object.keys(v).some((k) => k !== "updateReason"), { message: "لا توجد حقول للتحديث" }).refine((v) => v.specialSections === undefined || (v.isFeatured === undefined && v.isReading === undefined), { message: "لا تجمع specialSections مع isFeatured أو isReading" });

export const botEditorArchiveSchema = z.object({
  reason: text(1000).optional(),
  updateReason: text(500).optional(),
  expectedUpdatedAt: z.string().trim().optional(),
}).strict();
export const botEditorEmptySchema = z.object({}).strict();
export type BotEditorEditInput = z.infer<typeof botEditorEditSchema>;
export type BotEditorVisibilityInput = z.infer<typeof botEditorVisibilitySchema>;

/** DELETE = أرشفة ناعمة بسبب إلزامي وإصدار مادة إلزامي. */
export const botEditorDeleteSchema = z.object({
  updateReason: text(500).min(3, "updateReason مطلوب"),
  expectedUpdatedAt: z.string().trim().min(1, "expectedUpdatedAt مطلوب"),
}).strict();
