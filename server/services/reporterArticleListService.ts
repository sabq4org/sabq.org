import { desc, eq, or } from "drizzle-orm";
import { articles } from "@shared/schema";
import { db } from "../db";

export type ReporterListArticle = {
  id: string;
  title: string;
  status: string;
  reviewStatus: string | null;
  reviewNotes: string | null;
  reviewedAt: Date | null;
  views: number | null;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
};

/**
 * قائمة أخبار المراسل وحدها لصفحة «أخباري»، بلا إحصاءات التفاعل.
 * تُطلب أولًا كي تظهر القائمة فورًا، والإحصاءات (/api/reporter/analytics)
 * لا تُطلب إلا عند فتح «أداء أخباري». شرط الملكية نفسه في التحليلات.
 */
export async function listReporterArticles(userId: string): Promise<ReporterListArticle[]> {
  return db
    .select({
      id: articles.id,
      title: articles.title,
      status: articles.status,
      reviewStatus: articles.reviewStatus,
      reviewNotes: articles.reviewNotes,
      reviewedAt: articles.reviewedAt,
      views: articles.views,
      publishedAt: articles.publishedAt,
      scheduledAt: articles.scheduledAt,
      createdAt: articles.createdAt,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .where(or(eq(articles.authorId, userId), eq(articles.reporterId, userId), eq(articles.submitterId, userId)))
    .orderBy(desc(articles.createdAt));
}
