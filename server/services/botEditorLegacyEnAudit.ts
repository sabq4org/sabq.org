import { eq } from "drizzle-orm";
import { enArticles } from "@shared/schema";
import { db } from "../db";
import { recordBotEditorAudit } from "./botEditorAudit";
import type { BotIdentity } from "./botDraftsService";
type EnRow = typeof enArticles.$inferSelect;

export async function legacyEnAuditedWrite(
  bot: BotIdentity, articleId: string, operation: string,
  write: (executor: typeof db) => Promise<EnRow | undefined>,
): Promise<EnRow | undefined> {
  if (bot.name !== "nashr-sabq" || bot.personal) return write(db);
  return db.transaction(async tx => {
    const [before] = await tx.select().from(enArticles).where(eq(enArticles.id, articleId)).limit(1).for("update");
    const after = await write(tx as unknown as typeof db);
    if (before && after) await recordBotEditorAudit(tx, { language: "en", articleId, actorId: null,
      operation, originalSource: before.seoMetadata?.source, before, after });
    return after;
  });
}
