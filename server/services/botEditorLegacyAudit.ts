import { eq, sql } from "drizzle-orm";
import { articleVersions, articles } from "@shared/schema";
import { changedSnapshotFields, snapshotFromArticle } from "@shared/articleHistory";
import { db } from "../db";
import { recordBotEditorAudit } from "./botEditorAudit";
import type { BotIdentity } from "./botDraftsService";

type Row = typeof articles.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const isLegacyNashr = (bot: BotIdentity) => bot.name === "nashr-sabq" && !bot.personal;

/** Preserve the existing full article-version history while making the event and revision atomic. */
export async function recordLegacyArabicAudit(tx: Tx, before: Row | null, after: Row, operation: string) {
  const afterSnapshot = snapshotFromArticle(after);
  const beforeSnapshot = before ? snapshotFromArticle(before) : null;
  const [version] = await tx.select({ id: articleVersions.id }).from(articleVersions)
    .where(eq(articleVersions.articleId, after.id)).limit(1);
  const insert = async (snapshot: object, action: string, changedFields: string[], createdAt?: Date) => {
    await tx.insert(articleVersions).values({ articleId: after.id,
      versionNumber: sql<number>`(select coalesce(max(${articleVersions.versionNumber}), 0) + 1 from ${articleVersions} where ${articleVersions.articleId} = ${after.id})`,
      action, actorId: null, snapshot: snapshot as Record<string, unknown>, changedFields, ...(createdAt ? { createdAt } : {}) });
  };
  if (before && beforeSnapshot && !version) await insert(beforeSnapshot, "baseline", [], before.updatedAt ?? undefined);
  await insert(afterSnapshot, operation === "created" ? "created" : operation === "published" ? "published" : "updated", changedSnapshotFields(beforeSnapshot, afterSnapshot));
  await recordBotEditorAudit(tx, { language: "ar", articleId: after.id, actorId: null, operation,
    originalSource: before?.source ?? after.source, before: before ?? {}, after });
}

export async function legacyArabicWrite(bot: BotIdentity, articleId: string, operation: string,
  write: (executor: typeof db) => Promise<Row | undefined>): Promise<Row | undefined> {
  if (!isLegacyNashr(bot)) return write(db);
  return db.transaction(async tx => {
    const [before] = await tx.select().from(articles).where(eq(articles.id, articleId)).limit(1).for("update");
    const after = await write(tx as unknown as typeof db);
    if (before && after) await recordLegacyArabicAudit(tx, before, after, operation);
    return after;
  });
}
