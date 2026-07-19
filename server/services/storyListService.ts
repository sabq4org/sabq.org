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
import { desc, eq, sql } from "drizzle-orm";

export interface StoryListRootArticle {
  id: string;
  title: string;
  subtitle: string | null;
  slug: string;
  englishSlug: string | null;
  excerpt: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  articleType: string;
  categoryId: string | null;
  publishedAt: Date | null;
}

export type StoryListItem = Story & {
  rootArticle?: StoryListRootArticle;
  articlesCount: number;
  followersCount: number;
};

export async function getActiveStoriesForList(): Promise<StoryListItem[]> {
  const rows = await db
    .select({
      story: stories,
      rootArticle: {
        id: articles.id,
        title: articles.title,
        subtitle: articles.subtitle,
        slug: articles.slug,
        englishSlug: articles.englishSlug,
        excerpt: articles.excerpt,
        imageUrl: articles.imageUrl,
        thumbnailUrl: articles.thumbnailUrl,
        articleType: articles.articleType,
        categoryId: articles.categoryId,
        publishedAt: articles.publishedAt,
      },
    })
    .from(stories)
    .leftJoin(articles, eq(stories.rootArticleId, articles.id))
    .where(eq(stories.status, "active"))
    .orderBy(desc(stories.createdAt));

  const linkCounts = await db
    .select({ storyId: storyLinks.storyId, count: sql<number>`count(*)` })
    .from(storyLinks)
    .groupBy(storyLinks.storyId);
  const followCounts = await db
    .select({ storyId: storyFollows.storyId, count: sql<number>`count(*)` })
    .from(storyFollows)
    .where(eq(storyFollows.isActive, true))
    .groupBy(storyFollows.storyId);

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
