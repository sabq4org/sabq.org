import { z } from "zod";
import { BotDraftError, resolveBotAuthorId } from "./botDraftsService";

type Lang = "ar" | "en";

const source = {
  articleId: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().min(20).max(50_000).optional(),
};
const titlesInput = z.object({ ...source, language: z.enum(["ar", "en"]).optional() }).strict()
  .refine((v) => Boolean(v.articleId) !== Boolean(v.content), { message: "أرسل articleId أو content (واحداً فقط)" });
const proofreadInput = z.object({ ...source, title: z.string().trim().min(3).max(500).optional() }).strict()
  .refine((v) => [v.articleId, v.content, v.title].filter(Boolean).length === 1, { message: "أرسل واحداً من articleId أو content أو title" });
const compareInput = z.object({ ...source, currentTitle: z.string().trim().max(300).optional() }).strict()
  .refine((v) => Boolean(v.articleId) !== Boolean(v.content), { message: "أرسل articleId أو content (واحداً فقط)" });

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) throw new BotDraftError(400, "validation_error", "بيانات الطلب غير صالحة", { issues: result.error.issues });
  return result.data;
}

async function contentOf(lang: Lang, input: { articleId?: string; content?: string }): Promise<{ content: string; title?: string }> {
  if (input.content) return { content: input.content };
  const { readBotArticle } = await import("./botEditorReads");
  const article: any = await readBotArticle(lang, input.articleId!, { includeContent: "1" });
  const content = String(article.content ?? "");
  if (content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length < 20) {
    throw new BotDraftError(422, "content_too_short", "المتن قصير جداً للتوليد", { minChars: 20 });
  }
  return { content, title: typeof article.title === "string" ? article.title : undefined };
}

function aiFailure(error: unknown): never {
  if (error instanceof BotDraftError) throw error;
  const e = error as { status?: number; message?: string; code?: string } | null;
  if (e?.status === 429 || e?.message?.includes("429")) throw new BotDraftError(429, "rate_limited", "تم تجاوز حد الطلبات، حاول بعد قليل");
  throw new BotDraftError(502, "generation_failed", "تعذر إتمام عملية الذكاء الاصطناعي");
}

/** قائمة عناوين مقترحة لا تُحفظ. تستعمل نفس مولّد اللوحة (/api/ai/generate-titles). */
export async function suggestBotTitles(lang: Lang, body: unknown) {
  const input = parse(titlesInput, body);
  const { content } = await contentOf(lang, input);
  try {
    const { generateTitle, withRetry } = await import("../openai");
    const titles = await withRetry(() => generateTitle(content, input.language ?? lang), 3, "GenerateTitles");
    return { titles };
  } catch (error) { aiFailure(error); }
}

/** تدقيق لغوي لمتن أو عنوان بلا تعديل أي مادة (نفس proofreadService في اللوحة). */
export async function proofreadBot(lang: Lang, body: unknown) {
  const input = parse(proofreadInput, body);
  const userId = await resolveBotAuthorId();
  const service = await import("./proofreadService");
  try {
    if (input.title) return await service.proofreadTitle(input.title, userId);
    const { content } = await contentOf(lang, input);
    return await service.proofreadContent(content, userId);
  } catch (error) {
    if (error instanceof BotDraftError) throw error;
    const mapped = service.proofreadErrorResponse(error);
    throw new BotDraftError(mapped.status, mapped.status === 429 ? "rate_limited" : mapped.status === 400 || mapped.status === 413 || mapped.status === 422 ? "validation_error" : "generation_failed", mapped.message);
  }
}

/** مقارنة عناوين من ثلاثة نماذج (نفس /api/ai/compare-headlines). تكلفة أعلى: تُحسب ضمن حد التوليد. */
export async function compareBotHeadlines(lang: Lang, body: unknown) {
  const input = parse(compareInput, body);
  const { content, title } = await contentOf(lang, input);
  try {
    const { compareHeadlines } = await import("./headlineCompareService");
    return { suggestions: await compareHeadlines(content, input.currentTitle ?? title) };
  } catch (error) { aiFailure(error); }
}
