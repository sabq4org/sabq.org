import { and, eq, inArray, sql } from "drizzle-orm";
import { articles, legacyRedirects } from "@shared/schema";
import { db } from "../db";

// Keep each cold sitemap bounded to ~2,000 candidates. The existing % 50
// expression index still narrows the heap scan before the finer partition.
export const AR_SITEMAP_BUCKETS = 500;
export function archiveSitemapBucketCondition(bucket: number) {
  if (!Number.isInteger(bucket) || bucket < 1 || bucket > AR_SITEMAP_BUCKETS) {
    throw new RangeError("Invalid archive sitemap bucket");
  }
  const offset = bucket - 1;
  return sql`abs(hashtext(${articles.id}::text)) % 50 = ${offset % 50}
    AND abs(hashtext(${articles.id}::text)) % 500 = ${offset}`;
}

// Include the actual Quintype import sections, including /regions/.
export const LEGACY_ARTICLE_PREFIXES = new Set([
  "saudia", "saudi", "world", "arab", "local", "sport", "sports", "business",
  "economy", "politics", "society", "culture", "health", "tech", "technology",
  "cars", "tourism", "media", "entertainment", "accidents", "breaking",
  "mylife", "stations", "articles", "regions", "community", "dialogue",
  "pure", "careers", "infographic", "video", "videographic", "mobile", "shop",
]);

export function legacyPathVariants(path: string): string[] {
  const normalized = path.replace(/\/$/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length < 2 || !LEGACY_ARTICLE_PREFIXES.has(parts[0].toLowerCase())) return [];
  return [...new Set([normalized, `/${parts.slice(-2).join("/")}`, `/${parts.at(-1)}`])];
}

/** Exact-path rules win over historical shortened aliases; never emit external targets. */
export async function resolveLegacyArticlePath(path: string): Promise<string | null> {
  const variants = legacyPathVariants(path);
  if (!variants.length) return null;
  const rows = await db.select({ oldPath: legacyRedirects.oldPath, newPath: legacyRedirects.newPath })
    .from(legacyRedirects).where(and(
      inArray(legacyRedirects.oldPath, variants), eq(legacyRedirects.isActive, true),
      inArray(legacyRedirects.redirectType, [301, 308]),
    ));
  for (const oldPath of variants) {
    const target = rows.find(row => row.oldPath === oldPath)?.newPath;
    if (target && /^\/article\/[^/?#]+$/.test(target) && target !== path) return target;
  }
  return null;
}

/**
 * Keep the earliest imported copy only when the original ID, title, full body,
 * and publication timestamp agree. An edited/reused legacy ID remains independent.
 * OFFSET 0 keeps the lookup on legacy_slug alone instead of a per-row BitmapAnd
 * with published_at. CASE checks metadata before loading/decompressing TOASTed
 * content. Both barriers are intentional; cold I/O is additionally bounded by
 * the smaller archive partitions above rather than relying on warm DB caches.
 * This uses the same exact-copy decision as the individual URL resolver below.
 */
export function isCanonicalArchiveArticle() {
  return sql`CASE WHEN ${articles.legacySlug} IS NULL OR ${articles.legacySlug} = '' THEN true
    ELSE NOT EXISTS (
      SELECT 1 FROM (
        SELECT id, created_at, status, title, content, published_at
        FROM articles WHERE legacy_slug = ${articles.legacySlug}
        OFFSET 0
      ) AS archive_original
      WHERE CASE WHEN archive_original.status = 'published'
        AND (archive_original.created_at, archive_original.id) < (${articles.createdAt}, ${articles.id})
        AND archive_original.title = ${articles.title}
        AND archive_original.published_at = ${articles.publishedAt}
        THEN archive_original.content <> '' AND archive_original.content = ${articles.content}
        ELSE false END
    ) END`;
}

export async function resolveArchiveCanonical(slug: string): Promise<string | null> {
  const result = await db.execute(sql`
    SELECT coalesce(nullif(original.english_slug, ''), original.slug) AS slug
    FROM articles AS source
    JOIN articles AS original ON original.legacy_slug = source.legacy_slug
    WHERE (source.english_slug = ${slug} OR source.slug = ${slug})
      AND source.status = 'published' AND original.status = 'published'
      AND source.legacy_slug <> '' AND source.content <> ''
      AND original.title = source.title AND original.content = source.content
      AND original.published_at = source.published_at
      AND source.published_at <= now()
      AND (original.created_at, original.id) < (source.created_at, source.id)
    ORDER BY original.created_at, original.id LIMIT 1
  `);
  const canonicalSlug = result.rows[0]?.slug;
  return typeof canonicalSlug === "string" && canonicalSlug
    ? `/article/${encodeURIComponent(canonicalSlug)}` : null;
}
