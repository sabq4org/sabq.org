/**
 * زخم كمي للقصص 0–100 — خلف RADAR_MOMENTUM_ENABLED.
 * لقطات ≤ مرة / 15 دقيقة + معادلة المصادر/الذكر/تفاعل X + احتضار بعد 48س.
 */
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "../../db";
import { radarItems, radarStories, radarStorySnapshots, type RadarStory } from "@shared/schema";
import { isMomentumEnabled } from "./flags";
import { computeMomentumScore } from "./momentumMath";

export { computeMomentumScore, isMomentumEnabled };

const SNAPSHOT_MIN_MS = 15 * 60 * 1000;

function tierAWeight(): number {
  const n = Number(process.env.RADAR_TIER_A_MENTION_WEIGHT ?? 1.5);
  return Number.isFinite(n) && n > 0 ? n : 1.5;
}

function engagementOf(metrics: { likes?: number; retweets?: number; replies?: number; views?: number } | null): number {
  if (!metrics) return 0;
  return (metrics.likes ?? 0) + (metrics.retweets ?? 0) * 2 + (metrics.replies ?? 0) + Math.floor((metrics.views ?? 0) / 100);
}

async function storyMentionStats(storyId: string): Promise<{
  mentionsLastHour: number;
  mentionsPrevHour: number;
  xEngagement: number;
  sourceCount: number;
  lastFetchedAt: Date | null;
}> {
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000);
  const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);

  const items = await db
    .select({
      fetchedAt: radarItems.fetchedAt,
      sourceId: radarItems.sourceId,
      metrics: radarItems.metrics,
    })
    .from(radarItems)
    .where(eq(radarItems.storyId, storyId));

  let mentionsLastHour = 0;
  let mentionsPrevHour = 0;
  let xEngagement = 0;
  const sources = new Set<string>();
  let lastFetchedAt: Date | null = null;

  for (const item of items) {
    sources.add(item.sourceId);
    const t = item.fetchedAt?.getTime() ?? 0;
    if (!lastFetchedAt || (item.fetchedAt && item.fetchedAt > lastFetchedAt)) {
      lastFetchedAt = item.fetchedAt;
    }
    // وزن ذكر من مصدر Tier يُقرَّب لاحقاً عبر weight على المصدر — هنا عدّ بسيط × وزن ENV للذكر
    const weight = 1; // يُحدَّث إن لزم عبر join؛ الإبقاء بسيطاً
    if (item.fetchedAt && item.fetchedAt >= hourAgo) mentionsLastHour += weight;
    else if (item.fetchedAt && item.fetchedAt >= twoHoursAgo) mentionsPrevHour += weight;
    xEngagement += engagementOf(item.metrics);
  }

  // تعزيز طفيف إن تجاوزت المصادر 1 مع وزن Tier A الافتراضي كعامل على الذكر/ساعة
  if (mentionsLastHour > 0) {
    mentionsLastHour = Math.round(mentionsLastHour * Math.min(tierAWeight(), 2));
  }

  return {
    mentionsLastHour,
    mentionsPrevHour,
    xEngagement,
    sourceCount: sources.size || 1,
    lastFetchedAt,
  };
}

async function shouldSnapshot(storyId: string): Promise<boolean> {
  const rows = await db
    .select({ capturedAt: radarStorySnapshots.capturedAt })
    .from(radarStorySnapshots)
    .where(eq(radarStorySnapshots.storyId, storyId))
    .orderBy(desc(radarStorySnapshots.capturedAt))
    .limit(1);
  if (!rows[0]) return true;
  return Date.now() - rows[0].capturedAt.getTime() >= SNAPSHOT_MIN_MS;
}

/** يحدّث momentum_score للقصص النشطة ويلتقط لقطات عند الحاجة */
export async function refreshStoryMomentum(limit = 50): Promise<number> {
  if (!isMomentumEnabled()) return 0;
  const since = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const stories = await db
    .select()
    .from(radarStories)
    .where(and(eq(radarStories.status, "active"), gte(radarStories.lastSeenAt, since)))
    .orderBy(desc(radarStories.lastSeenAt))
    .limit(limit);

  let updated = 0;
  for (const story of stories) {
    const stats = await storyMentionStats(story.id);
    const hoursSince = stats.lastFetchedAt
      ? (Date.now() - stats.lastFetchedAt.getTime()) / (60 * 60 * 1000)
      : 72;
    const { momentumScore } = computeMomentumScore({
      sourceCount: Math.max(stats.sourceCount, story.sourceCount),
      mentionsLastHour: stats.mentionsLastHour,
      mentionsPrevHour: stats.mentionsPrevHour,
      xEngagement: stats.xEngagement,
      hoursSinceLastMention: hoursSince,
    });

    await db
      .update(radarStories)
      .set({
        momentumScore,
        sourceCount: Math.max(stats.sourceCount, story.sourceCount),
      })
      .where(eq(radarStories.id, story.id));

    if (await shouldSnapshot(story.id)) {
      await db.insert(radarStorySnapshots).values({
        storyId: story.id,
        mentionCount: stats.mentionsLastHour,
        sourceCount: Math.max(stats.sourceCount, story.sourceCount),
        xEngagement: stats.xEngagement,
      });
    }
    updated++;
  }
  return updated;
}

export async function refreshMomentumForStories(stories: RadarStory[]): Promise<void> {
  if (!isMomentumEnabled() || !stories.length) return;
  for (const story of stories) {
    const stats = await storyMentionStats(story.id);
    const hoursSince = stats.lastFetchedAt
      ? (Date.now() - stats.lastFetchedAt.getTime()) / (60 * 60 * 1000)
      : 72;
    const { momentumScore } = computeMomentumScore({
      sourceCount: Math.max(stats.sourceCount, story.sourceCount),
      mentionsLastHour: stats.mentionsLastHour,
      mentionsPrevHour: stats.mentionsPrevHour,
      xEngagement: stats.xEngagement,
      hoursSinceLastMention: hoursSince,
    });
    await db
      .update(radarStories)
      .set({ momentumScore, sourceCount: Math.max(stats.sourceCount, story.sourceCount) })
      .where(eq(radarStories.id, story.id));
  }
}
