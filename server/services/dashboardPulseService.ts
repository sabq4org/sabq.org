import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { CACHE_TTL, withSWR } from "../memoryCache";
import {
  articleOpenBuckets,
  articles,
  categories,
  comments,
  readingHistory,
  reactions,
  userEvents,
  users,
} from "@shared/schema";

export interface DashboardPulseStats {
  articles: {
    publishedToday: number;
    publishedYesterday: number;
    pendingReview: number;
    needsChanges: number;
    /** مسودات مفتوحة غير مرفوعة للمراجعة ولا معادة للتعديل. */
    draft: number;
    scheduled: number;
    /** فتحات حقيقية لكل الزوار (ويب + تطبيقات، بلا زيادة) منذ منتصف ليل الرياض. */
    viewsToday: number;
    viewsYesterday: number;
    /** "opens" = article_open_buckets؛ "legacy" = user_events (أعضاء الويب فقط) قبل تنفيذ الجدول. */
    viewsSource: "opens" | "legacy";
  };
  users: { activeToday: number };
  comments: {
    receivedToday: number;
    moderatedToday: number;
    pendingOlderThanTwoHours: number;
  };
  reactions: { todayCount: number; yesterdayCount: number };
  engagement: {
    readsToday: number;
    readsYesterday: number;
    /** متوسط مدة القراءة اليوم بالثواني، دون القراءات الصفرية أو فوق ساعة. */
    averageTimeOnSite: number;
  };
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
  return withSWR(
    "admin:dashboard:pulse",
    CACHE_TTL.SHORT,
    CACHE_TTL.SHORT,
    computeDashboardPulseStats,
  );
}

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3 طوال السنة (بلا توقيت صيفي)

/** منتصف ليل اليوم بتوقيت الرياض، مستقلًا عن المنطقة الزمنية للخادم (Render = UTC). */
export function riyadhDayStart(now: Date): Date {
  const shifted = new Date(now.getTime() + RIYADH_OFFSET_MS);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - RIYADH_OFFSET_MS,
  );
}

async function computeDashboardPulseStats(): Promise<DashboardPulseStats> {
  const now = new Date();
  // كل أرقام «اليوم» و«أمس» في البطاقة على يوم الرياض (الخادم يعمل بتوقيت UTC).
  const todayStart = riyadhDayStart(now);
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayComparableEnd = new Date(
    yesterdayStart.getTime() + (now.getTime() - todayStart.getTime()),
  );
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const [
    [articleStats],
    viewsBlock,
    [commentStats],
    [reactionStats],
    [readingStats],
    [userStats],
    trendingArticles,
    upcomingSchedule,
  ] = await Promise.all([
    db
      .select({
        publishedToday: sql<number>`count(*) filter (where ${articles.status} = 'published' and ${articles.publishedAt} >= ${todayStart})`,
        publishedYesterday: sql<number>`count(*) filter (where ${articles.status} = 'published' and ${articles.publishedAt} >= ${yesterdayStart} and ${articles.publishedAt} < ${yesterdayComparableEnd})`,
        // review_status يبقى عالقًا على أخبار نُشرت أو أُرشفت من مسارات قديمة؛
        // لا تُحسب في المسار إلا المسودات (status = 'draft').
        pendingReview: sql<number>`count(*) filter (where ${articles.status} = 'draft' and ${articles.reviewStatus} = 'pending_review')`,
        needsChanges: sql<number>`count(*) filter (where ${articles.status} = 'draft' and ${articles.reviewStatus} = 'needs_changes')`,
        draft: sql<number>`count(*) filter (where ${articles.status} = 'draft' and (${articles.reviewStatus} is null or ${articles.reviewStatus} not in ('pending_review', 'needs_changes')))`,
        scheduled: sql<number>`count(*) filter (where ${articles.status} = 'scheduled')`,
      })
      .from(articles),
    loadViews(todayStart, yesterdayStart, yesterdayComparableEnd),
    db
      .select({
        receivedToday: sql<number>`count(*) filter (where ${comments.createdAt} >= ${todayStart})`,
        moderatedToday: sql<number>`count(*) filter (where ${comments.moderatedAt} >= ${todayStart})`,
        pendingOlderThanTwoHours: sql<number>`count(*) filter (where ${comments.status} = 'pending' and ${comments.createdAt} < ${twoHoursAgo})`,
      })
      .from(comments),
    db
      .select({
        todayCount: sql<number>`count(*) filter (where ${reactions.createdAt} >= ${todayStart})`,
        yesterdayCount: sql<number>`count(*) filter (where ${reactions.createdAt} < ${yesterdayComparableEnd})`,
      })
      .from(reactions)
      .where(gte(reactions.createdAt, yesterdayStart)),
    db
      .select({
        readsToday: sql<number>`count(*) filter (where ${readingHistory.readAt} >= ${todayStart})`,
        readsYesterday: sql<number>`count(*) filter (where ${readingHistory.readAt} < ${yesterdayComparableEnd})`,
        avgDurationToday: sql<number>`coalesce(avg(${readingHistory.readDuration}) filter (where ${readingHistory.readAt} >= ${todayStart} and ${readingHistory.readDuration} between 1 and 3600), 0)`,
      })
      .from(readingHistory)
      .where(gte(readingHistory.readAt, yesterdayStart)),
    db
      .select({
        activeToday: sql<number>`count(*)`,
      })
      .from(users)
      .where(and(gte(users.lastActivityAt, todayStart), isNull(users.deletedAt))),
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
  ]);
  const hourlyViews = viewsBlock.hourly;

  const result: DashboardPulseStats = {
    articles: {
      publishedToday: Number(articleStats.publishedToday),
      publishedYesterday: Number(articleStats.publishedYesterday),
      pendingReview: Number(articleStats.pendingReview),
      needsChanges: Number(articleStats.needsChanges),
      draft: Number(articleStats.draft),
      scheduled: Number(articleStats.scheduled),
      viewsToday: viewsBlock.today,
      viewsYesterday: viewsBlock.yesterday,
      viewsSource: viewsBlock.source,
    },
    users: { activeToday: Number(userStats.activeToday) },
    comments: {
      receivedToday: Number(commentStats.receivedToday),
      moderatedToday: Number(commentStats.moderatedToday),
      pendingOlderThanTwoHours: Number(commentStats.pendingOlderThanTwoHours),
    },
    reactions: {
      todayCount: Number(reactionStats.todayCount),
      yesterdayCount: Number(reactionStats.yesterdayCount),
    },
    engagement: {
      readsToday: Number(readingStats.readsToday),
      readsYesterday: Number(readingStats.readsYesterday),
      averageTimeOnSite: Math.round(Number(readingStats.avgDurationToday)),
    },
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

  return result;
}

interface ViewsBlock {
  today: number;
  yesterday: number;
  hourly: Array<{ hour: string; views: number }>;
  source: "opens" | "legacy";
}

/**
 * «مرات فتح الأخبار»: من article_open_buckets (كل الزوار، بلا زيادة).
 * قبل تنفيذ migrations/20261107_article_open_buckets.sql يرجع إلى user_events
 * (أعضاء الويب فقط) حتى لا تسقط البطاقة.
 */
async function loadViews(
  todayStart: Date,
  yesterdayStart: Date,
  yesterdayComparableEnd: Date,
): Promise<ViewsBlock> {
  // bucket_start = timestamptz؛ user_events.created_at = timestamp بقيمة UTC.
  const riyadhHourTz = (col: unknown) =>
    sql<string>`to_char(date_trunc('hour', ${col} AT TIME ZONE 'Asia/Riyadh'), 'HH24:00')`;
  const riyadhHourUtc = (col: unknown) =>
    sql<string>`to_char(date_trunc('hour', (${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Riyadh'), 'HH24:00')`;
  try {
    const [[totals], hourly] = await Promise.all([
      db
        .select({
          today: sql<number>`coalesce(sum(${articleOpenBuckets.opens}) filter (where ${articleOpenBuckets.bucketStart} >= ${todayStart}), 0)`,
          yesterday: sql<number>`coalesce(sum(${articleOpenBuckets.opens}) filter (where ${articleOpenBuckets.bucketStart} < ${yesterdayComparableEnd}), 0)`,
        })
        .from(articleOpenBuckets)
        .where(gte(articleOpenBuckets.bucketStart, yesterdayStart)),
      db
        .select({
          hour: riyadhHourTz(articleOpenBuckets.bucketStart),
          views: sql<number>`sum(${articleOpenBuckets.opens})`,
        })
        .from(articleOpenBuckets)
        .where(gte(articleOpenBuckets.bucketStart, todayStart))
        .groupBy(sql`1`)
        .orderBy(sql`1`),
    ]);
    return {
      today: Number(totals?.today ?? 0),
      yesterday: Number(totals?.yesterday ?? 0),
      hourly: hourly.map((h) => ({ hour: h.hour, views: Number(h.views) })),
      source: "opens",
    };
  } catch (err: any) {
    const code = err?.cause?.code ?? err?.code;
    if (code !== "42P01" && code !== "42501") throw err;
  }

  const [[totals], hourly] = await Promise.all([
    db
      .select({
        today: sql<number>`count(*) filter (where ${userEvents.createdAt} >= ${todayStart})`,
        yesterday: sql<number>`count(*) filter (where ${userEvents.createdAt} < ${yesterdayComparableEnd})`,
      })
      .from(userEvents)
      .where(and(eq(userEvents.eventType, "view"), gte(userEvents.createdAt, yesterdayStart))),
    db
      .select({
        hour: riyadhHourUtc(userEvents.createdAt),
        views: sql<number>`count(*)`,
      })
      .from(userEvents)
      .where(and(eq(userEvents.eventType, "view"), gte(userEvents.createdAt, todayStart)))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
  ]);
  return {
    today: Number(totals?.today ?? 0),
    yesterday: Number(totals?.yesterday ?? 0),
    hourly: hourly.map((h) => ({ hour: h.hour, views: Number(h.views) })),
    source: "legacy",
  };
}
