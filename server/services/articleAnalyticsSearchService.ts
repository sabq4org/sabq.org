import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import { enArticles, enCategories, readingHistory, users } from "@shared/schema";
import {
  getArticleReadingOverrides,
  resolveReadingMetrics,
} from "./adminToolsService";

export type AnalyticsLocale = "ar" | "en";

export type AnalyticsListItem = {
  id: string;
  title: string | null;
  slug: string | null;
  englishSlug?: string | null;
  excerpt: string | null;
  imageUrl: string | null;
  status: string | null;
  publishedAt: Date | null;
  createdAt: Date | null;
  category: { id: string; nameAr: string | null; slug: string | null } | null;
  author: { id: string; name: string | null } | null;
  views: number;
  likesCount: number;
  savesCount: number;
  commentsCount: number;
  sharesCount: number;
  wordCount: number;
  avgReadingTime: number;
  locale: AnalyticsLocale;
};

/**
 * Search English articles for the analytics dashboard.
 * Used when Arabic search finds nothing (or to supplement EN title queries).
 * EN rows often lack seoMetadata.sourceArticleId, so they must appear as EN results.
 */
export async function searchEnArticlesForAnalytics(input: {
  query: string;
  status?: string;
  limit: number;
}): Promise<AnalyticsListItem[]> {
  const searchQuery = input.query.trim();
  if (!searchQuery) return [];

  const pattern = `%${searchQuery}%`;
  const where = [
    or(
      ilike(enArticles.title, pattern),
      ilike(enArticles.subtitle, pattern),
      ilike(enArticles.excerpt, pattern),
      ilike(enArticles.slug, pattern),
      ilike(enArticles.englishSlug, pattern),
      eq(enArticles.id, searchQuery),
    ),
  ];

  if (input.status && input.status !== "all") {
    where.push(eq(enArticles.status, input.status));
  }

  const rows = await db
    .select({
      id: enArticles.id,
      title: enArticles.title,
      slug: enArticles.slug,
      englishSlug: enArticles.englishSlug,
      excerpt: enArticles.excerpt,
      imageUrl: enArticles.imageUrl,
      status: enArticles.status,
      views: enArticles.views,
      publishedAt: enArticles.publishedAt,
      createdAt: enArticles.createdAt,
      categoryId: enArticles.categoryId,
      categoryName: enCategories.name,
      categorySlug: enCategories.slug,
      authorId: enArticles.authorId,
      authorFirstName: users.firstName,
      authorLastName: users.lastName,
      avgReadTimeOverride: enArticles.avgReadTimeOverride,
      completionRateOverride: enArticles.completionRateOverride,
    })
    .from(enArticles)
    .leftJoin(enCategories, eq(enArticles.categoryId, enCategories.id))
    .leftJoin(users, eq(enArticles.authorId, users.id))
    .where(and(...where))
    .orderBy(desc(enArticles.publishedAt))
    .limit(input.limit);

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const readingTimeResult = await db
    .select({
      articleId: readingHistory.articleId,
      avgReadingTime: sql<number>`COALESCE(AVG(read_duration) / 60.0, 0)::real`,
    })
    .from(readingHistory)
    .where(inArray(readingHistory.articleId, ids))
    .groupBy(readingHistory.articleId);

  const readingTimeMap = new Map(
    readingTimeResult.map((r) => [r.articleId, r.avgReadingTime]),
  );

  return rows.map((article) => {
    const resolved = resolveReadingMetrics({
      avgReadingMinutes: readingTimeMap.get(article.id) || 0,
      avgCompletionRate: 0,
      overrides: {
        avgReadTimeOverride: article.avgReadTimeOverride,
        completionRateOverride: article.completionRateOverride,
      },
    });
    return {
      id: article.id,
      title: article.title,
      slug: article.slug,
      englishSlug: article.englishSlug,
      excerpt: article.excerpt,
      imageUrl: article.imageUrl,
      status: article.status,
      publishedAt: article.publishedAt,
      createdAt: article.createdAt,
      category: article.categoryId
        ? {
            id: article.categoryId,
            nameAr: article.categoryName,
            slug: article.categorySlug,
          }
        : null,
      author: {
        id: article.authorId,
        name:
          article.authorFirstName && article.authorLastName
            ? `${article.authorFirstName} ${article.authorLastName}`
            : article.authorFirstName || article.authorLastName || null,
      },
      views: article.views || 0,
      likesCount: 0,
      savesCount: 0,
      sharesCount: 0,
      commentsCount: 0,
      wordCount: 0,
      avgReadingTime: Math.round(resolved.avgReadingMinutes * 10) / 10,
      locale: "en" as const,
    };
  });
}

export async function getEnArticleAnalyticsDetail(articleId: string) {
  const [article] = await db
    .select({
      id: enArticles.id,
      title: enArticles.title,
      subtitle: enArticles.subtitle,
      slug: enArticles.slug,
      englishSlug: enArticles.englishSlug,
      excerpt: enArticles.excerpt,
      content: enArticles.content,
      imageUrl: enArticles.imageUrl,
      status: enArticles.status,
      views: enArticles.views,
      publishedAt: enArticles.publishedAt,
      createdAt: enArticles.createdAt,
      categoryId: enArticles.categoryId,
      categoryName: enCategories.name,
      categorySlug: enCategories.slug,
      authorId: enArticles.authorId,
      authorFirstName: users.firstName,
      authorLastName: users.lastName,
    })
    .from(enArticles)
    .leftJoin(enCategories, eq(enArticles.categoryId, enCategories.id))
    .leftJoin(users, eq(enArticles.authorId, users.id))
    .where(eq(enArticles.id, articleId))
    .limit(1);

  if (!article) return null;

  const [readingStats] = await db
    .select({
      avgReadingTime: sql<number>`COALESCE(AVG(read_duration) / 60.0, 0)::real`,
      totalReaders: sql<number>`COUNT(DISTINCT user_id)::int`,
      totalReadSessions: sql<number>`COUNT(*)::int`,
      avgScrollDepth: sql<number>`COALESCE(AVG(scroll_depth), 0)::real`,
      avgCompletionRate: sql<number>`COALESCE(AVG(completion_rate), 0)::real`,
    })
    .from(readingHistory)
    .where(eq(readingHistory.articleId, articleId));

  const overrides = await getArticleReadingOverrides(articleId, "en");
  const resolved = resolveReadingMetrics({
    avgReadingMinutes: readingStats?.avgReadingTime || 0,
    avgCompletionRate: readingStats?.avgCompletionRate || 0,
    overrides,
  });

  const plain = (article.content || "").replace(/<[^>]*>/g, "");
  const wordCount = plain.split(/\s+/).filter(Boolean).length;

  return {
    id: article.id,
    title: article.title,
    subtitle: article.subtitle,
    slug: article.slug,
    englishSlug: article.englishSlug,
    excerpt: article.excerpt,
    content: article.content,
    imageUrl: article.imageUrl,
    thumbnailUrl: null,
    status: article.status,
    publishedAt: article.publishedAt,
    createdAt: article.createdAt,
    category: article.categoryId
      ? {
          id: article.categoryId,
          nameAr: article.categoryName,
          slug: article.categorySlug,
        }
      : null,
    author: {
      id: article.authorId,
      name:
        article.authorFirstName && article.authorLastName
          ? `${article.authorFirstName} ${article.authorLastName}`
          : article.authorFirstName || article.authorLastName || null,
    },
    views: article.views || 0,
    likesCount: 0,
    savesCount: 0,
    sharesCount: 0,
    commentsCount: 0,
    wordCount,
    avgReadingTime: Math.round(resolved.avgReadingMinutes * 10) / 10,
    locale: "en" as const,
    reactions: {},
    commentsBreakdown: { pending: 0, approved: 0, rejected: 0, flagged: 0 },
    readingStats: {
      avgReadingTime: Math.round(resolved.avgReadingMinutes * 10) / 10,
      totalReaders: readingStats?.totalReaders || 0,
      totalReadSessions: readingStats?.totalReadSessions || 0,
      avgScrollDepth: Math.round(readingStats?.avgScrollDepth || 0),
      avgCompletionRate: Math.round(resolved.avgCompletionRate),
    },
    recentComments: [],
  };
}
