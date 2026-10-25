import { and, asc, eq, gte, isNull, or, sql, getTableColumns } from "drizzle-orm";
import {
  articles,
  breakingTickerHeadlines,
  breakingTickerTopics,
  type BreakingTickerHeadline,
  type BreakingTickerTopic,
} from "@shared/schema";
import { db } from "../db";

/**
 * Breaking-ticker reads (ADR-001: moved out of the frozen storage.ts when
 * fixing the ticker link bug).
 *
 * `linkedArticleSlug` is resolved from the linked article at READ time —
 * the canonical public path segment `englishSlug || slug`, same as the rest
 * of the site — instead of trusting the snapshot stored on the headline,
 * which can be stale (article slug edited later) or wrong (a share short
 * code saved by the #1855 dashboard; /article/<shortCode> 404s). Falls back
 * to the stored value when the article is gone. Row shape is unchanged.
 */
const headlineColumns = {
  ...getTableColumns(breakingTickerHeadlines),
  linkedArticleSlug: sql<string | null>`COALESCE(${articles.englishSlug}, ${articles.slug}, ${breakingTickerHeadlines.linkedArticleSlug})`,
};

export async function getBreakingTickerHeadlines(topicId: string): Promise<BreakingTickerHeadline[]> {
  return db
    .select(headlineColumns)
    .from(breakingTickerHeadlines)
    .leftJoin(articles, eq(articles.id, breakingTickerHeadlines.linkedArticleId))
    .where(eq(breakingTickerHeadlines.topicId, topicId))
    .orderBy(asc(breakingTickerHeadlines.orderIndex));
}

export async function getActiveBreakingTicker(): Promise<{ topic: BreakingTickerTopic; headlines: BreakingTickerHeadline[] } | null> {
  const now = new Date();
  const [activeTopic] = await db
    .select()
    .from(breakingTickerTopics)
    .where(and(
      eq(breakingTickerTopics.isActive, true),
      or(
        isNull(breakingTickerTopics.expiresAt),
        gte(breakingTickerTopics.expiresAt, now)
      )
    ))
    .limit(1);

  if (!activeTopic) return null;

  const headlines = await getBreakingTickerHeadlines(activeTopic.id);
  return { topic: activeTopic, headlines };
}
