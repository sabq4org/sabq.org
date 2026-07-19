import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { mediaFiles, mediaVectors } from "@shared/schema";
import { generateEmbedding, cosineSimilarity } from "../embeddingsService";

// Cap how many candidate vectors we pull into memory for a single JS-side cosine
// scan. Mirrors the article recommendation pattern (jsonb + JS cosine, no
// pgvector). When the filtered set exceeds this we score only the most-recent
// slice and log it — never a silent truncation.
const CANDIDATE_CAP = 5000;
const MAX_EMBED_TEXT = 1500;

/** Build the descriptive text a media file's embedding is generated from. */
export function buildEmbeddingText(file: {
  title?: string | null;
  originalName?: string | null;
  category?: string | null;
  altText?: string | null;
  caption?: string | null;
  description?: string | null;
  keywords?: string[] | null;
}): string {
  const parts: string[] = [];
  if (file.title) parts.push(file.title);
  // strip the extension from the filename — it's noise for semantics
  if (file.originalName) parts.push(file.originalName.replace(/\.[a-z0-9]+$/i, ""));
  if (file.category) parts.push(file.category);
  if (file.altText) parts.push(file.altText);
  if (file.caption) parts.push(file.caption);
  if (file.description) parts.push(file.description);
  if (file.keywords && file.keywords.length) parts.push(file.keywords.join("، "));
  return parts.join(" — ").trim().slice(0, MAX_EMBED_TEXT);
}

/**
 * Generate (or refresh) the embedding for one media file from its current
 * metadata and upsert it into media_vectors. Best-effort — returns false if the
 * file has no usable text or the embedding call fails. Never throws.
 */
export async function embedMediaFile(mediaFileId: string): Promise<boolean> {
  try {
    const [file] = await db
      .select({
        id: mediaFiles.id,
        type: mediaFiles.type,
        title: mediaFiles.title,
        originalName: mediaFiles.originalName,
        category: mediaFiles.category,
        altText: mediaFiles.altText,
        caption: mediaFiles.caption,
        description: mediaFiles.description,
        keywords: mediaFiles.keywords,
      })
      .from(mediaFiles)
      .where(eq(mediaFiles.id, mediaFileId));

    if (!file || file.type !== "image") return false;

    const text = buildEmbeddingText(file);
    if (!text) return false;

    const embedding = await generateEmbedding(text);

    await db
      .insert(mediaVectors)
      .values({
        mediaFileId,
        embedding,
        embeddingText: text,
        embeddingModel: "text-embedding-3-large",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: mediaVectors.mediaFileId,
        set: {
          embedding,
          embeddingText: text,
          embeddingModel: "text-embedding-3-large",
          updatedAt: new Date(),
        },
      });

    return true;
  } catch (error: any) {
    console.warn("[Media Search] embed failed:", mediaFileId, error?.message || error);
    return false;
  }
}

export interface SemanticSearchOptions {
  limit?: number;
  folderId?: string | null;
  category?: string | null;
}

export interface SemanticSearchItem {
  id: string;
  url: string;
  proxyUrl: string;
  originalUrl: string;
  thumbnailUrl: string | null;
  fileName: string;
  originalName: string;
  folderId: string | null;
  uploadedBy: string;
  type: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  title: string | null;
  altText: string | null;
  caption: string | null;
  keywords: string[] | null;
  category: string | null;
  isFavorite: boolean;
  usageCount: number;
  aiAnalysisStatus: string | null;
  aiQualityScore: number | null;
  aiHasSensitiveContent: boolean;
  createdAt: Date;
  relevanceScore: number; // 0-100
}

function displayUrl(id: string, url: string): string {
  return url.startsWith("https://") ? url : `/api/media/proxy/${id}`;
}

/**
 * Semantic search over the media library. Embeds the query, scores it against
 * the (optionally folder/category-filtered) candidate vectors with cosine
 * similarity, and returns the top matches enriched to the same shape the list
 * endpoint serves, each with a 0-100 relevanceScore.
 */
export async function semanticSearchMedia(
  query: string,
  opts: SemanticSearchOptions = {},
): Promise<{ files: SemanticSearchItem[]; total: number; capped: boolean }> {
  const q = (query || "").trim();
  if (!q) return { files: [], total: 0, capped: false };

  const limit = Math.min(60, Math.max(1, opts.limit ?? 30));
  const queryVec = await generateEmbedding(q);

  const conditions = [eq(mediaFiles.type, "image"), isNotNull(mediaVectors.embedding)];
  if (opts.folderId) conditions.push(eq(mediaFiles.folderId, opts.folderId));
  if (opts.category) conditions.push(eq(mediaFiles.category, opts.category));

  // Pull id + vector for the candidate set (most-recent first), capped.
  const candidates = await db
    .select({
      id: mediaVectors.mediaFileId,
      embedding: mediaVectors.embedding,
    })
    .from(mediaVectors)
    .innerJoin(mediaFiles, eq(mediaVectors.mediaFileId, mediaFiles.id))
    .where(and(...conditions))
    .orderBy(desc(mediaFiles.createdAt))
    .limit(CANDIDATE_CAP);

  const capped = candidates.length >= CANDIDATE_CAP;
  if (capped) {
    console.warn(`[Media Search] candidate set hit cap (${CANDIDATE_CAP}); scoring most-recent slice only.`);
  }

  const scored = candidates
    .filter((c) => Array.isArray(c.embedding) && c.embedding.length > 0)
    .map((c) => ({ id: c.id, score: cosineSimilarity(queryVec, c.embedding as number[]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (scored.length === 0) return { files: [], total: 0, capped };

  const scoreById = new Map(scored.map((s) => [s.id, s.score]));
  const ids = scored.map((s) => s.id);

  const rows = await db
    .select({
      id: mediaFiles.id,
      fileName: mediaFiles.fileName,
      originalName: mediaFiles.originalName,
      folderId: mediaFiles.folderId,
      uploadedBy: mediaFiles.uploadedBy,
      url: mediaFiles.url,
      thumbnailUrl: mediaFiles.thumbnailUrl,
      type: mediaFiles.type,
      mimeType: mediaFiles.mimeType,
      size: mediaFiles.size,
      width: mediaFiles.width,
      height: mediaFiles.height,
      title: mediaFiles.title,
      altText: mediaFiles.altText,
      caption: mediaFiles.caption,
      keywords: mediaFiles.keywords,
      category: mediaFiles.category,
      isFavorite: mediaFiles.isFavorite,
      usageCount: mediaFiles.usageCount,
      aiAnalysisStatus: mediaFiles.aiAnalysisStatus,
      aiQualityScore: mediaFiles.aiQualityScore,
      aiHasSensitiveContent: mediaFiles.aiHasSensitiveContent,
      createdAt: mediaFiles.createdAt,
    })
    .from(mediaFiles)
    .where(inArray(mediaFiles.id, ids));

  const rowById = new Map(rows.map((r) => [r.id, r]));

  // Preserve the relevance ranking order.
  const files: SemanticSearchItem[] = scored
    .map((s) => {
      const r = rowById.get(s.id);
      if (!r) return null;
      return {
        ...r,
        url: displayUrl(r.id, r.url),
        proxyUrl: `/api/media/proxy/${r.id}`,
        originalUrl: r.url,
        relevanceScore: Math.round(Math.max(0, Math.min(1, s.score)) * 100),
      } as SemanticSearchItem;
    })
    .filter(Boolean) as SemanticSearchItem[];

  return { files, total: files.length, capped };
}

export interface EmbedBackfillResult {
  processed: number;
  embedded: number;
  remaining: number;
}

/**
 * Backfill embeddings for images that don't yet have a media_vectors row, so the
 * existing archive becomes semantically searchable. Bounded batch; reports how
 * many remain so the UI can loop until the library is fully indexed.
 */
export async function backfillMediaEmbeddings(batchSize = 8): Promise<EmbedBackfillResult> {
  const size = Math.min(20, Math.max(1, batchSize));

  const missingCond = and(
    eq(mediaFiles.type, "image"),
    sql`NOT EXISTS (SELECT 1 FROM ${mediaVectors} WHERE ${mediaVectors.mediaFileId} = ${mediaFiles.id})`,
  );

  const rows = await db
    .select({ id: mediaFiles.id })
    .from(mediaFiles)
    .where(missingCond)
    .orderBy(desc(mediaFiles.createdAt))
    .limit(size);

  let embedded = 0;
  // Low concurrency (3 at a time) to avoid hammering the embeddings API.
  for (let i = 0; i < rows.length; i += 3) {
    const slice = rows.slice(i, i + 3);
    const results = await Promise.all(slice.map((r) => embedMediaFile(r.id)));
    embedded += results.filter(Boolean).length;
  }

  const [remainingRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(mediaFiles)
    .where(missingCond);
  const remaining = Number(remainingRow?.n) || 0;

  return { processed: rows.length, embedded, remaining };
}

export interface ArticleMediaSuggestions {
  files: SemanticSearchItem[];
  total: number;
  query: string;
}

/**
 * Suggest library images for an article draft: embed the title (+ a plain-text
 * slice of the body) and rank the semantically-indexed archive against it.
 * Sensitive-flagged images are excluded — they must be picked deliberately from
 * the library, never auto-offered. Results keep semanticSearchMedia's shape so
 * pickers can render them like any other media card (with relevanceScore 0-100).
 */
export async function suggestMediaForArticle(opts: {
  title: string;
  content?: string | null;
  limit?: number;
}): Promise<ArticleMediaSuggestions> {
  const title = (opts.title || "").trim();
  if (!title) return { files: [], total: 0, query: "" };

  const limit = Math.min(24, Math.max(1, opts.limit ?? 6));
  const bodyText = (opts.content || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
  const query = bodyText ? `${title} — ${bodyText}` : title;

  // Over-fetch so the sensitive-content filter doesn't leave the strip short.
  const { files } = await semanticSearchMedia(query, { limit: limit * 2 });
  const safe = files.filter((f) => !f.aiHasSensitiveContent).slice(0, limit);
  return { files: safe, total: safe.length, query };
}

/**
 * Visually/semantically similar library images to a given one (vector cosine
 * over media_vectors, excluding the file itself). Powers "صور مشابهة" so an
 * editor can find alternate angles of the same event from the archive.
 */
export async function similarMedia(
  mediaFileId: string,
  limit = 12,
): Promise<{ files: SemanticSearchItem[]; total: number }> {
  const capped = Math.min(30, Math.max(1, limit));

  const [self] = await db
    .select({ embedding: mediaVectors.embedding })
    .from(mediaVectors)
    .where(eq(mediaVectors.mediaFileId, mediaFileId))
    .limit(1);
  if (!self || !Array.isArray(self.embedding) || self.embedding.length === 0) {
    return { files: [], total: 0 };
  }
  const selfVec = self.embedding as number[];

  const candidates = await db
    .select({ id: mediaVectors.mediaFileId, embedding: mediaVectors.embedding })
    .from(mediaVectors)
    .innerJoin(mediaFiles, eq(mediaVectors.mediaFileId, mediaFiles.id))
    .where(and(eq(mediaFiles.type, "image"), isNotNull(mediaVectors.embedding)))
    .orderBy(desc(mediaFiles.createdAt))
    .limit(CANDIDATE_CAP);

  const scored = candidates
    .filter((c) => c.id !== mediaFileId && Array.isArray(c.embedding) && c.embedding.length > 0)
    .map((c) => ({ id: c.id, score: cosineSimilarity(selfVec, c.embedding as number[]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, capped);

  if (scored.length === 0) return { files: [], total: 0 };

  const rows = await db
    .select({
      id: mediaFiles.id,
      fileName: mediaFiles.fileName,
      originalName: mediaFiles.originalName,
      folderId: mediaFiles.folderId,
      uploadedBy: mediaFiles.uploadedBy,
      url: mediaFiles.url,
      thumbnailUrl: mediaFiles.thumbnailUrl,
      type: mediaFiles.type,
      mimeType: mediaFiles.mimeType,
      size: mediaFiles.size,
      width: mediaFiles.width,
      height: mediaFiles.height,
      title: mediaFiles.title,
      altText: mediaFiles.altText,
      caption: mediaFiles.caption,
      keywords: mediaFiles.keywords,
      category: mediaFiles.category,
      isFavorite: mediaFiles.isFavorite,
      usageCount: mediaFiles.usageCount,
      aiAnalysisStatus: mediaFiles.aiAnalysisStatus,
      aiQualityScore: mediaFiles.aiQualityScore,
      aiHasSensitiveContent: mediaFiles.aiHasSensitiveContent,
      createdAt: mediaFiles.createdAt,
    })
    .from(mediaFiles)
    .where(inArray(mediaFiles.id, scored.map((s) => s.id)));

  const rowById = new Map(rows.map((r) => [r.id, r]));
  const files = scored
    .map((s) => {
      const r = rowById.get(s.id);
      if (!r) return null;
      return {
        ...r,
        url: displayUrl(r.id, r.url),
        proxyUrl: `/api/media/proxy/${r.id}`,
        originalUrl: r.url,
        relevanceScore: Math.round(Math.max(0, Math.min(1, s.score)) * 100),
      } as SemanticSearchItem;
    })
    .filter(Boolean) as SemanticSearchItem[];

  return { files, total: files.length };
}
