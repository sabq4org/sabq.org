import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { articles, enArticles } from "@shared/schema";
import { db } from "../db";
import { recordBotEditorAudit } from "./botEditorAudit";
import { assertBotEditorUnlocked } from "./botEditorLocks";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The caller takes the shared editorial breaking lock before locking its target. */
export async function demoteOtherBreaking(tx: Tx, language: "ar" | "en", id: string, reason: string | null) {
  const english: Array<{ id: string; slug: string; englishSlug: string | null }> = [];
  const cleared: Array<{ id: string; slug: string; englishSlug: string | null }> = [];
  if (language === "en") {
    const before = await tx.select().from(enArticles).where(and(ne(enArticles.id, id), eq(enArticles.newsType, "breaking"))).for("update");
    for (const item of before) {
      await assertBotEditorUnlocked(tx, "en", item.id, item);
      const [after] = await tx.update(enArticles).set({ newsType: "regular", updatedAt: new Date() }).where(eq(enArticles.id, item.id)).returning();
      await recordBotEditorAudit(tx, { language: "en", articleId: item.id, actorId: null, operation: "breaking_demoted", originalSource: item.seoMetadata?.source ?? null, before: item, after, updateReason: reason });
      english.push({ id: item.id, slug: item.slug, englishSlug: item.englishSlug });
    }
    return { cleared, english };
  }
  const before = await tx.select().from(articles).where(and(ne(articles.id, id), eq(articles.newsType, "breaking"))).for("update");
  for (const item of before) {
    await assertBotEditorUnlocked(tx, "ar", item.id, item);
    const [after] = await tx.update(articles).set({ newsType: "regular", updatedAt: new Date() }).where(eq(articles.id, item.id)).returning();
    await recordBotEditorAudit(tx, { language: "ar", articleId: item.id, actorId: null, operation: "breaking_demoted", originalSource: item.source, before: item, after, updateReason: reason });
    cleared.push({ id: item.id, slug: item.slug, englishSlug: item.englishSlug });
  }
  if (before.length) {
    const linked = await tx.select().from(enArticles).where(and(eq(enArticles.newsType, "breaking"), inArray(sql`${enArticles.seoMetadata}->>'sourceArticleId'`, before.map((row) => row.id)))).for("update");
    for (const item of linked) {
      await assertBotEditorUnlocked(tx, "en", item.id, item);
      const [after] = await tx.update(enArticles).set({ newsType: "regular", updatedAt: new Date() }).where(eq(enArticles.id, item.id)).returning();
      await recordBotEditorAudit(tx, { language: "en", articleId: item.id, actorId: null, operation: "breaking_demoted", originalSource: item.seoMetadata?.source ?? null, before: item, after, updateReason: reason });
      english.push({ id: item.id, slug: item.slug, englishSlug: item.englishSlug });
    }
  }
  return { cleared, english };
}
