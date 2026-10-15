import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { articles } from "@shared/schema";
import { generateLiteOptimizedImage } from "./imageOptimizationService";

/**
 * Write derived/cache columns (lite image, parsed bullets…) WITHOUT bumping updatedAt.
 * updatedAt is the editor's save version; bumping it from background or reader-triggered
 * work makes the open editor's next save fail with a false ARTICLE_VERSION_CONFLICT.
 */
export async function setArticleDerivedFields(
  articleId: string,
  fields: Partial<Pick<typeof articles.$inferInsert, "liteOptimizedImageUrl" | "aiBullets" | "aiBulletsGeneratedAt">>,
): Promise<void> {
  await db.update(articles).set(fields).where(eq(articles.id, articleId));
}

/** Lite swipe-feed image after publish/update; never throws and never bumps updatedAt. */
export async function refreshArticleLiteImage(articleId: string, imageUrl: string | null | undefined): Promise<void> {
  if (!imageUrl) return;
  try {
    const liteImageUrl = await generateLiteOptimizedImage(imageUrl);
    if (liteImageUrl) {
      await setArticleDerivedFields(articleId, { liteOptimizedImageUrl: liteImageUrl });
      console.log(`[Lite Image] Generated for article: ${articleId}`);
    }
  } catch (liteError) {
    console.error(`[Lite Image] Failed for article ${articleId}:`, liteError);
  }
}

/** 409 body for a rejected guarded write: another user's live lock, else a real version change. */
export async function articleWriteConflict(articleId: string, userId: string) {
  const result = await db.execute(sql`select user_name from article_edit_locks
    where article_id = ${articleId} and user_id <> ${userId}
      and expires_at > (clock_timestamp() at time zone 'UTC') limit 1`);
  const row = (result as unknown as { rows?: Array<{ user_name?: string }> }).rows?.[0];
  if (row) {
    return { code: "ARTICLE_LOCKED", message: `المقال مقفل للتحرير حاليًا لدى ${row.user_name || "محرر آخر"}. احتفظ بمسودتك وأعد المحاولة بعد انتهاء تحريره.` };
  }
  return { code: "ARTICLE_VERSION_CONFLICT", message: "تغير المقال منذ فتحه. احتفظ بمسودتك وأعد تحميل النسخة الحالية قبل الحفظ." };
}
