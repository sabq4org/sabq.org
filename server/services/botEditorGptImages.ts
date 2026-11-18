import { z } from "zod";
import { and, eq, gte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { aiImageGenerations } from "@shared/schema";
import { EDITORIAL_IMAGE_FEATURE_KEY, EDITORIAL_IMAGE_MODELS, editorialImageRequestSchema, type EditorialImageRequest } from "@shared/editorialImages";
import { BOT_GPT_DEFAULT_DAILY_CAP, botGptDailyCap } from "@shared/botEditorCapabilities";
import { db } from "../db";
import { BotDraftError, resolveBotAuthorId } from "./botDraftsService";
import { createEditorialImageJob, getEditorialImageJob, runEditorialImageJob } from "./editorialImagesService";
import { areOpenAIImagesConfigured, EditorialImageError, safeImageError } from "./openaiImagesProvider";

export { BOT_GPT_DEFAULT_DAILY_CAP, botGptDailyCap };

const input = z.object({
  prompt: z.string().trim().min(10, "اكتب وصفاً من 10 أحرف على الأقل").max(4000),
  model: z.enum(EDITORIAL_IMAGE_MODELS.map((m) => m.id) as [string, ...string[]]),
  size: z.enum(["1536x864", "1024x1024", "1024x1536"]).default("1536x864"),
  quality: z.enum(["low", "medium", "high"]).default("medium"),
  requestId: z.string().uuid().optional(),
}).strict();

function mapError(error: unknown): never {
  if (error instanceof BotDraftError) throw error;
  const safe = error instanceof EditorialImageError ? error : safeImageError(error);
  const code = safe.code === "not_configured" ? "not_configured" : safe.status === 429 ? "rate_limited" : safe.status === 409 || safe.status === 422 ? "validation_error" : "generation_failed";
  throw new BotDraftError(safe.status, code, safe.message, { reason: safe.code });
}

async function usedToday(userId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(aiImageGenerations).where(and(
    eq(aiImageGenerations.userId, userId),
    sql`${aiImageGenerations.metadata}->>'featureKey' = ${EDITORIAL_IMAGE_FEATURE_KEY}`,
    gte(aiImageGenerations.createdAt, sql`localtimestamp - interval '24 hours'`),
  ));
  return Number(row?.n ?? 0);
}

/**
 * يبدأ توليد صورة GPT (مدفوع) على نفس مسار المحرر البشري (editorialImagesService).
 * يرجع 202 فوراً؛ يُستعلم عن النتيجة بـ GET /images/generate-gpt/:jobId.
 * 503 not_configured إن غاب OPENAI_IMAGES_API_KEY، و429 daily_cap_reached عند بلوغ السقف.
 */
export async function startBotGptImage(language: "ar" | "en", body: unknown) {
  const parsed = input.safeParse(body);
  if (!parsed.success) throw new BotDraftError(400, "validation_error", "بيانات الطلب غير صالحة", { issues: parsed.error.issues });
  if (!areOpenAIImagesConfigured()) throw new BotDraftError(503, "not_configured", "خدمة صور GPT غير مفعّلة على الخادم (OPENAI_IMAGES_API_KEY)");
  const userId = await resolveBotAuthorId();
  const cap = botGptDailyCap();
  const used = await usedToday(userId);
  if (used >= cap) throw new BotDraftError(429, "daily_cap_reached", "بلغ البوت السقف اليومي لصور GPT", { cap, used });
  const request: EditorialImageRequest = editorialImageRequestSchema.parse({ ...parsed.data, requestId: parsed.data.requestId ?? randomUUID() });
  const { recordBotEditorOperation } = await import("./botEditorOperationsAudit");
  const meta = { language, model: request.model, size: request.size, quality: request.quality, requestId: request.requestId };
  let created: Awaited<ReturnType<typeof createEditorialImageJob>>;
  try { created = await createEditorialImageJob(userId, request); } catch (error) { mapError(error); }
  if (created.created) {
    await recordBotEditorOperation({ actorId: userId, operation: "generate_image_gpt", outcome: "started", metadata: { ...meta, usedToday: used + 1, dailyCap: cap } });
    void runEditorialImageJob(userId, request)
      .then(() => finish(userId, request, meta))
      .catch(() => recordBotEditorOperation({ actorId: userId, operation: "generate_image_gpt", outcome: "failed", metadata: meta }).catch(() => undefined));
  }
  return { jobId: created.job.id, status: created.job.status, model: created.job.model, imageUrl: created.job.imageUrl, usedToday: used + (created.created ? 1 : 0), dailyCap: cap };
}

/** بعد انتهاء الوظيفة: سجل التكلفة (usage المحفوظ في الصف) + حفظ الصورة في المكتبة. بلا برومبت في السجل. */
async function finish(userId: string, request: EditorialImageRequest, meta: Record<string, string | number | boolean | null>) {
  const { recordBotEditorOperation } = await import("./botEditorOperationsAudit");
  const job = await getEditorialImageJob(userId, request.requestId);
  if (!job || job.status !== "completed" || !job.imageUrl) {
    await recordBotEditorOperation({ actorId: userId, operation: "generate_image_gpt", outcome: "failed", metadata: meta });
    return;
  }
  const [row] = await db.select({ metadata: aiImageGenerations.metadata, generationTime: aiImageGenerations.generationTime }).from(aiImageGenerations).where(eq(aiImageGenerations.id, request.requestId)).limit(1);
  const usage = ((row?.metadata ?? {}) as { usage?: Record<string, unknown> }).usage ?? {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  let assetId: string | null = null;
  try {
    const { saveGeneratedImage } = await import("./mediaGenerationService");
    const media = await saveGeneratedImage({ imageUrl: job.imageUrl, thumbnailUrl: null, prompt: request.prompt, model: request.model, userId });
    assetId = media.id;
  } catch { /* الصورة جاهزة عبر الرابط حتى لو تعذر إدخالها للمكتبة */ }
  await recordBotEditorOperation({
    actorId: userId, operation: "generate_image_gpt", outcome: "succeeded",
    metadata: { ...meta, assetId, inputTokens: num(usage.input_tokens), outputTokens: num(usage.output_tokens), totalTokens: num(usage.total_tokens), seconds: row?.generationTime ?? null },
  });
}

export async function getBotGptImage(jobId: string) {
  if (!z.string().uuid().safeParse(jobId).success) throw new BotDraftError(400, "validation_error", "معرّف العملية غير صالح");
  const userId = await resolveBotAuthorId();
  const job = await getEditorialImageJob(userId, jobId);
  if (!job) throw new BotDraftError(404, "not_found", "عملية التوليد غير موجودة");
  return { jobId: job.id, status: job.status, model: job.model, imageUrl: job.imageUrl, error: job.error };
}
