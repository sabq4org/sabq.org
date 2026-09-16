import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { aiImageGenerations } from "@shared/schema";
import { EDITORIAL_IMAGE_MODELS, EDITORIAL_IMAGE_FEATURE_KEY, type EditorialImageJob, type EditorialImageRequest } from "@shared/editorialImages";
import { newsImageStorageService } from "./newsImageStorageService";
import { areOpenAIImagesConfigured, EditorialImageError, generateOpenAIEditorialImage, safeImageError } from "./openaiImagesProvider";

export const EDITORIAL_IMAGE_JOB_TTL_MS = 4 * 60_000;
const modelIds = EDITORIAL_IMAGE_MODELS.map((model) => model.id);
const featureFilter = sql`${aiImageGenerations.metadata}->>'featureKey' = ${EDITORIAL_IMAGE_FEATURE_KEY}`;
const expiredMessage = "انتهت العملية قبل اكتمالها. يمكنك بدء محاولة جديدة.";
type JobRow = typeof aiImageGenerations.$inferSelect;

function publicJob(row: JobRow): EditorialImageJob {
  return {
    id: row.id,
    status: row.status === "completed" ? "completed" : row.status === "failed" ? "failed" : "processing",
    model: row.model,
    imageUrl: row.status === "completed" ? row.imageUrl : null,
    error: row.status === "failed" ? row.errorMessage : null,
  };
}

/** Advisory lock makes the per-user guard work across Railway replicas. */
export async function createEditorialImageJob(userId: string, input: EditorialImageRequest) {
  if (!areOpenAIImagesConfigured()) throw new EditorialImageError(503, "not_configured", "خدمة صور GPT غير مفعّلة. راجع مسؤول النظام لإعداد مفتاح الصور المخصص.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`editorial-images:${userId}`}, 0))`);
    const [existing] = await tx.select().from(aiImageGenerations).where(and(
      eq(aiImageGenerations.id, input.requestId), eq(aiImageGenerations.userId, userId), and(inArray(aiImageGenerations.model, modelIds), featureFilter),
    ));
    if (existing) {
      const meta = existing.metadata as { size?: string; quality?: string } | null;
      if (existing.prompt !== input.prompt || existing.model !== input.model || meta?.size !== input.size || meta?.quality !== input.quality) {
        throw new EditorialImageError(409, "request_conflict", "معرّف الطلب مستخدم لوصف آخر. ابدأ محاولة جديدة.");
      }
      return { job: publicJob(existing), created: false };
    }
    // created_at defaults to database localtimestamp; compare on the same clock/timezone.
    const cutoff = sql`localtimestamp - (${EDITORIAL_IMAGE_JOB_TTL_MS} * interval '1 millisecond')`;
    await tx.update(aiImageGenerations).set({ status: "failed", errorMessage: expiredMessage, updatedAt: new Date() }).where(and(
      eq(aiImageGenerations.userId, userId), and(inArray(aiImageGenerations.model, modelIds), featureFilter), eq(aiImageGenerations.status, "processing"), lt(aiImageGenerations.createdAt, cutoff),
    ));
    const [active] = await tx.select({ id: aiImageGenerations.id }).from(aiImageGenerations).where(and(
      eq(aiImageGenerations.userId, userId), and(inArray(aiImageGenerations.model, modelIds), featureFilter), eq(aiImageGenerations.status, "processing"), gte(aiImageGenerations.createdAt, cutoff),
    )).limit(1);
    if (active) throw new EditorialImageError(409, "already_processing", "لديك صورة قيد التوليد. انتظر اكتمالها قبل بدء صورة جديدة.");
    const [row] = await tx.insert(aiImageGenerations).values({
      id: input.requestId, userId, prompt: input.prompt, model: input.model,
      aspectRatio: input.size === "1536x864" ? "16:9" : input.size === "1024x1024" ? "1:1" : "2:3",
      imageSize: "1K", numImages: 1, status: "processing", enableSearchGrounding: false, enableThinking: false,
      metadata: { featureKey: "editor-openai-images", size: input.size, quality: input.quality, credentialSource: "OPENAI_IMAGES_API_KEY" },
    }).returning();
    return { job: publicJob(row), created: true };
  });
}

export async function getEditorialImageJob(userId: string, id: string): Promise<EditorialImageJob | null> {
  const filter = and(eq(aiImageGenerations.id, id), eq(aiImageGenerations.userId, userId), and(inArray(aiImageGenerations.model, modelIds), featureFilter));
  await db.update(aiImageGenerations).set({ status: "failed", errorMessage: expiredMessage, updatedAt: new Date() }).where(and(
    filter, eq(aiImageGenerations.status, "processing"), lt(aiImageGenerations.createdAt, sql`localtimestamp - (${EDITORIAL_IMAGE_JOB_TTL_MS} * interval '1 millisecond')`),
  ));
  const [row] = await db.select().from(aiImageGenerations).where(filter);
  return row ? publicJob(row) : null;
}

/** One attempt only. Persisted status lets another replica serve polling requests. */
export async function runEditorialImageJob(userId: string, input: EditorialImageRequest): Promise<void> {
  const started = Date.now();
  const filter = and(eq(aiImageGenerations.id, input.requestId), eq(aiImageGenerations.userId, userId), eq(aiImageGenerations.status, "processing"), featureFilter);
  try {
    const result = await generateOpenAIEditorialImage(input);
    const uploaded = await newsImageStorageService.upload({
      buffer: result.buffer, filename: `gpt-${input.requestId}.png`, mimeType: "image/png", purpose: "article-openai-generated",
      rolloutKey: input.requestId, metadata: { model: input.model, generationId: input.requestId, isAiGenerated: "true" },
    });
    if (!uploaded.success || !uploaded.deliveryUrl) throw new EditorialImageError(502, "upload_failed", "تم التوليد لكن تعذر حفظ الصورة. حاول مجددًا لاحقًا.");
    await db.update(aiImageGenerations).set({
      status: "completed", imageUrl: uploaded.deliveryUrl, thumbnailUrl: uploaded.thumbnailUrl || uploaded.deliveryUrl,
      generationTime: Math.round((Date.now() - started) / 1000), updatedAt: new Date(),
      metadata: { featureKey: "editor-openai-images", size: input.size, quality: input.quality, credentialSource: "OPENAI_IMAGES_API_KEY", finalPrompt: result.prompt, usage: result.usage, providerRequestId: result.requestId },
    }).where(filter);
  } catch (error) {
    const safe = safeImageError(error);
    console.warn("[editor-openai-images] failed", { generationId: input.requestId, code: safe.code });
    await db.update(aiImageGenerations).set({ status: "failed", errorMessage: safe.message, generationTime: Math.round((Date.now() - started) / 1000), updatedAt: new Date() }).where(filter);
  }
}
