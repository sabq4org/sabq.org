import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { mediaFiles } from "@shared/schema";
import { analyzeImage } from "./visualAiService";
import { embedMediaFile } from "./mediaSearchService";

// The /api/media/upload pipe is platform-wide (avatars, logos, reporter photos,
// rich-editor inline images). Auto-tagging those wastes AI budget on assets that
// never surface in the library browser, so skip obvious non-library categories.
const SKIP_CATEGORIES = new Set([
  "reporters",
  "صور المراسلين",
  "logos",
  "شعارات",
  "avatars",
]);
const SKIP_ENTITY_TYPES = new Set([
  "user_profile",
  "avatar",
  "reporter",
  "reporter_avatar",
  "author",
]);

const MAX_TAGS = 10;
const MAX_DESC = 400;
// Private-storage images are downloaded server-side and inlined as base64 for
// Gemini; cap the bytes so a huge original can't blow up memory or the API call.
const MAX_PRIVATE_IMAGE_BYTES = 15 * 1024 * 1024;

/**
 * Download a private gs:// object to base64 so analyzeImage can inline it.
 * Returns null (→ "skipped") on any failure: wrong bucket, missing object,
 * oversized file, or a storage provider that doesn't serve gs:// paths.
 */
async function downloadGsObjectToBase64(gsUrl: string): Promise<string | null> {
  try {
    const parts = gsUrl.replace("gs://", "").split("/");
    const bucketName = parts[0];
    const objectPath = parts.slice(1).join("/");
    if (!bucketName || !objectPath) return null;

    const { objectStorageClient, getBucketConfig } = await import("../objectStorage");
    if (bucketName !== getBucketConfig().bucketName) return null;

    const file = objectStorageClient.bucket(bucketName).file(objectPath);
    const [exists] = await file.exists();
    if (!exists) return null;

    const [buf] = await file.download();
    if (!buf || buf.length === 0 || buf.length > MAX_PRIVATE_IMAGE_BYTES) return null;
    return buf.toString("base64");
  } catch (error: any) {
    console.warn("[Media Auto-Tag] gs:// download failed:", gsUrl, error?.message || error);
    return null;
  }
}

export interface AutoTagContext {
  mimeType?: string | null;
  url?: string | null;
  category?: string | null;
  entityType?: string | null;
}

/**
 * Decide whether a freshly-uploaded asset should be auto-analyzed. We need a
 * fetchable source — public https URL, or a private gs:// path we can download
 * from object storage — an image MIME, and a library-bound context (not an
 * avatar/logo/reporter upload).
 */
export function shouldAutoTag(ctx: AutoTagContext): boolean {
  if (!ctx.mimeType || !ctx.mimeType.startsWith("image/")) return false;
  if (!ctx.url || !(ctx.url.startsWith("https://") || ctx.url.startsWith("gs://"))) return false;
  if (ctx.category && SKIP_CATEGORIES.has(ctx.category)) return false;
  if (ctx.entityType && SKIP_ENTITY_TYPES.has(ctx.entityType)) return false;
  return true;
}

function buildTags(result: {
  tags?: string[];
  detectedObjects?: string[];
}): string[] {
  const raw = [...(result.tags || []), ...(result.detectedObjects || [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const tag = (t || "").trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/**
 * Analyze one media file and persist AI metadata. Non-destructive: keywords /
 * altText / description are only filled when currently empty, so manual edits
 * always win. Always sets a terminal status (done | failed | skipped) so the
 * row leaves the "pending" collection.
 */
export async function analyzeAndTagMedia(mediaFileId: string): Promise<"done" | "failed" | "skipped"> {
  const [row] = await db
    .select({
      id: mediaFiles.id,
      url: mediaFiles.url,
      mimeType: mediaFiles.mimeType,
      type: mediaFiles.type,
      keywords: mediaFiles.keywords,
      altText: mediaFiles.altText,
      description: mediaFiles.description,
    })
    .from(mediaFiles)
    .where(eq(mediaFiles.id, mediaFileId));

  if (!row) return "skipped";

  // Public https URLs are downloaded by analyzeImage itself; private gs://
  // objects are fetched here from object storage and inlined as base64.
  const isHttps = !!row.url && row.url.startsWith("https://");
  const isGs = !!row.url && row.url.startsWith("gs://");
  if ((!isHttps && !isGs) || row.type !== "image" || !row.mimeType?.startsWith("image/")) {
    await db
      .update(mediaFiles)
      .set({ aiAnalysisStatus: "skipped", aiAnalyzedAt: new Date() })
      .where(eq(mediaFiles.id, mediaFileId));
    return "skipped";
  }

  let imageBase64: string | undefined;
  if (isGs) {
    const b64 = await downloadGsObjectToBase64(row.url!);
    if (!b64) {
      await db
        .update(mediaFiles)
        .set({ aiAnalysisStatus: "skipped", aiAnalyzedAt: new Date() })
        .where(eq(mediaFiles.id, mediaFileId));
      return "skipped";
    }
    imageBase64 = b64;
  }

  try {
    const result = await analyzeImage({
      imageUrl: row.url!,
      imageBase64,
      checkQuality: true,
      generateAltText: true,
      detectContent: true,
    });

    if (!result.success) {
      await db
        .update(mediaFiles)
        .set({ aiAnalysisStatus: "failed", aiAnalyzedAt: new Date() })
        .where(eq(mediaFiles.id, mediaFileId));
      return "failed";
    }

    const tags = buildTags(result);
    const updates: Record<string, unknown> = {
      aiAnalysisStatus: "done",
      aiAnalyzedAt: new Date(),
      aiQualityScore: typeof result.qualityScore === "number" ? Math.round(result.qualityScore) : null,
      aiHasSensitiveContent: !!result.hasSensitiveContent,
    };

    // Fill only when empty — never clobber human-authored metadata.
    if ((!row.keywords || row.keywords.length === 0) && tags.length > 0) {
      updates.keywords = tags;
    }
    if (!row.altText && result.altTextAr) {
      updates.altText = result.altTextAr.slice(0, MAX_DESC);
    }
    if (!row.description && result.contentDescription?.ar) {
      updates.description = result.contentDescription.ar.slice(0, MAX_DESC);
    }

    await db.update(mediaFiles).set(updates).where(eq(mediaFiles.id, mediaFileId));

    // Phase 3: generate the semantic-search embedding from the now-enriched
    // metadata. Best-effort — embedMediaFile never throws, and a missing vector
    // only means this image is absent from semantic results until backfilled.
    void embedMediaFile(mediaFileId);

    return "done";
  } catch (error: any) {
    console.warn("[Media Auto-Tag] analysis failed:", mediaFileId, error?.message || error);
    await db
      .update(mediaFiles)
      .set({ aiAnalysisStatus: "failed", aiAnalyzedAt: new Date() })
      .where(eq(mediaFiles.id, mediaFileId));
    return "failed";
  }
}

// ---------------------------------------------------------------------------
// Fire-and-forget queue. Uploads enqueue without awaiting; a bounded worker
// drains it so a burst of uploads doesn't fan out into N parallel Gemini calls.
// ---------------------------------------------------------------------------
const QUEUE_CONCURRENCY = 2;
const queue: string[] = [];
const inFlight = new Set<string>();
let activeWorkers = 0;

async function drain(): Promise<void> {
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (inFlight.has(id)) continue;
    inFlight.add(id);
    try {
      await analyzeAndTagMedia(id);
    } catch (error: any) {
      console.warn("[Media Auto-Tag] queue item failed:", id, error?.message || error);
    } finally {
      inFlight.delete(id);
    }
  }
}

/** Enqueue a media file for background analysis. Never throws, never blocks. */
export function enqueueAutoTag(mediaFileId: string): void {
  if (!mediaFileId || inFlight.has(mediaFileId) || queue.includes(mediaFileId)) return;
  queue.push(mediaFileId);
  while (activeWorkers < QUEUE_CONCURRENCY && queue.length > 0) {
    activeWorkers++;
    void drain().finally(() => {
      activeWorkers--;
    });
  }
}

export interface BackfillResult {
  processed: number;
  done: number;
  failed: number;
  skipped: number;
  remaining: number;
}

/**
 * Backfill the existing archive: analyze a bounded batch of not-yet-done images
 * (synchronously, low concurrency) and report how many still remain so the UI
 * can loop until the library is fully tagged.
 */
export async function backfillUntagged(batchSize = 6): Promise<BackfillResult> {
  const size = Math.min(20, Math.max(1, batchSize));

  // Only pending/never-analyzed rows are looped. Each processed row leaves this
  // set (becomes done/failed/skipped), so `remaining` strictly decreases and the
  // UI loop terminates — a persistently-failing image won't be reselected. Use
  // the per-image retag endpoint to retry a "failed" row explicitly.
  const pendingCond = and(
    eq(mediaFiles.type, "image"),
    sql`(${mediaFiles.url} LIKE 'https://%' OR ${mediaFiles.url} LIKE 'gs://%')`,
    or(
      isNull(mediaFiles.aiAnalysisStatus),
      eq(mediaFiles.aiAnalysisStatus, "pending"),
    ),
  );

  const rows = await db
    .select({ id: mediaFiles.id })
    .from(mediaFiles)
    .where(pendingCond)
    .orderBy(desc(mediaFiles.createdAt))
    .limit(size);

  let done = 0;
  let failed = 0;
  let skipped = 0;

  // Concurrency-limited sequential batches (3 at a time).
  for (let i = 0; i < rows.length; i += 3) {
    const slice = rows.slice(i, i + 3);
    const outcomes = await Promise.all(slice.map((r) => analyzeAndTagMedia(r.id)));
    for (const o of outcomes) {
      if (o === "done") done++;
      else if (o === "failed") failed++;
      else skipped++;
    }
  }

  const [remainingRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(mediaFiles)
    .where(pendingCond);
  const remaining = Number(remainingRow?.n) || 0;

  return { processed: rows.length, done, failed, skipped, remaining };
}
