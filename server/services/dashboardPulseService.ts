import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { CACHE_TTL, memoryCache } from "../memoryCache";
import {
  articles,
  categories,
  comments,
  readingHistory,
  reactions,
  userEvents,
} from "@shared/schema";

export interface DashboardPulseStats {
  articles: {
    publishedToday: number;
    publishedYesterday: number;
    pendingReview: number;
    needsChanges: number;
    viewsYesterday: number;
  };
  comments: {
    receivedToday: number;
    moderatedToday: number;
    pendingOlderThanTwoHours: number;
  };
  reactions: { yesterdayCount: number };
  engagement: { readsYesterday: number };
  trendingArticles: Array<{
    id: string;
    title: string;
    slug: string;
    englishSlug: string | null;
    views: number;
    recentViews: number;
    categoryName: string | null;
    publishedAt: Date | null;
  }>;
  upcomingSchedule: Array<{
    id: string;
    title: string;
    scheduledAt: Date | null;
  }>;
  hourlyViews: Array<{ hour: string; views: number }>;
  generatedAt: string;
}

export async function getDashboardPulseStats(): Promise<DashboardPulseStats> {
  const cacheKey = "admin:dashboard:pulse";
  const cached = memoryCache.get<DashboardPulseStats>(cacheKey);
  if (cached) return cached;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayComparableEnd = new Date(
    yesterdayStart.getTime() + (now.getTime() - todayStart.getTime()),
  );
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const [
    [articleStats],
    [viewsStats],
    [commentStats],
    [reactionStats],
    [readingStats],
    trendingArticles,
    upcomingSchedule,
    hourlyViews,
  ] = await Promise.all([
    db
      .select({
        publishedToday: sql<number>`count(*) filter (where ${articles.status} = 'published' and ${articles.publishedAt} >= ${todayStart})`,
        publishedYesterday: sql<number>`count(*) filter (where ${articles.status} = 'published' and ${articles.publishedAt} >= ${yesterdayStart} and ${articles.publishedAt} < ${yesterdayComparableEnd})`,
        pendingReview: sql<number>`count(*) filter (where ${articles.reviewStatus} = 'pending_review')`,
        needsChanges: sql<number>`count(*) filter (where ${articles.reviewStatus} = 'needs_changes')`,
      })
      .from(articles),
    db
      .select({
        viewsYesterday: sql<number>`count(*) filter (where ${userEvents.createdAt} >= ${yesterdayStart} and ${userEvents.createdAt} < ${yesterdayComparableEnd})`,
      })
      .from(userEvents)
      .where(and(eq(userEvents.eventType, "view"), gte(userEvents.createdAt, yesterdayStart))),
    db
      .select({
        receivedToday: sql<number>`count(*) filter (where ${comments.createdAt} >= ${todayStart})`,
        moderatedToday: sql<number>`count(*) filter (where ${comments.moderatedAt} >= ${todayStart})`,
        pendingOlderThanTwoHours: sql<number>`count(*) filter (where ${comments.status} = 'pending' and ${comments.createdAt} < ${twoHoursAgo})`,
      })
      .from(comments),
    db
      .select({
        yesterdayCount: sql<number>`count(*) filter (where ${reactions.createdAt} >= ${yesterdayStart} and ${reactions.createdAt} < ${yesterdayComparableEnd})`,
      })
      .from(reactions),
    db
      .select({
        readsYesterday: sql<number>`count(*) filter (where ${readingHistory.readAt} >= ${yesterdayStart} and ${readingHistory.readAt} < ${yesterdayComparableEnd})`,
      })
      .from(readingHistory),
    db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        englishSlug: articles.englishSlug,
        views: articles.views,
        recentViews: sql<number>`count(${userEvents.id})`,
        categoryName: categories.nameAr,
        publishedAt: articles.publishedAt,
      })
      .from(userEvents)
      .innerJoin(articles, eq(userEvents.articleId, articles.id))
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(and(
        eq(userEvents.eventType, "view"),
        gte(userEvents.createdAt, last24Hours),
        eq(articles.status, "published"),
      ))
      .groupBy(
        articles.id,
        articles.title,
        articles.slug,
        articles.englishSlug,
        articles.views,
        categories.nameAr,
        articles.publishedAt,
      )
      .orderBy(desc(sql<number>`count(${userEvents.id})`))
      .limit(5),
    db
      .select({
        id: articles.id,
        title: articles.title,
        scheduledAt: articles.scheduledAt,
      })
      .from(articles)
      .where(and(eq(articles.status, "scheduled"), gte(articles.scheduledAt, now)))
      .orderBy(asc(articles.scheduledAt))
      .limit(8),
    db
      .select({
        hour: sql<string>`to_char(date_trunc('hour', ${userEvents.createdAt}), 'HH24:00')`,
        views: sql<number>`count(*)`,
      })
      .from(userEvents)
      .where(and(eq(userEvents.eventType, "view"), gte(userEvents.createdAt, todayStart)))
      .groupBy(sql`date_trunc('hour', ${userEvents.createdAt})`)
      .orderBy(sql`date_trunc('hour', ${userEvents.createdAt})`),
  ]);

  const result: DashboardPulseStats = {
    articles: {
      publishedToday: Number(articleStats.publishedToday),
      publishedYesterday: Number(articleStats.publishedYesterday),
      pendingReview: Number(articleStats.pendingReview),
      needsChanges: Number(articleStats.needsChanges),
      viewsYesterday: Number(viewsStats.viewsYesterday),
    },
    comments: {
      receivedToday: Number(commentStats.receivedToday),
      moderatedToday: Number(commentStats.moderatedToday),
      pendingOlderThanTwoHours: Number(commentStats.pendingOlderThanTwoHours),
    },
    reactions: { yesterdayCount: Number(reactionStats.yesterdayCount) },
    engagement: { readsYesterday: Number(readingStats.readsYesterday) },
    trendingArticles: trendingArticles.map((article) => ({
      ...article,
      views: Number(article.views),
      recentViews: Number(article.recentViews),
    })),
    upcomingSchedule,
    hourlyViews: hourlyViews.map((point) => ({
      hour: point.hour,
      views: Number(point.views),
    })),
    generatedAt: now.toISOString(),
  };

  memoryCache.set(cacheKey, result, CACHE_TTL.SHORT);
  return result;
}
