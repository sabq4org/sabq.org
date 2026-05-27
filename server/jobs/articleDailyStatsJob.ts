import cron from "node-cron";
import { db } from "../db";
import { articles, articleDailyStats, reactions, comments, bookmarks } from "@shared/schema";
import { eq, and, gte, lt, sql, count } from "drizzle-orm";

let isRunning = false;

export async function aggregateArticleDailyStats() {
  if (isRunning) {
    console.log("[ArticleDailyStats] ⏭️ Skipping - already running");
    return;
  }

  isRunning = true;
  try {
    console.log("[ArticleDailyStats] 🔄 Starting daily aggregation...");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const publishedArticles = await db
      .select({ id: articles.id, views: articles.views })
      .from(articles)
      .where(eq(articles.status, "published"));

    let upserted = 0;

    for (const article of publishedArticles) {
      const [likesResult] = await db
        .select({ c: count() })
        .from(reactions)
        .where(
          and(
            eq(reactions.articleId, article.id),
            gte(reactions.createdAt, today),
            lt(reactions.createdAt, tomorrow),
          ),
        );

      const [commentsResult] = await db
        .select({ c: count() })
        .from(comments)
        .where(
          and(
            eq(comments.articleId, article.id),
            gte(comments.createdAt, today),
            lt(comments.createdAt, tomorrow),
          ),
        );

      const [bookmarksResult] = await db
        .select({ c: count() })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.articleId, article.id),
            gte(bookmarks.createdAt, today),
            lt(bookmarks.createdAt, tomorrow),
          ),
        );

      await db
        .insert(articleDailyStats)
        .values({
          articleId: article.id,
          date: todayStr,
          views: article.views ?? 0,
          likes: Number(likesResult.c),
          comments: Number(commentsResult.c),
          bookmarks: Number(bookmarksResult.c),
        })
        .onConflictDoUpdate({
          target: [articleDailyStats.articleId, articleDailyStats.date],
          set: {
            views: article.views ?? 0,
            likes: Number(likesResult.c),
            comments: Number(commentsResult.c),
            bookmarks: Number(bookmarksResult.c),
          },
        });

      upserted++;
    }

    console.log(
      `[ArticleDailyStats] ✅ Aggregated ${upserted} articles for ${todayStr}`,
    );
  } catch (error) {
    console.error("[ArticleDailyStats] ❌ Error:", error);
  } finally {
    isRunning = false;
  }
}

export function startArticleDailyStatsJob() {
  // Run at 00:05 every day
  const job = cron.schedule("5 0 * * *", async () => {
    await aggregateArticleDailyStats();
  });

  console.log("[ArticleDailyStats] ⏰ Job scheduled (every day at 00:05)");
  return job;
}
