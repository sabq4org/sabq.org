/**
 * SEO helpers for the English (and Urdu) article tables.
 *
 * `seoMetadata` on en_articles is not only SEO bookkeeping: it also carries
 * `sourceArticleId`, the link to the Arabic original that hreflang, breaking
 * sync and the auto-translate de-duplication read. Generating SEO used to
 * replace the whole object, which silently cut that link.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { articles, enArticles, urArticles } from "@shared/schema";
import { mergeSeoMetadata } from "./seoGenerateRequest";

type Lang = "ar" | "en" | "ur";
const tableFor = (language: Lang) =>
  language === "ar" ? articles : language === "en" ? enArticles : urArticles;

/** Reads the row's current seoMetadata and merges the new values over it. */
export async function withExistingSeoMetadata<T extends Record<string, unknown>>(
  articleId: string,
  language: Lang,
  next: T,
): Promise<T> {
  const table = tableFor(language);
  const [row] = await db
    .select({ seoMetadata: table.seoMetadata })
    .from(table)
    .where(eq(table.id, articleId))
    .limit(1);
  return mergeSeoMetadata(row?.seoMetadata, next) as T;
}

export async function getEnArticleForSeoAnalysis(id: string) {
  const [row] = await db
    .select({
      id: enArticles.id,
      title: enArticles.title,
      content: enArticles.content,
      excerpt: enArticles.excerpt,
      seo: enArticles.seo,
    })
    .from(enArticles)
    .where(eq(enArticles.id, id))
    .limit(1);
  return row;
}

export async function applyEnSeoAnalysis(
  id: string,
  currentSeo: unknown,
  analysis: { seoTitle: string; metaDescription: string; keywords: string[] },
): Promise<void> {
  const seo =
    currentSeo && typeof currentSeo === "object" ? (currentSeo as Record<string, unknown>) : {};
  await db
    .update(enArticles)
    .set({
      seo: {
        ...seo,
        metaTitle: analysis.seoTitle,
        metaDescription: analysis.metaDescription,
        keywords: analysis.keywords,
      } as any,
    })
    .where(eq(enArticles.id, id));
}
