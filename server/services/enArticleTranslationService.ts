/**
 * Helpers for Arabic → English article translation:
 * category mapping, slug preference, sibling sync.
 */
import { db } from "../db";
import { articles, categories, enArticles, enCategories } from "@shared/schema";
import { and, eq, or, sql } from "drizzle-orm";

/** Map an Arabic category to en_categories via slug / englishSlug / name. */
export async function resolveEnCategoryId(
  arCategoryId: string | null | undefined,
): Promise<{ enCategoryId: string | null; categoryNameAr: string }> {
  if (!arCategoryId) return { enCategoryId: null, categoryNameAr: "" };

  const [cat] = await db
    .select({
      nameAr: categories.nameAr,
      nameEn: categories.nameEn,
      slug: categories.slug,
      englishSlug: categories.englishSlug,
    })
    .from(categories)
    .where(eq(categories.id, arCategoryId))
    .limit(1);

  if (!cat) return { enCategoryId: null, categoryNameAr: "" };

  const slugCandidates = [cat.englishSlug, cat.slug]
    .filter((s): s is string => Boolean(s && s.trim()))
    .map((s) => s.trim().toLowerCase());

  if (slugCandidates.length > 0) {
    const [bySlug] = await db
      .select({ id: enCategories.id })
      .from(enCategories)
      .where(
        and(
          eq(enCategories.status, "active"),
          or(...slugCandidates.map((s) => sql`LOWER(${enCategories.slug}) = ${s}`)),
        ),
      )
      .limit(1);
    if (bySlug) {
      return { enCategoryId: bySlug.id, categoryNameAr: cat.nameAr || "" };
    }
  }

  const nameEn = (cat.nameEn || "").trim();
  if (nameEn) {
    const [byName] = await db
      .select({ id: enCategories.id })
      .from(enCategories)
      .where(
        and(
          eq(enCategories.status, "active"),
          sql`LOWER(${enCategories.name}) = LOWER(${nameEn})`,
        ),
      )
      .limit(1);
    if (byName) {
      return { enCategoryId: byName.id, categoryNameAr: cat.nameAr || "" };
    }
  }

  console.warn(
    `[Translate] No EN category match for AR category id=${arCategoryId} nameEn=${nameEn} slug=${cat.slug}`,
  );
  return { enCategoryId: null, categoryNameAr: cat.nameAr || "" };
}

/**
 * Prefer the Arabic article's englishSlug for the EN URL when free,
 * so hreflang can share the same short code (/article/X ↔ /en/article/X).
 */
export async function pickEnArticleSlug(opts: {
  preferredFromAr: string | null | undefined;
  fromTitle: string;
}): Promise<string> {
  const preferred = (opts.preferredFromAr || "").trim();
  if (preferred) {
    const [taken] = await db
      .select({ id: enArticles.id })
      .from(enArticles)
      .where(
        or(eq(enArticles.slug, preferred), eq(enArticles.englishSlug, preferred)),
      )
      .limit(1);
    if (!taken) return preferred;
  }
  return opts.fromTitle;
}

/** Sync newsType onto the Arabic source linked via seoMetadata.sourceArticleId. */
export async function syncBreakingToArabicSource(
  enArticle: { seoMetadata?: unknown },
  newsType: string,
): Promise<void> {
  const sourceId =
    enArticle.seoMetadata && typeof enArticle.seoMetadata === "object"
      ? (enArticle.seoMetadata as { sourceArticleId?: string }).sourceArticleId
      : undefined;
  if (!sourceId) return;

  await db
    .update(articles)
    .set({ newsType, updatedAt: new Date() })
    .where(eq(articles.id, sourceId));
}
