/**
 * خدمة «إنعاش الخبر»: تعيد الخبر المنشور إلى صدارة الموجز بختم resurfaced_at
 * دون المساس بتاريخ النشر أو المشاهدات أو الرابط — الترتيب العام يعتمد
 * COALESCE(resurfaced_at, published_at) فيبدأ الخبر دورة عرض جديدة.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { articles } from "@shared/schema";

export interface ResurfacedArticle {
  id: string;
  title: string;
  slug: string | null;
  englishSlug: string | null;
  newsType: string | null;
  resurfacedAt: Date | null;
}

/**
 * يختم الخبر بوقت الإنعاش الحالي. يعيد null إذا لم يوجد خبر منشور بهذا المعرف
 * (المسودات والمؤرشف لا تُنعش — الإنعاش إعادة تدوير لخبر حي فقط).
 */
export async function resurfaceArticle(articleId: string): Promise<ResurfacedArticle | null> {
  const [updated] = await db
    .update(articles)
    .set({ resurfacedAt: new Date() })
    .where(and(eq(articles.id, articleId), eq(articles.status, "published")))
    .returning({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      englishSlug: articles.englishSlug,
      newsType: articles.newsType,
      resurfacedAt: articles.resurfacedAt,
    });
  return updated ?? null;
}
