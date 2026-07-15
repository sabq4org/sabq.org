import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { mediaFiles, mediaUsageLog } from "@shared/schema";

// The editor stores the *display* URL on the article: a public https URL, or
// /api/media/proxy/<id> for private gs:// files (possibly absolute with origin).
const PROXY_URL_RE = /\/api\/media\/proxy\/([0-9a-fA-F-]{16,})/;

/**
 * Resolve an article hero image URL back to its media_files row id.
 * Handles both direct URLs (matched by media_files.url) and proxy URLs.
 */
async function resolveMediaIdByUrl(imageUrl: string): Promise<string | null> {
  const proxyMatch = imageUrl.match(PROXY_URL_RE);
  if (proxyMatch) return proxyMatch[1];

  const [row] = await db
    .select({ id: mediaFiles.id })
    .from(mediaFiles)
    .where(eq(mediaFiles.url, imageUrl))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Record that an article uses a media file as its hero image. Idempotent —
 * one usage row per (media, article) pair, so repeated saves of the same
 * article don't inflate usage counts. Best-effort: never throws, so it can be
 * fire-and-forgotten from the article create/update handlers.
 *
 * This closes the biggest usage-tracking gap: picking a featured image alone
 * previously logged nothing, so "most used" / "unused" collections were wrong.
 */
export async function recordHeroImageUsage(opts: {
  articleId: string;
  imageUrl: string | null | undefined;
  userId?: string | null;
  entityType?: string; // defaults to 'article'
}): Promise<void> {
  const { articleId, imageUrl, userId } = opts;
  const entityType = opts.entityType || "article";
  if (!articleId || !imageUrl || typeof imageUrl !== "string") return;

  try {
    const mediaId = await resolveMediaIdByUrl(imageUrl);
    if (!mediaId) return;

    const [existing] = await db
      .select({ id: mediaUsageLog.id })
      .from(mediaUsageLog)
      .where(and(
        eq(mediaUsageLog.mediaId, mediaId),
        eq(mediaUsageLog.entityType, entityType),
        eq(mediaUsageLog.entityId, articleId),
      ))
      .limit(1);
    if (existing) return;

    await db.insert(mediaUsageLog).values({
      mediaId,
      entityType,
      entityId: articleId,
      usedBy: userId || null,
    });
  } catch (error: any) {
    console.warn("[Media Usage] failed to record hero usage:", articleId, error?.message || error);
  }
}
