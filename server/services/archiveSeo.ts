import { and, eq, inArray, sql } from "drizzle-orm";
import { articles, legacyRedirects } from "@shared/schema";
import { db } from "../db";

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
 * The legacy_slug index bounds each correlated lookup to the import's tiny group.
 * This predicate is shared by redirects and the Arabic archive sitemap.
 */
export function isCanonicalArchiveArticle() {
  return sql`NOT EXISTS (
    SELECT 1 FROM articles AS archive_original
    WHERE ${articles.legacySlug} IS NOT NULL AND ${articles.legacySlug} <> ''
      AND ${articles.content} IS NOT NULL AND ${articles.content} <> ''
      AND archive_original.legacy_slug = ${articles.legacySlug}
      AND archive_original.status = 'published'
      AND archive_original.title = ${articles.title}
      AND archive_original.content = ${articles.content}
      AND archive_original.published_at = ${articles.publishedAt}
      AND (archive_original.created_at, archive_original.id) < (${articles.createdAt}, ${articles.id})
  )`;
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
