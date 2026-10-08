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
import { assertRadarEnabled, isRadarDisabledError } from "./runtime";

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
      await assertRadarEnabled();
      const slice = texts.slice(i, i + EMBED_BATCH);
      const res = await aiGateway.embed({
        feature: FEATURE_KEY,
        input: slice,
        timeoutMs: 60_000,
        beforeAttempt: assertRadarEnabled,
      });
      await assertRadarEnabled();
      vectors.push(...res.embeddings);
    }
    return vectors;
  } catch (error) {
    // The gateway wraps a caller gate as terminal FEATURE_DISABLED; confirm
    // the live Radar state before allowing keyword fallback.
    try {
      await assertRadarEnabled();
    } catch (disabled) {
      throw disabled;
    }
    if (isRadarDisabledError(error)) throw error;
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

  const sourceCount = await independentSourceCount(story.id);

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
 * عدد المصادر المستقلة في القصة: وكالة الأصل إن وُجد عزو، وإلا الناشر الفعلي،
 * وإلا المصدر — نسخ ناشر واحد بثماني لغات = مصدر واحد، وعشرة مواقع تنقل
 * رويترز = مصدر واحد. (كان يعدّ source_id = الممر، فتتضخم الأعداد.)
 */
export async function independentSourceCount(storyId: string): Promise<number> {
  const rows = await db
    .select({
      n: sql<number>`count(distinct coalesce(${radarItems.wireOrigin}, ${radarItems.publisherKey}, 'source:' || ${radarItems.sourceId}))::int`,
    })
    .from(radarItems)
    .where(and(eq(radarItems.storyId, storyId), sql`${radarItems.status} <> 'filtered'`));
  return Math.max(Number(rows[0]?.n ?? 1), 1);
}

function nearCopyThreshold(): number {
  const n = Number(process.env.RADAR_NEAR_COPY_THRESHOLD ?? 0.92);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.92;
}

/** ممثل القصة المحلَّل (أعلى قيمة) — أصل تُضمّ إليه النسخ شبه المطابقة */
async function analyzedRepresentative(storyId: string): Promise<RadarItem | null> {
  const rows = await db
    .select()
    .from(radarItems)
    .where(
      and(
        eq(radarItems.storyId, storyId),
        sql`${radarItems.status} in ('analyzed', 'ready', 'exported')`
      )
    )
    .orderBy(desc(radarItems.newsValue))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * قبل التحليل: مادة جديدة انضمت لقصة لها ممثل محلَّل تُضمّ شاهدًا بلا نداء
 * نموذج إذا كانت نسخة شبه مطابقة (تشابه ≥ عتبة النسخ) أو من الناشر/الوكالة
 * نفسها. غير ذلك تبقى new فتُحلَّل كتطور محتمل — لا نبتلع تطورًا جديدًا.
 */
async function maybeMergeCopy(item: RadarItem, storyId: string, similarity: number): Promise<boolean> {
  if (item.status !== "new") return false;
  const rep = await analyzedRepresentative(storyId);
  if (!rep) return false;
  const itemKey = item.wireOrigin || item.publisherKey;
  const sameOrigin = Boolean(itemKey) && itemKey === (rep.wireOrigin || rep.publisherKey);
  if (!sameOrigin && similarity < nearCopyThreshold()) return false;
  await db
    .update(radarItems)
    .set({ status: "merged", duplicateOfId: rep.duplicateOfId ?? rep.id })
    .where(and(eq(radarItems.id, item.id), eq(radarItems.status, "new")));
  return true;
}

/** نسخ مكررة (merged) تتبع قصة أصلها مباشرة بلا تضمين */
async function attachMergedCopies(items: RadarItem[], touched: Set<string>): Promise<RadarItem[]> {
  const rest: RadarItem[] = [];
  const attached = new Set<string>();
  for (const item of items) {
    if (item.status !== "merged" || !item.duplicateOfId) {
      rest.push(item);
      continue;
    }
    const [origin] = await db
      .select({ storyId: radarItems.storyId })
      .from(radarItems)
      .where(eq(radarItems.id, item.duplicateOfId))
      .limit(1);
    if (!origin?.storyId) continue; // الأصل لم يُجمَّع بعد — الجولة التالية
    await db.update(radarItems).set({ storyId: origin.storyId }).where(eq(radarItems.id, item.id));
    attached.add(origin.storyId);
    touched.add(origin.storyId);
  }
  for (const storyId of attached) {
    await db
      .update(radarStories)
      .set({ sourceCount: await independentSourceCount(storyId), lastSeenAt: new Date() })
      .where(eq(radarStories.id, storyId));
  }
  return rest;
}

/**
 * يسند مواد بلا قصة إلى أقرب قصة نشطة أو ينشئ قصة جديدة.
 * يعيد عدد المواد التي رُبطت / أُنشئت لها قصة.
 */
export async function clusterRadarItems(
  items: RadarItem[]
): Promise<{ clustered: number; created: number; merged: number; storyIds: string[] }> {
  const touched = new Set<string>();
  if (!isClusteringEnabled() || !items.length) return { clustered: 0, created: 0, merged: 0, storyIds: [] };
  await assertRadarEnabled();

  const unassigned = items.filter((i) => !i.storyId && i.status !== "filtered");
  const pending = await attachMergedCopies(unassigned, touched);
  if (!pending.length) return { clustered: 0, created: 0, merged: 0, storyIds: [...touched] };

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
  let merged = 0;

  for (let i = 0; i < pending.length; i++) {
    await assertRadarEnabled();
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
      touched.add(best.story.id);
      if (await maybeMergeCopy(item, best.story.id, best.score)) merged++;
      stories[best.idx] = {
        ...stories[best.idx],
        lastSeenAt: new Date(),
        topNewsValue: Math.max(stories[best.idx].topNewsValue ?? 0, item.newsValue ?? 0),
      };
      if (vec) storyVectors[best.idx] = vec;
      clustered++;
    } else {
      const story = await createStory(item, vec);
      touched.add(story.id);
      stories = [story, ...stories];
      storyVectors = [vec, ...storyVectors];
      created++;
      clustered++;
    }
  }

  return { clustered, created, merged, storyIds: [...touched] };
}

/** مواد بلا قصة (حد) — للجولة الدورية */
export async function itemsNeedingClustering(limit: number): Promise<RadarItem[]> {
  return db
    .select()
    .from(radarItems)
    .where(and(isNull(radarItems.storyId), sql`${radarItems.status} not in ('dismissed', 'filtered')`))
    .orderBy(desc(radarItems.fetchedAt))
    .limit(limit);
}
