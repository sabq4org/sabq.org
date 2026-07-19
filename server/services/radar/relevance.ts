/**
 * صلة سعودية على القصص — خلف RADAR_RELEVANCE_ENABLED.
 */
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "../../db";
import { radarItems, radarSources, radarStories, type RadarStory } from "@shared/schema";
import { isRelevanceEnabled } from "./flags";
import { scoreSaudiRelevance } from "./relevanceScore";
import { normalizeText } from "./textNormalize";

export { isRelevanceEnabled, scoreSaudiRelevance };

async function activeTrendNames(): Promise<string[]> {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const rows = await db
    .select({ title: radarItems.originalTitle, translated: radarItems.translatedTitle })
    .from(radarItems)
    .innerJoin(radarSources, eq(radarItems.sourceId, radarSources.id))
    .where(and(eq(radarSources.xType, "trend"), gte(radarItems.fetchedAt, since)))
    .orderBy(desc(radarItems.fetchedAt))
    .limit(40);
  return rows.map((r) => normalizeText(r.translated || r.title || "")).filter(Boolean);
}

/** إعادة حساب الصلة لقصص نشطة (حد) */
export async function refreshStoryRelevance(limit = 40): Promise<number> {
  if (!isRelevanceEnabled()) return 0;
  const since = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const stories = await db
    .select()
    .from(radarStories)
    .where(and(eq(radarStories.status, "active"), gte(radarStories.lastSeenAt, since)))
    .orderBy(desc(radarStories.lastSeenAt))
    .limit(limit);

  const trends = await activeTrendNames();
  let updated = 0;

  for (const story of stories) {
    const items = await db
      .select()
      .from(radarItems)
      .where(eq(radarItems.storyId, story.id))
      .orderBy(desc(radarItems.newsValue))
      .limit(5);

    const title = story.title;
    const body = [story.summary, ...items.map((i) => i.translatedSummary || i.originalExcerpt || "")]
      .filter(Boolean)
      .join("\n");
    const categorySlug = items.find((i) => i.suggestedCategorySlug)?.suggestedCategorySlug;
    const normTitle = normalizeText(title);
    const inSaudiTrend = trends.some((t) => t && (normTitle.includes(t) || t.includes(normTitle.slice(0, 40))));

    const { score } = scoreSaudiRelevance({ title, body, categorySlug, inSaudiTrend });
    await db.update(radarStories).set({ saudiRelevance: score }).where(eq(radarStories.id, story.id));
    if (score !== story.saudiRelevance) updated++;
  }
  return updated;
}

export async function refreshRelevanceForStories(stories: RadarStory[]): Promise<void> {
  if (!isRelevanceEnabled() || !stories.length) return;
  const trends = await activeTrendNames();
  for (const story of stories) {
    const items = await db.select().from(radarItems).where(eq(radarItems.storyId, story.id)).limit(5);
    const body = [story.summary, ...items.map((i) => i.translatedSummary || i.originalExcerpt || "")].join("\n");
    const { score } = scoreSaudiRelevance({
      title: story.title,
      body,
      categorySlug: items.find((i) => i.suggestedCategorySlug)?.suggestedCategorySlug,
      inSaudiTrend: trends.some((t) => normalizeText(story.title).includes(t)),
    });
    await db.update(radarStories).set({ saudiRelevance: score }).where(eq(radarStories.id, story.id));
  }
}
