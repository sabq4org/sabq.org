import { and, eq, inArray } from "drizzle-orm";
import { enArticles } from "@shared/schema";
import { db } from "../db";

export type EnPermanentDeleteResult =
  | { ok: true; deleted: Array<{ id: string; title: string; slug: string; englishSlug: string | null }> }
  | { ok: false; nonArchivedCount: number };

/**
 * Permanently deletes English articles, archived ones only (same rule as the
 * Arabic bulk-delete-permanent). Comments, bookmarks and reactions go with
 * them through ON DELETE CASCADE. The status check is repeated inside the
 * DELETE so a row restored meanwhile is never removed.
 */
export async function permanentlyDeleteArchivedEnArticles(ids: string[]): Promise<EnPermanentDeleteResult> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: enArticles.id, status: enArticles.status })
      .from(enArticles)
      .where(inArray(enArticles.id, ids));
    const nonArchivedCount = rows.filter((r) => r.status !== "archived").length;
    if (nonArchivedCount > 0) return { ok: false as const, nonArchivedCount };
    const deleted = await tx
      .delete(enArticles)
      .where(and(inArray(enArticles.id, ids), eq(enArticles.status, "archived")))
      .returning({ id: enArticles.id, title: enArticles.title, slug: enArticles.slug, englishSlug: enArticles.englishSlug });
    return { ok: true as const, deleted };
  });
}
