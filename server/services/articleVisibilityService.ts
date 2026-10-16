/**
 * Status lookup for the public unpublished-article guard
 * (`server/routes/unpublishedArticleGuard.ts`). One indexed read per slug,
 * memoized per replica for a few seconds so hot article pages (breaking-news
 * pushes) add no measurable DB load.
 */
import { db } from "../db";
import { articles, enArticles, urArticles } from "@shared/schema";
import { eq, or } from "drizzle-orm";
import type { ArticleVisibilityRow } from "@shared/articleVisibility";

export type ArticleLang = "ar" | "en" | "ur";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Published rows are stable; unpublished or missing rows stay short-lived so a
// scheduled article becomes readable within seconds of going live.
const PUBLISHED_TTL_MS = 60_000;
const OTHER_TTL_MS = 10_000;
const MAX_ENTRIES = 5_000;

const cache = new Map<string, { row: ArticleVisibilityRow | null; expiresAt: number }>();

async function queryRow(lang: ArticleLang, key: string): Promise<ArticleVisibilityRow | null> {
  const isUuid = UUID_RE.test(key);
  if (lang === "en") {
    const [row] = await db
      .select({ status: enArticles.status, authorId: enArticles.authorId, reporterId: enArticles.reporterId })
      .from(enArticles)
      .where(isUuid
        ? or(eq(enArticles.slug, key), eq(enArticles.englishSlug, key), eq(enArticles.id, key))
        : or(eq(enArticles.slug, key), eq(enArticles.englishSlug, key)))
      .limit(1);
    return row ?? null;
  }
  if (lang === "ur") {
    const [row] = await db
      .select({ status: urArticles.status, authorId: urArticles.authorId, reporterId: urArticles.reporterId })
      .from(urArticles)
      .where(isUuid
        ? or(eq(urArticles.slug, key), eq(urArticles.englishSlug, key), eq(urArticles.id, key))
        : or(eq(urArticles.slug, key), eq(urArticles.englishSlug, key)))
      .limit(1);
    return row ?? null;
  }
  const [row] = await db
    .select({
      status: articles.status,
      authorId: articles.authorId,
      reporterId: articles.reporterId,
      submitterId: articles.submitterId,
    })
    .from(articles)
    .where(isUuid
      ? or(eq(articles.slug, key), eq(articles.englishSlug, key), eq(articles.id, key))
      : or(eq(articles.slug, key), eq(articles.englishSlug, key)))
    .limit(1);
  return row ?? null;
}

export async function getArticleVisibilityRow(
  lang: ArticleLang,
  key: string,
): Promise<ArticleVisibilityRow | null> {
  const cacheKey = `${lang}:${key}`;
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > now) return hit.row;

  const row = await queryRow(lang, key);
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(cacheKey, {
    row,
    expiresAt: now + (row?.status === "published" ? PUBLISHED_TTL_MS : OTHER_TTL_MS),
  });
  return row;
}
