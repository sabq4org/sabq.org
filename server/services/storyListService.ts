/**
 * Story list service — the slim query behind GET /api/stories.
 *
 * The legacy storage.getAllStories() joined every active story with the FULL
 * articles row (content HTML included) and fired two count queries per story
 * via Promise.all. At 1,007 active stories that meant an 8.2 MB JSON response
 * plus ~2,014 pool-churning queries per request, and the serialization alone
 * blocked the event loop long enough to degrade every other endpoint
 * (site-wide slowdown, 2026-07-14). This service returns only the fields a
 * story list can render and resolves all counts in two GROUP BY queries.
 */
import { db } from "../db";
import { articles, stories, storyFollows, storyLinks } from "@shared/schema";
import type { Story } from "@shared/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

export const DEFAULT_STORIES_LIMIT = 30;
export const MAX_STORIES_LIMIT = 100;

export interface StoryListOptions {
  limit?: number;
  offset?: number;
}

export interface StoryListRootArticle {
  id: string;
  slug: string;
  title: string;
  imageUrl: string | null;
}

export type StoryListItem = Story & {
  rootArticle?: StoryListRootArticle;
  articlesCount: number;
  followersCount: number;
};

export async function getActiveStoriesForList(
  options: StoryListOptions = {},
): Promise<StoryListItem[]> {
  const rawLimit = options.limit ?? DEFAULT_STORIES_LIMIT;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.trunc(rawLimit), MAX_STORIES_LIMIT)
      : DEFAULT_STORIES_LIMIT;
  const rawOffset = options.offset ?? 0;
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.trunc(rawOffset) : 0;

  const rows = await db
    .select({
      story: stories,
      rootArticle: {
        id: articles.id,
        slug: articles.slug,
        title: articles.title,
        imageUrl: articles.imageUrl,
      },
    })
    .from(stories)
    .leftJoin(articles, eq(stories.rootArticleId, articles.id))
    .where(eq(stories.status, "active"))
    .orderBy(desc(stories.createdAt))
    .limit(limit)
    .offset(offset);

  if (rows.length === 0) {
    return [];
  }

  const storyIds = rows.map((r) => r.story.id);
  const [linkCounts, followCounts] = await Promise.all([
    db
      .select({ storyId: storyLinks.storyId, count: sql<number>`count(*)` })
      .from(storyLinks)
      .where(inArray(storyLinks.storyId, storyIds))
      .groupBy(storyLinks.storyId),
    db
      .select({ storyId: storyFollows.storyId, count: sql<number>`count(*)` })
      .from(storyFollows)
      .where(and(eq(storyFollows.isActive, true), inArray(storyFollows.storyId, storyIds)))
      .groupBy(storyFollows.storyId),
  ]);

  const linksByStory = new Map(linkCounts.map((r) => [r.storyId, Number(r.count)]));
  const followsByStory = new Map(followCounts.map((r) => [r.storyId, Number(r.count)]));

  return rows.map((row) => ({
    ...row.story,
    // leftJoin miss → drizzle returns an all-null object, not null
    rootArticle: row.rootArticle?.id ? (row.rootArticle as StoryListRootArticle) : undefined,
    articlesCount: linksByStory.get(row.story.id) ?? 0,
    followersCount: followsByStory.get(row.story.id) ?? 0,
  }));
}
