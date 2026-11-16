// استعلامات «Moment by Moment» الإنجليزية: نظير /api/live/* العربي (server/routes/liveNews.ts)
// لكن على en_articles + en_categories + en_comments.
import { and, desc, eq, inArray, isNotNull, lt, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { enArticles, enCategories, enComments } from "@shared/schema";
import {
  buildEnLivePage,
  EN_LIVE_BREAKING_LIMIT,
  toEnLiveItem,
  type EnLiveItem,
  type EnLiveRow,
  type EnLiveUpdatesPayload,
} from "./enLiveNewsFormat";

const liveColumns = {
  id: enArticles.id,
  title: enArticles.title,
  slug: enArticles.slug,
  englishSlug: enArticles.englishSlug,
  imageUrl: enArticles.imageUrl,
  imageFocalPoint: enArticles.imageFocalPoint,
  publishedAt: enArticles.publishedAt,
  updatedAt: enArticles.updatedAt,
  newsType: enArticles.newsType,
  categoryId: enArticles.categoryId,
  categoryName: enCategories.name,
  categoryColor: enCategories.color,
  viewsCount: enArticles.views,
  excerpt: enArticles.excerpt,
  content: enArticles.content,
};

/** المنشور الظاهر فقط: نفس شروط العربي (منشور، له تاريخ نشر، غير مخفي من الرئيسية). */
function visibleConditions(): SQL[] {
  return [
    eq(enArticles.status, "published"),
    isNotNull(enArticles.publishedAt),
    eq(enArticles.hideFromHomepage, false),
  ];
}

async function approvedCommentCounts(articleIds: string[]): Promise<Record<string, number>> {
  if (articleIds.length === 0) return {};
  const rows = await db
    .select({ articleId: enComments.articleId, count: sql<number>`count(*)::int` })
    .from(enComments)
    .where(and(inArray(enComments.articleId, articleIds), eq(enComments.status, "approved")))
    .groupBy(enComments.articleId);
  return Object.fromEntries(rows.map((r) => [r.articleId, r.count]));
}

export async function fetchEnLiveUpdates(opts: {
  limit: number;
  cursor?: string;
  filter?: string;
  categoryId?: string;
}): Promise<EnLiveUpdatesPayload> {
  const where = visibleConditions();
  if (opts.filter === "breaking") where.push(eq(enArticles.newsType, "breaking"));
  if (opts.categoryId) where.push(eq(enArticles.categoryId, opts.categoryId));
  if (opts.cursor) where.push(lt(enArticles.publishedAt, new Date(opts.cursor)));

  const rows = (await db
    .select(liveColumns)
    .from(enArticles)
    .leftJoin(enCategories, eq(enArticles.categoryId, enCategories.id))
    .where(and(...where))
    .orderBy(desc(enArticles.publishedAt))
    .limit(opts.limit + 1)) as EnLiveRow[];

  const counts = await approvedCommentCounts(rows.slice(0, opts.limit).map((r) => r.id));
  return buildEnLivePage(rows, opts.limit, counts);
}

export async function fetchEnLiveBreaking(): Promise<{ items: EnLiveItem[] }> {
  const rows = (await db
    .select(liveColumns)
    .from(enArticles)
    .leftJoin(enCategories, eq(enArticles.categoryId, enCategories.id))
    .where(and(eq(enArticles.newsType, "breaking"), ...visibleConditions()))
    .orderBy(desc(enArticles.publishedAt))
    .limit(EN_LIVE_BREAKING_LIMIT)) as EnLiveRow[];

  const counts = await approvedCommentCounts(rows.map((r) => r.id));
  return { items: rows.map((r) => toEnLiveItem(r, counts[r.id] || 0)) };
}
