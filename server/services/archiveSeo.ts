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

/**
 * Exact archive paths observed as confirmed 404s in the Cloudflare sample.
 *
 * These are deliberately keyed by the complete path as requested, rather than
 * by a title/slug heuristic. The immutable article id is checked at request
 * time so an editorial withdrawal removes the redirect automatically.
 */
const KNOWN_ARCHIVE_CANONICALS: Record<string, { articleId: string; canonicalSlug: string }> = Object.freeze({
  "/شاهد-حكاية-حمارين-أحدهما-يأكل-التفاح-والآخر-يواجه-قوات-الاحتلال-الإسرائيلي": { articleId: "90d78a39-57e7-4564-b146-d08e78ff9958", canonicalSlug: "_VitNn4" },
  "//sabq.org/متدربا-ينهون-دورة-في-الغوص-والإنقاذ-المائي-بمدني-جدة": { articleId: "6a010fa7-1d1e-42e4-902c-ca1917201150", canonicalSlug: "7WsDuDo" },
  "//sabq.org/أمطار-خفيفة-ومتوسطة-على-مناطق-مختلفة-من-عفيف-و-مهد-الذهب": { articleId: "33325916-c7af-4b1f-82d0-e49e3a1a3b80", canonicalSlug: "J192hOt" },
  "//sabq.org/وفاة-الشاب-العجمة-ابن-مفتش-التعليم-بالطائف-سابقا": { articleId: "abb97b66-161a-4d00-a54e-cb6a3262bac5", canonicalSlug: "oaE7dR8" },
  "/بالصور-هنا-ستكون-أكبر-مدينة-ثقافية-رياضية-ترفيهية-بالعالم": { articleId: "3a701f84-87c9-445c-b125-56c9cc1f19d4", canonicalSlug: "FKePKNY" },
  "//sabq.org/صحة-مكة-تكشف-ملابسات-تناثر-أوراق-أحد-المستشفيات": { articleId: "7b0d113f-4cdf-40cd-8395-fb99cdb2aa4b", canonicalSlug: "KozGzZc" },
  "//sabq.org/فحوصات-وعملية-جراحية-بالمنظار-للأمير-متعب-بن-عبدالله": { articleId: "ac57886f-f8ce-498c-9021-75d748b807a5", canonicalSlug: "mSaPBnz" },
  "/التدريب-التقني-توجه-متطوعا-متخصصا-لصيانة-مرافق-الجنادرية": { articleId: "24f3dc1f-83e6-441b-bd1a-68ce56cae210", canonicalSlug: "jyGlxDF" },
  "//sabq.org/تعليم-الليث-يعلق-الدراسة-غدا-بمدارس-حقال-الدثن-والفحو-وبني-يزيد-وجدم": { articleId: "56091274-e4fe-4459-8ad2-e1673b2f994e", canonicalSlug: "7aPUeB6" },
  "/تدريب-طالب-وطالبة-في-مهرجان-stem-الصيفي-بتعليم-عسير": { articleId: "140b1981-e974-4f1a-94e3-1738c492dbbe", canonicalSlug: "dljONuL" },
});

const ARCHIVE_CANONICAL_HOST = "sabq.org";

function decodeArchivePath(path: string): string {
  try {
    return decodeURIComponent(path).replace(/\/$/, "");
  } catch {
    return path.replace(/\/$/, "");
  }
}

export function isKnownArchiveCanonicalPath(path: string): boolean {
  return !!KNOWN_ARCHIVE_CANONICALS[decodeArchivePath(path)];
}

/**
 * Resolve only confirmed archive paths on the canonical host. The id + slug
 * check is intentional: a withdrawn row must return null, never 301 to an old
 * destination, and a changed canonical slug must be reviewed explicitly.
 */
export async function resolveKnownArchiveCanonical(path: string, host: string): Promise<string | null> {
  if (host.toLowerCase() !== ARCHIVE_CANONICAL_HOST) return null;
  const match = KNOWN_ARCHIVE_CANONICALS[decodeArchivePath(path)];
  if (!match) return null;
  const result = await db.execute(sql`
    SELECT coalesce(nullif(english_slug, ''), slug) AS slug
    FROM articles
    WHERE id = ${match.articleId} AND status = 'published'
    LIMIT 1
  `);
  const slug = result.rows[0]?.slug;
  return slug === match.canonicalSlug
    ? `/article/${encodeURIComponent(match.canonicalSlug)}`
    : null;
}

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
        FROM articles AS archive_candidate
        WHERE archive_candidate.legacy_slug = ${articles.legacySlug}
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
