// إشارات التوزيع لصفوف قائمة الأخبار في اللوحة: هل أُرسل إشعار، وهل نُشر على X.
// استعلام واحد لكل جدول على معرّفات الصفحة الحالية فقط (≤ 30 صفًا).
// Per ADR-001 all Drizzle access lives here.
import { and, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { pushCampaigns, socialPosts } from "@shared/schema";

export type ArticleListSignals = {
  /** آخر إشعار عام خرج للخبر */
  notifiedAt: string | null;
  /** آخر نشر ناجح على X */
  socialPublishedAt: string | null;
};

function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value).includes("T") ? String(value) : `${String(value).replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function getArticleListSignals(articleIds: string[]): Promise<Record<string, ArticleListSignals>> {
  const ids = [...new Set(articleIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (ids.length === 0) return {};

  const [pushRows, socialRows] = await Promise.all([
    db
      .select({
        articleId: pushCampaigns.articleId,
        at: sql<string | null>`max(coalesce(${pushCampaigns.sentAt}, ${pushCampaigns.createdAt}))`,
      })
      .from(pushCampaigns)
      .where(and(inArray(pushCampaigns.articleId, ids), inArray(pushCampaigns.status, ["sending", "sent"])))
      .groupBy(pushCampaigns.articleId),
    db
      .select({
        articleId: socialPosts.articleId,
        at: sql<string | null>`max(${socialPosts.publishedAt})`,
      })
      .from(socialPosts)
      .where(and(inArray(socialPosts.articleId, ids), inArray(socialPosts.status, ["published"])))
      .groupBy(socialPosts.articleId),
  ]);

  const result: Record<string, ArticleListSignals> = {};
  const slot = (id: string) => (result[id] ??= { notifiedAt: null, socialPublishedAt: null });
  for (const row of pushRows) if (row.articleId) slot(row.articleId).notifiedAt = toIso(row.at);
  for (const row of socialRows) if (row.articleId) slot(row.articleId).socialPublishedAt = toIso(row.at);
  return result;
}
