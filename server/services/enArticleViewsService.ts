import { and, eq, sql } from "drizzle-orm";
import { enArticles } from "@shared/schema";
import { db } from "../db";

/** Adds counted views to a published English article. Returns false if no such row. */
export async function addEnArticleViews(articleId: string, increment: number): Promise<boolean> {
  const rows = await db
    .update(enArticles)
    .set({ views: sql`${enArticles.views} + ${increment}` })
    .where(and(eq(enArticles.id, articleId), eq(enArticles.status, "published")))
    .returning({ id: enArticles.id });
  return rows.length > 0;
}
