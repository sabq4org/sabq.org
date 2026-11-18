import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { mediaFiles } from "@shared/schema";
import { db } from "../db";
import { buildMediaSearch } from "../mediaSearch";
import { BotDraftError, resolveBotAuthorId } from "./botDraftsService";
import { isSafeImageUrl } from "../utils/safeImageUrl";

export type BotEditorLanguage = "ar" | "en";
const imageInput = z.object({
  prompt: z.string().trim().min(3).max(2000),
  style: z.string().trim().min(1).max(200).optional(),
  aspectRatio: z.enum(["1:1", "16:9", "4:3", "9:16", "21:9", "3:4"]).optional(),
}).strict();
const searchInput = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BotDraftError(400, "validation_error", "بيانات الطلب غير صالحة", { issues: result.error.issues });
  return result.data;
}

/** Generate and persist a real image; never return a placeholder or provider data URI. */
export async function generateBotImage(_lang: BotEditorLanguage, body: unknown) {
  const input = parse(imageInput, body);
  const userId = await resolveBotAuthorId();
  const { recordBotEditorOperation } = await import("./botEditorOperationsAudit");
  await recordBotEditorOperation({ actorId: userId, operation: "generate_image", outcome: "started", metadata: { language: _lang } });
  try {
    const { generateWithSmartRouter } = await import("./imageModelRouter");
    const generated = await generateWithSmartRouter({
      prompt: input.style ? `${input.prompt}\nVisual style: ${input.style}` : input.prompt,
      aspectRatio: input.aspectRatio ?? "16:9",
      numImages: 1,
    });
    if (!generated.success || !generated.imageData) {
      throw new BotDraftError(502, "generation_failed", "تعذر توليد الصورة");
    }
    const { newsImageStorageService } = await import("./newsImageStorageService");
    const uploaded = await newsImageStorageService.upload({
      buffer: Buffer.from(generated.imageData, "base64"),
      filename: `bot-${randomUUID()}.png`, mimeType: "image/png",
      purpose: "article-ai-generated", metadata: { source: "bot-editor" },
    });
    const deliveryUrl = uploaded.deliveryUrl;
    if (!uploaded.success || !deliveryUrl?.startsWith("https://") || !isSafeImageUrl(deliveryUrl)) {
      throw new BotDraftError(502, "generation_failed", "تعذر حفظ الصورة في التخزين الآمن");
    }
    const safeThumbnail = uploaded.thumbnailUrl;
    const { saveGeneratedImage } = await import("./mediaGenerationService");
    const media = await saveGeneratedImage({
      imageUrl: deliveryUrl,
      thumbnailUrl: safeThumbnail && isSafeImageUrl(safeThumbnail) ? safeThumbnail : null,
      prompt: input.prompt, model: generated.modelUsed, userId,
    });
    await recordBotEditorOperation({ actorId: userId, operation: "generate_image", outcome: "succeeded", metadata: { language: _lang, assetId: media.id } });
    return { media, deliveryUrl, isAiGenerated: true, model: generated.modelUsed };
  } catch (error) {
    await recordBotEditorOperation({ actorId: userId, operation: "generate_image", outcome: "failed", metadata: { language: _lang } });
    throw error;
  }
}

/** Ranked lexical library search; expose rights information to the editor. */
export async function searchBotMedia(_lang: BotEditorLanguage, query: unknown) {
  const input = parse(searchInput, query);
  const search = buildMediaSearch(input.q);
  if (!search) return { files: [], total: 0 };
  const files = await db.select({
    id: mediaFiles.id, url: mediaFiles.url, thumbnailUrl: mediaFiles.thumbnailUrl,
    title: mediaFiles.title, altText: mediaFiles.altText, caption: mediaFiles.caption,
    isAiGenerated: mediaFiles.isAiGenerated, licenseType: mediaFiles.licenseType,
    rightsVerified: mediaFiles.rightsVerified, rightsNote: mediaFiles.rightsNote,
    creditText: mediaFiles.creditText, copyrightHolder: mediaFiles.copyrightHolder,
  }).from(mediaFiles).where(and(eq(mediaFiles.type, "image"), search.where))
    .orderBy(desc(search.score), desc(mediaFiles.createdAt), desc(mediaFiles.id)).limit(input.limit);
  // Bound response size even if old library metadata contains unusually long values.
  const bounded = files.map((file) => ({ ...file,
    title: file.title?.slice(0, 300), altText: file.altText?.slice(0, 300),
    caption: file.caption?.slice(0, 1000), rightsNote: file.rightsNote?.slice(0, 1000),
    creditText: file.creditText?.slice(0, 300), copyrightHolder: file.copyrightHolder?.slice(0, 300),
    licenseType: file.licenseType?.slice(0, 100), url: file.url.slice(0, 2000),
    thumbnailUrl: file.thumbnailUrl?.slice(0, 2000),
  }));
  return { files: bounded, total: bounded.length };
}

const coverInput = z.object({ style: z.string().trim().min(1).max(200).optional(), aspectRatio: imageInput.shape.aspectRatio }).strict();
export async function generateBotCover(lang: BotEditorLanguage, id: string, body: unknown) {
  const input = parse(coverInput, body);
  const { assertBotEditorEditable } = await import("./botEditorWrites");
  await assertBotEditorEditable(lang, id);
  const { readBotArticle } = await import("./botEditorReads");
  const article = await readBotArticle(lang, id, { includeContent: "1" });
  const expectedUpdatedAt = new Date(article.updatedAt);
  if (!Number.isFinite(expectedUpdatedAt.getTime())) throw new BotDraftError(409, "draft_changed", "تعذر التحقق من نسخة الخبر");
  const result = await generateBotImage(lang, { prompt: article.title, ...input });
  const { editBotArticle } = await import("./botEditorWrites");
  const draft = await editBotArticle(lang, id, { imageUrl: result.deliveryUrl, isAiGeneratedImage: true }, { expectedUpdatedAt });
  return { draft, ...result };
}

const extraNames = ["summary", "keywords", "seo", "subtitle", "excerpt", "alternativeTitle", "seoTitle", "seoDescription"] as const;
const extrasInput = z.object({ fields: z.array(z.enum(extraNames)).min(1).max(extraNames.length).optional() }).strict();
export async function regenerateEditorExtras(lang: BotEditorLanguage, id: string, body: unknown) {
  const input = parse(extrasInput, body);
  const fields = Array.from(new Set(input.fields ?? ["summary", "keywords", "seo"]));
  const { assertBotEditorEditable } = await import("./botEditorWrites");
  await assertBotEditorEditable(lang, id);
  const { readBotArticle } = await import("./botEditorReads");
  const article = await readBotArticle(lang, id, { includeContent: "1" });
  const content = article.content ?? "";
  if (content.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().length < 100)
    throw new BotDraftError(422, "content_too_short", "المتن أقصر من 100 حرف — لا يكفي لتوليد الملحقات", { minChars: 100 });
  const expectedUpdatedAt = new Date(article.updatedAt);
  if (!Number.isFinite(expectedUpdatedAt.getTime())) throw new BotDraftError(409, "draft_changed", "تعذر التحقق من نسخة الخبر");
  const { generateSmartContent, withRetry } = await import("../openai");
  let generated: Awaited<ReturnType<typeof generateSmartContent>>;
  try { generated = await withRetry(() => generateSmartContent(content, lang), 3, "SmartContent"); }
  catch { throw new BotDraftError(502, "generation_failed", "تعذر توليد الملحقات"); }
  const { buildRegeneratedExtrasInput } = await import("./botDraftsService");
  const mapped = buildRegeneratedExtrasInput(
    [...(fields.includes("summary") || fields.includes("excerpt") ? ["summary" as const] : []), ...(fields.includes("keywords") ? ["keywords" as const] : []), ...(fields.some(f => ["seo", "seoTitle", "seoDescription"].includes(f)) ? ["seo" as const] : [])],
    { summary: generated.smartSummary, seo: { ...generated.seo, keywords: generated.keywords } },
  );
  if (!fields.includes("seo") && !fields.includes("seoTitle")) delete mapped.seoTitle;
  if (!fields.includes("seo") && !fields.includes("seoDescription")) delete mapped.seoDescription;
  const update: Record<string, unknown> = { ...mapped };
  if (fields.includes("subtitle") && generated.subTitle?.trim()) update.subtitle = generated.subTitle.trim().slice(0, 300);
  // Store the optional alternate headline in the article SEO metadata.
  const alternativeTitle = fields.includes("alternativeTitle") ? generated.mainTitle?.trim().slice(0, 300) : undefined;
  if (alternativeTitle) update.alternativeTitle = alternativeTitle;
  const required = new Set<string>();
  for (const field of fields) {
    if (field === "summary" || field === "excerpt") required.add("excerpt");
    else if (field === "seo") { required.add("seoTitle"); required.add("seoDescription"); }
    else required.add(field);
  }
  if ([...required].some((key) => !(key in update))) {
    throw new BotDraftError(502, "generation_failed", "لم يرجع المولّد جميع القيم المطلوبة — لم يُحفظ شيء", { fields });
  }
  // The English gateway uses an English prompt; reject obviously wrong-language
  // responses instead of persisting them. Arabic names within English are fine.
  if (lang === "en" && Object.values(update).some((value) => {
    const text = Array.isArray(value) ? value.join(" ") : typeof value === "string" ? value : "";
    const letters = text.match(/[A-Za-z\u0600-\u06ff]/g) ?? [];
    const arabic = text.match(/[\u0600-\u06ff]/g) ?? [];
    return letters.length > 0 && arabic.length / letters.length > 0.5;
  })) throw new BotDraftError(502, "generation_failed", "لغة الملحقات المولّدة غير صحيحة — لم يُحفظ شيء");
  const { editBotArticle } = await import("./botEditorWrites");
  const draft = Object.keys(update).length ? await editBotArticle(lang, id, update, { expectedUpdatedAt }) : article;
  return { draft, regenerated: { fields, ...update, ...(alternativeTitle ? { alternativeTitle } : {}) } };
}
