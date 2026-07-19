import { eq, or } from "drizzle-orm";
import { db } from "../db";
import { articles, enArticles, urArticles, legacyRedirects } from "@shared/schema";
import { randomUUID } from "crypto";

export type AdminArticleLocale = "ar" | "en" | "ur";

type ArticleRef = {
  id: string;
  title: string;
};

type ArticleWithViews = ArticleRef & { views: number };

type ReadingOverrides = {
  avgReadTimeOverride: number | null;
  completionRateOverride: number | null;
};

function slugWhere(
  table: typeof articles | typeof enArticles | typeof urArticles,
  slug: string,
) {
  return or(eq(table.slug, slug), eq(table.englishSlug, slug));
}

export async function findArticleIdBySlug(
  slug: string,
): Promise<(ArticleRef & { locale: AdminArticleLocale }) | null> {
  const [arArticle] = await db
    .select({ id: articles.id, title: articles.title })
    .from(articles)
    .where(slugWhere(articles, slug))
    .limit(1);
  if (arArticle) return { ...arArticle, locale: "ar" };

  const [enArticle] = await db
    .select({ id: enArticles.id, title: enArticles.title })
    .from(enArticles)
    .where(slugWhere(enArticles, slug))
    .limit(1);
  if (enArticle) return { ...enArticle, locale: "en" };

  const [urArticle] = await db
    .select({ id: urArticles.id, title: urArticles.title })
    .from(urArticles)
    .where(slugWhere(urArticles, slug))
    .limit(1);
  if (urArticle) return { ...urArticle, locale: "ur" };

  return null;
}

export async function updateArticleViewsBySlug(
  slug: string,
  views: number,
): Promise<(ArticleWithViews & { locale: AdminArticleLocale }) | null> {
  const [arArticle] = await db
    .update(articles)
    .set({ views })
    .where(slugWhere(articles, slug))
    .returning({ id: articles.id, title: articles.title, views: articles.views });
  if (arArticle) return { ...arArticle, locale: "ar" };

  const [enArticle] = await db
    .update(enArticles)
    .set({ views })
    .where(slugWhere(enArticles, slug))
    .returning({ id: enArticles.id, title: enArticles.title, views: enArticles.views });
  if (enArticle) return { ...enArticle, locale: "en" };

  const [urArticle] = await db
    .update(urArticles)
    .set({ views })
    .where(slugWhere(urArticles, slug))
    .returning({ id: urArticles.id, title: urArticles.title, views: urArticles.views });
  if (urArticle) return { ...urArticle, locale: "ur" };

  return null;
}

export async function updateAvgReadTimeOverrideBySlug(
  slug: string,
  avgReadTimeSeconds: number,
): Promise<(ArticleRef & { avgReadTimeOverride: number | null; locale: AdminArticleLocale }) | null> {
  const [arArticle] = await db
    .update(articles)
    .set({ avgReadTimeOverride: avgReadTimeSeconds })
    .where(slugWhere(articles, slug))
    .returning({
      id: articles.id,
      title: articles.title,
      avgReadTimeOverride: articles.avgReadTimeOverride,
    });
  if (arArticle) return { ...arArticle, locale: "ar" };

  const [enArticle] = await db
    .update(enArticles)
    .set({ avgReadTimeOverride: avgReadTimeSeconds })
    .where(slugWhere(enArticles, slug))
    .returning({
      id: enArticles.id,
      title: enArticles.title,
      avgReadTimeOverride: enArticles.avgReadTimeOverride,
    });
  if (enArticle) return { ...enArticle, locale: "en" };

  const [urArticle] = await db
    .update(urArticles)
    .set({ avgReadTimeOverride: avgReadTimeSeconds })
    .where(slugWhere(urArticles, slug))
    .returning({
      id: urArticles.id,
      title: urArticles.title,
      avgReadTimeOverride: urArticles.avgReadTimeOverride,
    });
  if (urArticle) return { ...urArticle, locale: "ur" };

  return null;
}

export async function updateCompletionRateOverrideBySlug(
  slug: string,
  completionRate: number,
): Promise<(ArticleRef & { completionRateOverride: number | null; locale: AdminArticleLocale }) | null> {
  const [arArticle] = await db
    .update(articles)
    .set({ completionRateOverride: completionRate })
    .where(slugWhere(articles, slug))
    .returning({
      id: articles.id,
      title: articles.title,
      completionRateOverride: articles.completionRateOverride,
    });
  if (arArticle) return { ...arArticle, locale: "ar" };

  const [enArticle] = await db
    .update(enArticles)
    .set({ completionRateOverride: completionRate })
    .where(slugWhere(enArticles, slug))
    .returning({
      id: enArticles.id,
      title: enArticles.title,
      completionRateOverride: enArticles.completionRateOverride,
    });
  if (enArticle) return { ...enArticle, locale: "en" };

  const [urArticle] = await db
    .update(urArticles)
    .set({ completionRateOverride: completionRate })
    .where(slugWhere(urArticles, slug))
    .returning({
      id: urArticles.id,
      title: urArticles.title,
      completionRateOverride: urArticles.completionRateOverride,
    });
  if (urArticle) return { ...urArticle, locale: "ur" };

  return null;
}

export async function getArticleReadingOverrides(
  articleId: string,
  locale: AdminArticleLocale = "ar",
): Promise<ReadingOverrides | null> {
  if (locale === "en") {
    const [overrides] = await db
      .select({
        avgReadTimeOverride: enArticles.avgReadTimeOverride,
        completionRateOverride: enArticles.completionRateOverride,
      })
      .from(enArticles)
      .where(eq(enArticles.id, articleId))
      .limit(1);
    return overrides ?? null;
  }

  if (locale === "ur") {
    const [overrides] = await db
      .select({
        avgReadTimeOverride: urArticles.avgReadTimeOverride,
        completionRateOverride: urArticles.completionRateOverride,
      })
      .from(urArticles)
      .where(eq(urArticles.id, articleId))
      .limit(1);
    return overrides ?? null;
  }

  const [overrides] = await db
    .select({
      avgReadTimeOverride: articles.avgReadTimeOverride,
      completionRateOverride: articles.completionRateOverride,
    })
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);
  return overrides ?? null;
}

/** Admin override is stored in seconds; reports display minutes. */
export function resolveReadingMetrics(input: {
  avgReadingMinutes: number;
  avgCompletionRate: number;
  overrides?: ReadingOverrides | null;
}): { avgReadingMinutes: number; avgCompletionRate: number; hasOverride: boolean } {
  const hasTimeOverride = input.overrides?.avgReadTimeOverride != null;
  const hasCompletionOverride = input.overrides?.completionRateOverride != null;
  return {
    avgReadingMinutes: hasTimeOverride
      ? Math.round((Number(input.overrides!.avgReadTimeOverride) / 60) * 10) / 10
      : input.avgReadingMinutes,
    avgCompletionRate: hasCompletionOverride
      ? Number(input.overrides!.completionRateOverride)
      : input.avgCompletionRate,
    hasOverride: hasTimeOverride || hasCompletionOverride,
  };
}

export class LegacyRedirectConflictError extends Error {
  constructor() {
    super("هذا التحويل موجود مسبقاً");
    this.name = "LegacyRedirectConflictError";
  }
}

export async function createLegacyRedirect(input: {
  oldPath: string;
  newPath: string;
  redirectType?: number;
  createdBy: string;
}) {
  const [existing] = await db
    .select({ id: legacyRedirects.id })
    .from(legacyRedirects)
    .where(eq(legacyRedirects.oldPath, input.oldPath))
    .limit(1);

  if (existing) {
    throw new LegacyRedirectConflictError();
  }

  const [redirect] = await db
    .insert(legacyRedirects)
    .values({
      id: randomUUID(),
      oldPath: input.oldPath,
      newPath: input.newPath,
      redirectType: input.redirectType || 301,
      isActive: true,
      createdBy: input.createdBy,
    })
    .returning();

  return redirect;
}
