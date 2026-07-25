/**
 * Cached admin dashboard KPI snapshot (newsroom overview).
 * Shared by web `/api/admin/dashboard/stats`, mobile full-stats, and boot warmup.
 */
import { CACHE_TTL, withSWR } from "../memoryCache";
import { storage } from "../storage";

export const ADMIN_DASHBOARD_STATS_CACHE_KEY = "admin:dashboard:stats";

type AdminDashboardRaw = Awaited<ReturnType<typeof storage.getAdminDashboardStats>>;

export type TrimmedAdminDashboardStats = Omit<
  AdminDashboardRaw,
  "recentArticles" | "topArticles" | "recentComments"
> & {
  recentArticles: Array<{
    id: string;
    title: string;
    slug: string;
    englishSlug?: string;
    status: string;
    publishedAt: Date | null;
    views: number;
    author?: {
      firstName: string | null;
      lastName: string | null;
      email: string | null;
    };
  }>;
  topArticles: Array<{
    id: string;
    title: string;
    slug: string;
    englishSlug?: string;
    status: string;
    publishedAt: Date | null;
    views: number;
    category?: { nameAr: string | null };
  }>;
  recentComments: Array<{
    id: string;
    content: string;
    articleId?: string;
    createdAt: Date | null;
    status: string;
    user?: {
      firstName: string | null;
      lastName: string | null;
      email?: string | null;
    };
  }>;
};

export function trimAdminDashboardStats(stats: AdminDashboardRaw): TrimmedAdminDashboardStats {
  return {
    ...stats,
    recentArticles: stats.recentArticles.map((article: any) => ({
      id: article.id,
      title: article.title,
      slug: article.slug,
      englishSlug: article.englishSlug || undefined,
      status: article.status,
      publishedAt: article.publishedAt,
      views: article.views,
      author: article.author
        ? {
            firstName: article.author.firstName,
            lastName: article.author.lastName,
            email: article.author.email,
          }
        : undefined,
    })),
    topArticles: stats.topArticles.map((article: any) => ({
      id: article.id,
      title: article.title,
      slug: article.slug,
      englishSlug: article.englishSlug || undefined,
      status: article.status,
      publishedAt: article.publishedAt,
      views: article.views,
      category: article.category
        ? {
            nameAr: article.category.nameAr,
          }
        : undefined,
    })),
    recentComments: stats.recentComments.map((comment: any) => ({
      id: comment.id,
      content: comment.content ? comment.content.substring(0, 100) : "",
      articleId: comment.articleId,
      createdAt: comment.createdAt,
      status: comment.status,
      user: comment.user
        ? {
            firstName: comment.user.firstName,
            lastName: comment.user.lastName,
            email: comment.user.email,
          }
        : undefined,
    })),
  };
}

async function fetchTrimmedAdminDashboardStats(): Promise<TrimmedAdminDashboardStats> {
  const stats = await storage.getAdminDashboardStats();
  return trimAdminDashboardStats(stats);
}

/** Fresh 5m, serve stale up to 15m while one background refresh runs (single-flight). */
export function getCachedAdminDashboardStats(
  forceFresh = false,
): Promise<TrimmedAdminDashboardStats> {
  return withSWR(
    ADMIN_DASHBOARD_STATS_CACHE_KEY,
    CACHE_TTL.MEDIUM,
    CACHE_TTL.LONG,
    fetchTrimmedAdminDashboardStats,
    forceFresh,
  );
}
