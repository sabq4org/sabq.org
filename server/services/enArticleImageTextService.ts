/**
 * Keeps the editor-written hero caption / alt text (en_articles.seo, see
 * shared/enArticleImageText.ts) when another writer replaces the whole `seo`
 * object — AI SEO generation does exactly that through storage.saveSeoMetadata.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { enArticles } from "@shared/schema";
import { mergeEnHeroImageText } from "@shared/enArticleImageText";

export async function keepEnHeroImageText<T extends object>(
  articleId: string,
  language: "ar" | "en" | "ur",
  nextSeo: T,
): Promise<T> {
  if (language !== "en") return nextSeo;
  const [row] = await db.select({ seo: enArticles.seo }).from(enArticles).where(eq(enArticles.id, articleId)).limit(1);
  return mergeEnHeroImageText(nextSeo, row?.seo);
}
