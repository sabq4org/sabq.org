import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { aiImageGenerations, articles, mediaFiles } from "@shared/schema";

/** Resolve provenance for the current image, never the article's previous image. */
export async function resolveArticleImageProvenance(imageUrl: string) {
  const [generation] = await db.select({
    model: aiImageGenerations.model,
    prompt: aiImageGenerations.prompt,
    metadata: aiImageGenerations.metadata,
  }).from(aiImageGenerations).where(and(
    eq(aiImageGenerations.imageUrl, imageUrl),
    eq(aiImageGenerations.status, "completed"),
  )).limit(1);

  if (generation) {
    const finalPrompt = (generation.metadata as { finalPrompt?: unknown } | null)?.finalPrompt;
    return {
      isAiGeneratedImage: true,
      aiImageModel: generation.model,
      aiImagePrompt: typeof finalPrompt === "string" && finalPrompt ? finalPrompt : generation.prompt,
    };
  }

  const [media] = await db.select({
    isAi: mediaFiles.isAiGenerated,
    model: mediaFiles.aiGenerationModel,
    prompt: mediaFiles.aiGenerationPrompt,
  }).from(mediaFiles).where(eq(mediaFiles.url, imageUrl)).limit(1);
  if (!media?.isAi) return null;
  return {
    isAiGeneratedImage: true,
    aiImageModel: media.model || null,
    aiImagePrompt: media.prompt || null,
  };
}

/** Evaluated against the persisted row during UPDATE, avoiding a read/write race. */
export function resetChangedImageProvenance(imageUrl: string | null) {
  return {
    aiImageModel: sql`CASE WHEN ${articles.imageUrl} IS DISTINCT FROM ${imageUrl} THEN NULL ELSE ${articles.aiImageModel} END`,
    aiImagePrompt: sql`CASE WHEN ${articles.imageUrl} IS DISTINCT FROM ${imageUrl} THEN NULL ELSE ${articles.aiImagePrompt} END`,
  };
}
