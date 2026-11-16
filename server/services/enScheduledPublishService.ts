/**
 * Publishes English articles scheduled from the dashboard editor.
 *
 * The scheduled publisher (server/notificationWorker.ts) reads the Arabic
 * `articles` table, and its English hook only takes bot rows
 * (`seoMetadata.source = 'bot'`). An editor who scheduled an English article
 * from /en/dashboard therefore saw it stay "scheduled" forever.
 */
import { and, eq, lte, or, sql, isNull } from "drizzle-orm";
import { enArticles } from "@shared/schema";
import { db } from "../db";
import { logActivity } from "../rbac";
import { clearOtherEnBreakingArticles, isBreakingNewsType } from "./breakingNewsService";
import { queueEnBotDraftSurfaceEffects } from "./enBotDraftPublishEffects";

/** Rows the bot path does not own: no seoMetadata.source, or any value but "bot". */
const notBotRow = or(
  isNull(sql`${enArticles.seoMetadata}->>'source'`),
  sql`${enArticles.seoMetadata}->>'source' <> 'bot'`,
);

export async function publishDueScheduledEnDashboardArticles(now = new Date()): Promise<number> {
  const due = await db
    .select({ id: enArticles.id })
    .from(enArticles)
    .where(and(eq(enArticles.status, "scheduled"), lte(enArticles.scheduledAt, now), notBotRow))
    .limit(5);

  let count = 0;
  for (const { id } of due) {
    try {
      const published = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(enArticles)
          .set({
            status: "published",
            publishType: "instant",
            publishedAt: now,
            updatedAt: now,
            displayOrder: Math.floor(now.getTime() / 1000),
          })
          // Re-check inside the update so an editor who unscheduled meanwhile wins.
          .where(and(eq(enArticles.id, id), eq(enArticles.status, "scheduled"), lte(enArticles.scheduledAt, now), notBotRow))
          .returning();
        if (row && isBreakingNewsType(row.newsType)) await clearOtherEnBreakingArticles(row.id, tx);
        return row;
      });
      if (!published) continue;
      count += 1;
      queueEnBotDraftSurfaceEffects(published, "publish");
      await logActivity({
        userId: published.authorId,
        action: "published",
        entityType: "en_article",
        entityId: published.id,
        newValue: { title: published.title, status: "published", scheduled: true },
      }).catch((error) => console.error("[EnScheduled] activity log failed:", error));
    } catch (error) {
      console.error(`[EnScheduled] publish failed for ${id}:`, error);
    }
  }
  return count;
}
