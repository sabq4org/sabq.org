/**
 * تجميع مواد الرادار في قصص (radar_stories) — خلف RADAR_CLUSTERING_ENABLED.
 * متجهات عبر ai-hub (radar-clustering) مع سقوط لتطابق الكلمات ≥ 0.7.
 */
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { radarItems, radarStories, type RadarItem, type RadarStory } from "@shared/schema";
import { aiGateway } from "../../ai/gateway";
import { cosineSimilarity } from "../../embeddingsService";
import { clusterThreshold, isClusteringEnabled } from "./flags";
import { keywordContainment, topicFingerprintFor } from "./textNormalize";

export { isClusteringEnabled, clusterThreshold };

const FEATURE_KEY = "radar-clustering";
const ACTIVE_HOURS = 72;
const EMBED_BATCH = 50;

function itemTitle(item: RadarItem): string {
  return (item.translatedTitle || item.originalTitle || "").trim();
}

function itemText(item: RadarItem): string {
  const title = itemTitle(item);
  const body = item.translatedSummary || item.originalExcerpt || "";
  return `${title}\n${body}`.trim();
}

async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!texts.length) return [];
  try {
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const slice = texts.slice(i, i + EMBED_BATCH);
      const res = await aiGateway.embed({ feature: FEATURE_KEY, input: slice, timeoutMs: 60_000 });
      vectors.push(...res.embeddings);
    }
    return vectors;
  } catch (error) {
    console.warn(
      "[RadarCluster] embeddings unavailable — keyword fallback:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

async function loadActiveStories(): Promise<RadarStory[]> {
  const since = new Date(Date.now() - ACTIVE_HOURS * 60 * 60 * 1000);
  return db
    .select()
    .from(radarStories)
    .where(and(eq(radarStories.status, "active"), gte(radarStories.lastSeenAt, since)))
    .orderBy(desc(radarStories.lastSeenAt))
    .limit(200);
}

async function createStory(item: RadarItem, embedding: number[] | null): Promise<RadarStory> {
  const title = itemTitle(item) || item.originalTitle;
  const [row] = await db
    .insert(radarStories)
    .values({
      fingerprint: topicFingerprintFor(title),
      title: title.substring(0, 500),
      summary: item.translatedSummary || item.originalExcerpt || null,
      status: "active",
      sourceCount: 1,
      topNewsValue: item.newsValue ?? 0,
      saudiRelevance: 0,
      momentumScore: 0,
      embedding: embedding ?? null,
      firstSeenAt: item.fetchedAt ?? new Date(),
      lastSeenAt: new Date(),
    })
    .returning();
  await db.update(radarItems).set({ storyId: row.id }).where(eq(radarItems.id, item.id));
  return row;
}

async function joinStory(story: RadarStory, item: RadarItem, embedding: number[] | null): Promise<void> {
  const newsValue = item.newsValue ?? 0;
  const title = itemTitle(item);
  const betterTitle = newsValue >= (story.topNewsValue ?? 0) && title ? title.substring(0, 500) : story.title;

  await db.update(radarItems).set({ storyId: story.id }).where(eq(radarItems.id, item.id));

  const distinctSources = await db
    .select({ n: sql<number>`count(distinct ${radarItems.sourceId})::int` })
    .from(radarItems)
    .where(eq(radarItems.storyId, story.id));
  const sourceCount = Math.max(Number(distinctSources[0]?.n ?? 1), 1);

  await db
    .update(radarStories)
    .set({
      title: betterTitle,
      sourceCount,
      topNewsValue: Math.max(story.topNewsValue ?? 0, newsValue),
      lastSeenAt: new Date(),
      embedding: embedding ?? story.embedding ?? null,
      fingerprint: topicFingerprintFor(betterTitle),
      summary: story.summary || item.translatedSummary || item.originalExcerpt || null,
    })
    .where(eq(radarStories.id, story.id));
}

/**
 * يسند مواد بلا قصة إلى أقرب قصة نشطة أو ينشئ قصة جديدة.
 * يعيد عدد المواد التي رُبطت / أُنشئت لها قصة.
 */
export async function clusterRadarItems(items: RadarItem[]): Promise<{ clustered: number; created: number }> {
  if (!isClusteringEnabled() || !items.length) return { clustered: 0, created: 0 };

  const pending = items.filter((i) => !i.storyId);
  if (!pending.length) return { clustered: 0, created: 0 };

  let stories = await loadActiveStories();
  const itemVectors = await embedTexts(pending.map(itemText));
  let storyVectors: (number[] | null)[] = stories.map((s) =>
    Array.isArray(s.embedding) && s.embedding.length ? s.embedding : null
  );

  // تضمين قصص بلا متجه مخزّن
  const needEmbedIdx = stories
    .map((s, idx) => (!storyVectors[idx] ? idx : -1))
    .filter((idx) => idx >= 0);
  if (needEmbedIdx.length && itemVectors) {
    const fresh = await embedTexts(needEmbedIdx.map((idx) => stories[idx].title));
    if (fresh) {
      for (let k = 0; k < needEmbedIdx.length; k++) {
        const idx = needEmbedIdx[k];
        storyVectors[idx] = fresh[k] ?? null;
        if (fresh[k]) {
          await db
            .update(radarStories)
            .set({ embedding: fresh[k] })
            .where(eq(radarStories.id, stories[idx].id));
        }
      }
    }
  }

  const threshold = clusterThreshold();
  let clustered = 0;
  let created = 0;

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    const vec = itemVectors?.[i] ?? null;
    let best: { story: RadarStory; score: number; idx: number } | null = null;

    for (let j = 0; j < stories.length; j++) {
      const story = stories[j];
      let score = 0;
      if (vec && storyVectors[j]) {
        score = cosineSimilarity(vec, storyVectors[j]!);
      } else {
        score = keywordContainment(itemTitle(item), story.title);
        // عتبة الكلمات أخف قليلاً من المتجهات (0.7 حسب الخطة)
        if (score < 0.7) continue;
        if (!best || score > best.score) best = { story, score, idx: j };
        continue;
      }
      if (score >= threshold && (!best || score > best.score)) {
        best = { story, score, idx: j };
      }
    }

    const matchedViaEmbedding = Boolean(best && vec && storyVectors[best.idx]);
    const matchOk =
      best &&
      (matchedViaEmbedding ? best.score >= threshold : best.score >= 0.7);

    if (matchOk && best) {
      await joinStory(best.story, item, vec);
      stories[best.idx] = {
        ...stories[best.idx],
        lastSeenAt: new Date(),
        topNewsValue: Math.max(stories[best.idx].topNewsValue ?? 0, item.newsValue ?? 0),
      };
      if (vec) storyVectors[best.idx] = vec;
      clustered++;
    } else {
      const story = await createStory(item, vec);
      stories = [story, ...stories];
      storyVectors = [vec, ...storyVectors];
      created++;
      clustered++;
    }
  }

  return { clustered, created };
}

/** مواد بلا قصة (حد) — للجولة الدورية */
export async function itemsNeedingClustering(limit: number): Promise<RadarItem[]> {
  return db
    .select()
    .from(radarItems)
    .where(and(isNull(radarItems.storyId), sql`${radarItems.status} <> 'dismissed'`))
    .orderBy(desc(radarItems.fetchedAt))
    .limit(limit);
}
