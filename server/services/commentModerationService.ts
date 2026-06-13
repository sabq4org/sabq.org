/**
 * Unified moderation list for /api/admin/comments — merges article/opinion
 * comments (shared `comments` table) with Muqtarab topic comments
 * (`topic_comments`) behind one paginated, source-filterable view.
 *
 * Over-fetch + merge + slice: the global top (offset+limit) rows are guaranteed
 * to sit within the top (offset+limit) of EACH table, so we fetch that many
 * from each, merge by createdAt and slice. Cheap for the shallow pages
 * moderation actually uses (capped at 2000 to bound deep paging).
 */
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db } from "../db";
import { comments, articles, users } from "@shared/schema";
import { adminListTopicComments, adminCountTopicComments } from "./topicCommentsService";

export type CommentSource = "news" | "opinion" | "muqtarab" | "all";

export async function getUnifiedAdminComments(opts: {
  status?: string;
  search?: string;
  source?: string;
  page: number;
  limit: number;
}) {
  const { status, search } = opts;
  const source = opts.source || "all";
  const pageNum = Math.max(1, opts.page || 1);
  const lim = Math.max(1, opts.limit || 20);
  const offset = (pageNum - 1) * lim;
  const fetchN = Math.min(offset + lim, 2000);

  const wantArticles = source === "all" || source === "news" || source === "opinion";
  const wantTopics = source === "all" || source === "muqtarab";

  // ---- article + opinion comments ----
  let articleItems: any[] = [];
  let articleTotal = 0;
  if (wantArticles) {
    const conds: any[] = [];
    if (status && status !== "all") conds.push(eq(comments.status, status));
    if (search) conds.push(ilike(comments.content, `%${search}%`));
    if (source === "opinion") conds.push(eq(articles.articleType, "opinion"));
    if (source === "news")
      conds.push(sql`(${articles.articleType} is null or ${articles.articleType} <> 'opinion')`);
    const whereClause = conds.length ? and(...conds) : undefined;

    const rows = await db
      .select({
        id: comments.id,
        articleId: comments.articleId,
        topicId: sql<string | null>`null`,
        userId: comments.userId,
        content: comments.content,
        status: comments.status,
        parentId: comments.parentId,
        moderatedBy: comments.moderatedBy,
        moderatedAt: comments.moderatedAt,
        moderationReason: comments.moderationReason,
        currentSentiment: comments.currentSentiment,
        aiClassification: comments.aiClassification,
        aiDetectedIssues: comments.aiDetectedIssues,
        aiModerationReason: comments.aiModerationReason,
        createdAt: comments.createdAt,
        articleTitle: articles.title,
        articleSlug: articles.slug,
        articleType: articles.articleType,
        userName: users.firstName,
        userLastName: users.lastName,
        userEmail: users.email,
      })
      .from(comments)
      .leftJoin(articles, eq(comments.articleId, articles.id))
      .leftJoin(users, eq(comments.userId, users.id))
      .where(whereClause as any)
      .orderBy(desc(comments.createdAt))
      .limit(fetchN);

    articleItems = rows.map((r) => {
      const isOpinion = r.articleType === "opinion";
      return {
        ...r,
        source: isOpinion ? "opinion" : "news",
        targetTitle: r.articleTitle,
        targetUrl: r.articleSlug
          ? isOpinion
            ? `/opinion/${r.articleSlug}`
            : `/article/${r.articleSlug}`
          : null,
      };
    });

    const [cnt] = await db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .leftJoin(articles, eq(comments.articleId, articles.id))
      .where(whereClause as any);
    articleTotal = Number(cnt?.count) || 0;
  }

  // ---- muqtarab topic comments ----
  let topicItems: any[] = [];
  let topicTotal = 0;
  if (wantTopics) {
    const rows = await adminListTopicComments({ status, search, limit: fetchN, offset: 0 });
    topicItems = rows.map((r) => ({
      id: r.id,
      articleId: r.topicId,
      topicId: r.topicId,
      userId: r.userId,
      content: r.content,
      status: r.status,
      parentId: r.parentId,
      moderatedBy: r.moderatedBy,
      moderatedAt: r.moderatedAt,
      moderationReason: r.moderationReason,
      currentSentiment: r.currentSentiment,
      aiClassification: r.aiClassification,
      aiDetectedIssues: r.aiDetectedIssues,
      aiModerationReason: r.aiModerationReason,
      createdAt: r.createdAt,
      articleTitle: r.topicTitle,
      articleSlug: r.topicSlug,
      articleType: "muqtarab",
      userName: r.userName,
      userLastName: r.userLastName,
      userEmail: r.userEmail,
      source: "muqtarab",
      targetTitle: r.topicTitle,
      targetUrl: r.angleSlug && r.topicSlug ? `/muqtarab/${r.angleSlug}/topic/${r.topicSlug}` : null,
    }));
    topicTotal = await adminCountTopicComments({ status, search });
  }

  const merged = [...articleItems, ...topicItems].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const pageItems = merged.slice(offset, offset + lim);
  const total = articleTotal + topicTotal;

  return {
    comments: pageItems,
    total,
    page: pageNum,
    limit: lim,
    totalPages: Math.ceil(total / lim),
  };
}
