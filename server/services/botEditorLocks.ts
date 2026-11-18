import { and, eq, sql } from "drizzle-orm";
import { articleEditLocks } from "@shared/schema";
import { draftLockBlocksUser } from "@shared/draftLock";
import { enArticleEditLocks } from "./enArticleEditLocksSchema";
import { BotDraftError } from "./botDraftsService";

// The caller must already hold FOR UPDATE on the parent article in this transaction.
export async function assertBotEditorUnlocked(tx: any, language: "ar" | "en", id: string, row: any): Promise<void> {
  if (language === "ar" && draftLockBlocksUser(row, null)) {
    throw new BotDraftError(409, "locked_by_editor", "المسودة مقفلة لدى محرر");
  }
  const table = language === "ar" ? articleEditLocks : enArticleEditLocks;
  const [lock] = await tx.select().from(table).where(and(eq(table.articleId, id),
    sql`${table.expiresAt} > (clock_timestamp() at time zone 'UTC')`)).limit(1);
  if (lock) throw new BotDraftError(409, "locked_by_editor", "محرر يعمل على المادة الآن", { editor: lock.userName });
}
