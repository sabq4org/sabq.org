import { and, eq, ne } from "drizzle-orm";
import { db } from "../db";
import { articles, enArticles, urArticles } from "@shared/schema";

const MAX_SLUG_LENGTH = 150;

/**
 * Pure helper to construct a slug with a numeric suffix while respecting the max length.
 */
export function formatSlugCandidate(base: string, counter: number, maxLen: number = MAX_SLUG_LENGTH): string {
  const suffix = `-${counter}`;
  const allowedBaseLen = Math.max(1, maxLen - suffix.length);
  const trimmedBase = base.slice(0, allowedBaseLen).replace(/-+$/, "");
  return `${trimmedBase}${suffix}`;
}

export type ArticleTable = typeof articles | typeof enArticles | typeof urArticles;

/**
 * Resolves a unique slug for an article (news, opinion, EN, UR).
 * If the provided slug is already in use by another article, automatically appends
 * an incrementing numeric suffix (-2, -3, ...) while staying within the 150-char constraint.
 *
 * @param candidateSlug The desired slug.
 * @param excludeArticleId Optional article ID to ignore (used during UPDATE/PATCH).
 * @param table The target database table (defaults to `articles`).
 * @returns A unique slug guaranteed not to conflict with another row.
 */
export async function resolveUniqueArticleSlug(
  candidateSlug: string,
  excludeArticleId?: string,
  table: ArticleTable = articles,
): Promise<string> {
  if (!candidateSlug || typeof candidateSlug !== "string") {
    return candidateSlug;
  }

  const initialSlug = candidateSlug.trim().slice(0, MAX_SLUG_LENGTH).replace(/-+$/, "");
  if (!initialSlug) {
    return candidateSlug;
  }

  // 1. Check if the initial slug is already available
  const initialCondition = excludeArticleId
    ? and(eq(table.slug, initialSlug), ne(table.id, excludeArticleId))
    : eq(table.slug, initialSlug);

  const [initialConflict] = await db
    .select({ id: table.id })
    .from(table)
    .where(initialCondition)
    .limit(1);

  if (!initialConflict) {
    return initialSlug;
  }

  // 2. Parse base and starting suffix
  let baseSlug = initialSlug;
  let counter = 2;

  const match = initialSlug.match(/^(.*)-(\d+)$/);
  if (match && match[1]) {
    baseSlug = match[1];
    counter = parseInt(match[2], 10) + 1;
  }

  // 3. Search sequentially for an unused slug
  const MAX_ITERATIONS = 500;
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    const testSlug = formatSlugCandidate(baseSlug, counter, MAX_SLUG_LENGTH);

    const testCondition = excludeArticleId
      ? and(eq(table.slug, testSlug), ne(table.id, excludeArticleId))
      : eq(table.slug, testSlug);

    const [conflict] = await db
      .select({ id: table.id })
      .from(table)
      .where(testCondition)
      .limit(1);

    if (!conflict) {
      return testSlug;
    }

    counter++;
    iteration++;
  }

  // Fallback if thousands of duplicates exist: append current timestamp
  const timestampSuffix = `-${Date.now()}`;
  const fallbackBaseLen = Math.max(1, MAX_SLUG_LENGTH - timestampSuffix.length);
  return `${baseSlug.slice(0, fallbackBaseLen).replace(/-+$/, "")}${timestampSuffix}`;
}
