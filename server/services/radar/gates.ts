/**
 * بوابات ما بعد التحليل — تطبّق قرارات triage.ts النقية على الصفوف:
 * العاجل المؤقت (breakingUntil)، محاور الدليل/الحداثة/الأولوية، والمسار.
 * تُستدعى بعد التجميع (لتوفر عدد المصادر المستقلة) وعند تغيّر تأييد قصة.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { radarItems, radarStories, type RadarItem } from "@shared/schema";
import { countIndependentSources, decideBreaking, scoreItem } from "./triage";

const ARABIC = /[؀-ۿ]/;

async function independentSourcesFor(items: RadarItem[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const storyIds = Array.from(new Set(items.map((i) => i.storyId).filter((id): id is string => Boolean(id))));
  const storyCounts = new Map<string, number>();
  if (storyIds.length) {
    const rows = await db
      .select({ id: radarStories.id, n: radarStories.sourceCount })
      .from(radarStories)
      .where(inArray(radarStories.id, storyIds));
    for (const row of rows) storyCounts.set(row.id, row.n);
  }
  // بلا قصة (التجميع معطل): المادة + نسخها المضمومة
  const loose = items.filter((i) => !i.storyId || !storyCounts.has(i.storyId));
  const copies = loose.length
    ? await db
        .select({
          duplicateOfId: radarItems.duplicateOfId,
          sourceId: radarItems.sourceId,
          publisherKey: radarItems.publisherKey,
          wireOrigin: radarItems.wireOrigin,
        })
        .from(radarItems)
        .where(inArray(radarItems.duplicateOfId, loose.map((i) => i.id)))
    : [];
  for (const item of items) {
    if (item.storyId && storyCounts.has(item.storyId)) {
      result.set(item.id, Math.max(1, storyCounts.get(item.storyId)!));
    } else {
      result.set(item.id, countIndependentSources([item, ...copies.filter((c) => c.duplicateOfId === item.id)]));
    }
  }
  return result;
}

/** يطبّق البوابات على مواد محلَّلة ويعيد الصفوف المحدّثة */
export async function applyGates(items: RadarItem[], now: Date = new Date()): Promise<RadarItem[]> {
  const analyzed = items.filter((i) => i.analyzedAt && (i.status === "analyzed" || i.status === "ready"));
  if (!analyzed.length) return [];
  const sources = await independentSourcesFor(analyzed);
  const updated: RadarItem[] = [];

  for (const item of analyzed) {
    const signals = {
      now,
      publishedAt: item.publishedAt,
      fetchedAt: item.fetchedAt,
      qualityFlags: item.qualityFlags,
      publisherType: item.publisherType,
      textBasis: item.textBasis,
      independentSources: sources.get(item.id) ?? 1,
      newsValue: item.newsValue ?? 0,
      eventTiming: item.eventTiming,
      contentType: item.contentType,
      breakingRequested: item.scoreBreakdown?.breakingRequested === true,
    };
    const breaking = decideBreaking(signals);
    const scores = scoreItem(signals);
    const [row] = await db
      .update(radarItems)
      .set({
        isBreaking: breaking.isBreaking,
        breakingUntil: breaking.breakingUntil,
        evidenceScore: scores.evidenceScore,
        freshnessScore: scores.freshnessScore,
        priorityScore: scores.priorityScore,
        lane: scores.lane,
        scoreBreakdown: { ...(item.scoreBreakdown ?? {}), breakingDeniedBy: breaking.deniedBy },
      })
      .where(eq(radarItems.id, item.id))
      .returning();
    if (row) updated.push(row);
  }

  await refreshStoryTitles(updated);
  return updated;
}

/**
 * القصص تُنشأ قبل التحليل بعنوان المادة الأصلي (قد يكون أجنبيًا) —
 * بعد التحليل يصبح عنوانها العربي من أعلى مادة قيمة.
 */
async function refreshStoryTitles(items: RadarItem[]): Promise<void> {
  const best = new Map<string, RadarItem>();
  for (const item of items) {
    if (!item.storyId || !item.translatedTitle) continue;
    const current = best.get(item.storyId);
    if (!current || (item.newsValue ?? 0) > (current.newsValue ?? 0)) best.set(item.storyId, item);
  }
  for (const [storyId, item] of best) {
    await db
      .update(radarStories)
      .set({
        title: item.translatedTitle!.substring(0, 500),
        ...(item.translatedSummary
          ? { summary: sql`coalesce(${radarStories.summary}, ${item.translatedSummary})` }
          : {}),
        topNewsValue: sql`greatest(${radarStories.topNewsValue}, ${item.newsValue ?? 0})`,
      })
      .where(
        and(
          eq(radarStories.id, storyId),
          sql`(${radarStories.title} !~ ${ARABIC.source} OR ${radarStories.topNewsValue} <= ${item.newsValue ?? 0})`
        )
      );
  }
}

/** إعادة البوابات لمواد قصص تغيّر تأييدها (مصدر مستقل ثانٍ قد يرفع العاجل) */
export async function regateStories(storyIds: string[], now: Date = new Date()): Promise<number> {
  if (!storyIds.length) return 0;
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const items = await db
    .select()
    .from(radarItems)
    .where(
      and(
        inArray(radarItems.storyId, storyIds),
        inArray(radarItems.status, ["analyzed", "ready"]),
        sql`${radarItems.fetchedAt} >= ${since}`
      )
    );
  return (await applyGates(items, now)).length;
}
