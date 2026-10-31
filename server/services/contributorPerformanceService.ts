// «أداء أخباري» / «أدائي» في تطبيق «سبق» (2026-10-31). كل الأرقام في جولة
// استعلامات متوازية واحدة، بدل نحو 15 استعلامًا متتاليًا في
// /api/v1/contributor/analytics، مع نسخة دقيقة واحدة لكل مستخدم وفترة
// (لكل نسخة خادم). العقد في shared/contributorPerformance.ts.

import { and, desc, eq, gte, inArray, sql, type AnyColumn } from "drizzle-orm";
import { db } from "../db";
import { articleDailyStats, articles, bookmarks, comments, reactions, socialFollows } from "@shared/schema";
import { editorialState } from "@shared/editorialStates";
import {
  addDays,
  fillSeries,
  isoDay,
  peakDay,
  periodDays,
  snapshotViewDeltas,
  trendPct,
  type ContributorPerformance,
  type PerformancePeriod,
  PERFORMANCE_PERIODS,
} from "@shared/contributorPerformance";
import { withCache } from "../memoryCache";

const USER_TTL_MS = 60_000;
const TOP_LIMIT = 5;

interface OwnedRow {
  id: string;
  title: string;
  slug: string | null;
  status: string;
  reviewStatus: string | null;
  articleType: string | null;
  views: number | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
}

/** أعمدة خفيفة لكل مواد المستخدم، باستعلام لكل عمود ملكية (فهارس منفصلة). */
async function ownedArticles(userId: string, role: "reporter" | "writer"): Promise<OwnedRow[]> {
  const columns = role === "writer"
    ? [articles.authorId, articles.submitterId]
    : [articles.authorId, articles.reporterId, articles.submitterId];
  const batches = await Promise.all(columns.map((column) =>
    db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        status: articles.status,
        reviewStatus: articles.reviewStatus,
        articleType: articles.articleType,
        views: articles.views,
        imageUrl: articles.imageUrl,
        thumbnailUrl: articles.thumbnailUrl,
        publishedAt: articles.publishedAt,
      })
      .from(articles)
      .where(role === "writer" ? and(eq(column, userId), eq(articles.articleType, "opinion")) : eq(column, userId)),
  ));
  const byId = new Map<string, OwnedRow>();
  for (const row of batches.flat() as OwnedRow[]) byId.set(row.id, row);
  return Array.from(byId.values());
}

async function compute(userId: string, role: "reporter" | "writer", period: PerformancePeriod): Promise<ContributorPerformance> {
  const now = new Date();
  const days = periodDays(period);
  const periodStart = days ? addDays(now, -days) : null;
  const seriesDays = days ?? 30;

  const owned = await ownedArticles(userId, role);
  const ids = owned.map((a) => a.id);
  const published = owned.filter((a) => a.status === "published");

  const statusCounts = { published: 0, pending: 0, needsChanges: 0, scheduled: 0, draft: 0 };
  for (const row of owned) {
    const state = editorialState(row);
    if (state === "published") statusCounts.published += 1;
    else if (state === "pending" || state === "approved") statusCounts.pending += 1;
    else if (state === "needs_changes") statusCounts.needsChanges += 1;
    else if (state === "scheduled") statusCounts.scheduled += 1;
    else if (state === "draft") statusCounts.draft += 1;
  }

  const weekStart = addDays(now, -7);
  const lastPublished = published
    .map((a) => a.publishedAt)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const activity = {
    thisWeekCount: published.filter((a) => a.publishedAt && a.publishedAt >= weekStart).length,
    lastPublishedAt: lastPublished ? lastPublished.toISOString() : null,
  };
  const publishedInPeriod = periodStart
    ? published.filter((a) => a.publishedAt && a.publishedAt >= periodStart).length
    : published.length;

  const followersWhere = periodStart
    ? and(eq(socialFollows.followingId, userId), gte(socialFollows.createdAt, periodStart))
    : eq(socialFollows.followingId, userId);

  if (!ids.length) {
    const [followers] = await db.select({ c: sql<number>`count(*)::int` }).from(socialFollows).where(followersWhere);
    const series = fillSeries([], seriesDays, now);
    return {
      role, period, generatedAt: now.toISOString(), views: 0, viewsTrendPct: null, publishedInPeriod: 0,
      series, peak: null, likes: 0, comments: 0, bookmarks: 0, newFollowers: Number(followers?.c) || 0,
      topArticles: [], statusCounts, activity, featuredComment: null,
    };
  }

  // لقطات تراكمية من يوم الأساس: الفترة الحالية + السابقة بنفس الطول للمقارنة.
  const today = isoDay(now);
  const baseDay = isoDay(addDays(now, -(days ? days * 2 : seriesDays)));
  const cut = isoDay(addDays(now, -(seriesDays - 1)));
  const createdSince = (col: AnyColumn) => (periodStart ? gte(col, periodStart) : undefined);
  const recentIds = published
    .filter((a) => !a.publishedAt || isoDay(a.publishedAt) > isoDay(addDays(now, -400)))
    .map((a) => a.id);

  const [snapshotRows, likesRows, commentRows, bookmarkRows, followerRows, featuredRows] = await Promise.all([
    recentIds.length
      ? db
        .select({ articleId: articleDailyStats.articleId, date: articleDailyStats.date, views: articleDailyStats.views })
        .from(articleDailyStats)
        .where(and(inArray(articleDailyStats.articleId, recentIds), gte(articleDailyStats.date, baseDay)))
      : Promise.resolve([] as Array<{ articleId: string; date: string; views: number }>),
    db
      .select({ articleId: reactions.articleId, c: sql<number>`count(*)::int` })
      .from(reactions)
      .where(and(inArray(reactions.articleId, ids), eq(reactions.type, "like"), createdSince(reactions.createdAt)))
      .groupBy(reactions.articleId),
    db
      .select({ articleId: comments.articleId, c: sql<number>`count(*)::int` })
      .from(comments)
      .where(and(inArray(comments.articleId, ids), eq(comments.status, "approved"), createdSince(comments.createdAt)))
      .groupBy(comments.articleId),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(bookmarks)
      .where(and(inArray(bookmarks.articleId, ids), createdSince(bookmarks.createdAt))),
    db.select({ c: sql<number>`count(*)::int` }).from(socialFollows).where(followersWhere),
    db
      .select({ content: comments.content, articleTitle: articles.title })
      .from(comments)
      .innerJoin(articles, eq(comments.articleId, articles.id))
      .where(and(inArray(comments.articleId, ids), eq(comments.status, "approved"), gte(comments.createdAt, addDays(now, -7))))
      .orderBy(desc(comments.createdAt))
      .limit(1),
  ]);

  const deltas = snapshotViewDeltas({
    rows: snapshotRows.map((r) => ({ articleId: r.articleId, date: String(r.date), views: Number(r.views) || 0 })),
    articles: published.map((a) => ({ id: a.id, views: a.views ?? 0, publishedAt: a.publishedAt })),
    baseDay,
    today,
  });
  const series = fillSeries(deltas.filter((d) => d.date >= cut), seriesDays, now);
  const periodViewsBy = new Map<string, number>();
  for (const d of deltas) if (d.date >= cut) periodViewsBy.set(d.articleId, (periodViewsBy.get(d.articleId) ?? 0) + d.views);
  let views: number;
  let viewsTrendPct: number | null = null;
  if (days) {
    views = Array.from(periodViewsBy.values()).reduce((sum, n) => sum + n, 0);
    const previous = deltas.filter((d) => d.date < cut).reduce((sum, d) => sum + d.views, 0);
    viewsTrendPct = trendPct(views, previous);
  } else {
    views = owned.reduce((sum, a) => sum + (a.views ?? 0), 0);
  }

  const likesBy = new Map(likesRows.map((r) => [r.articleId, Number(r.c) || 0]));
  const commentsBy = new Map(commentRows.map((r) => [r.articleId, Number(r.c) || 0]));
  const viewsFor = (a: OwnedRow) => (days ? periodViewsBy.get(a.id) ?? 0 : a.views ?? 0);
  const topArticles = published
    .filter((a) => viewsFor(a) > 0)
    .sort((a, b) => viewsFor(b) - viewsFor(a))
    .slice(0, TOP_LIMIT)
    .map((a) => ({
      id: a.id,
      title: a.title,
      slug: a.slug ?? null,
      imageUrl: a.thumbnailUrl || a.imageUrl || null,
      views: viewsFor(a),
      likes: likesBy.get(a.id) ?? 0,
      comments: commentsBy.get(a.id) ?? 0,
    }));

  const sum = (m: Map<string, number>) => Array.from(m.values()).reduce((s, n) => s + n, 0);
  return {
    role,
    period,
    generatedAt: now.toISOString(),
    views,
    viewsTrendPct,
    publishedInPeriod,
    series,
    peak: peakDay(series),
    likes: sum(likesBy),
    comments: sum(commentsBy),
    bookmarks: Number(bookmarkRows[0]?.c) || 0,
    newFollowers: Number(followerRows[0]?.c) || 0,
    topArticles,
    statusCounts,
    activity,
    featuredComment: featuredRows[0] ? { content: featuredRows[0].content, articleTitle: featuredRows[0].articleTitle } : null,
  };
}

function cachedPerformance(userId: string, role: "reporter" | "writer", period: PerformancePeriod) {
  return withCache(`contributor-performance:${userId}:${role}:${period}`, USER_TTL_MS, async () => {
    const started = Date.now();
    const result = await compute(userId, role, period);
    const ms = Date.now() - started;
    if (ms > 1500) console.warn(`[contributor-performance] slow compute ${ms}ms period=${period} role=${role}`);
    return result;
  });
}

export async function getContributorPerformance(input: { userId: string; role: "reporter" | "writer"; period: PerformancePeriod }) {
  const result = await cachedPerformance(input.userId, input.role, input.period);
  // تبديل الفترة في التطبيق يجد نسخته جاهزة.
  for (const other of PERFORMANCE_PERIODS) {
    if (other !== input.period) void cachedPerformance(input.userId, input.role, other).catch(() => undefined);
  }
  return result;
}

