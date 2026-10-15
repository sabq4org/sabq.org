/**
 * دورة الرادار — الأوركسترا التي يستدعيها الـ cron كل دقيقة:
 * 1) جلب المصادر التي حان موعدها + فرز حتمي عند الإدراج (triage.ts):
 *    البيانات الصحفية والتواريخ المستحيلة → filtered، والنسخ المكررة → merged.
 * 2) تجميع القصص قبل التحليل — النسخ شبه المطابقة لا تُحلَّل.
 * 3) تحليل ما تبقى (قيمة + ترجمة + توقيت الحدث) ضمن سقف يومي، ثم البوابات:
 *    عاجل مؤقت بشروط مجتمعة، ومحاور دليل/حداثة/أولوية منفصلة (gates.ts).
 * 4) تقييم قواعد التنبيه على ما حُلّل (تيليجرام؛ العاجل عبر البوابة).
 * 4) تحويل تحريري تلقائي للعاجل عالي القيمة — جاهز للنشر قبل أن يطلبه أحد.
 * 5) تنظيف ساعيّ للمواد القديمة غير المُصدَّرة.
 */
import type { RadarItem } from "@shared/schema";
import pLimit from "p-limit";
import { analyzeItems } from "./analyst";
import { processAlerts } from "./alerts";
import { clusterRadarItems, itemsNeedingClustering } from "./clusterer";
import { fetchSource } from "./fetcher";
import {
  isClusteringEnabled,
  isMomentumEnabled,
  isRelevanceEnabled,
} from "./flags";
import { refreshStoryMomentum } from "./momentum";
import { refreshStoryRelevance } from "./relevance";
import { isRadarRateLimitError, RADAR_FETCH_CONCURRENCY } from "./fetchPolicy";
import {
  breakingItemsNeedingDraft,
  cleanupOldItems,
  countAnalyzedToday,
  getSource,
  insertItems,
  itemsByIds,
  itemsNeedingAnalysis,
  markSourceFetched,
  sourcesDueForFetch,
} from "./repo";
import { transformItem } from "./transformer";
import { applyGates, consolidateStories, regateStories } from "./gates";
import { assertRadarEnabled, isRadarDisabledError } from "./runtime";

// بعد توسعة المصادر تراكم طابور إنجليزي — دفعة أكبر + جولات متعددة لتصفية الترجمة
const MAX_ANALYZE_PER_RUN = Number(process.env.RADAR_MAX_ANALYZE_PER_RUN || 20);
const MAX_ANALYZE_ROUNDS = Math.max(1, Number(process.env.RADAR_MAX_ANALYZE_ROUNDS || 3));
const MAX_CLUSTER_PER_RUN = Number(process.env.RADAR_MAX_CLUSTER_PER_RUN || 40);
const AUTO_TRANSFORM_MIN_SCORE = Number(process.env.RADAR_AUTOTRANSFORM_MIN_SCORE || 80);
const MAX_AUTO_TRANSFORM_PER_RUN = 2;
const RETENTION_DAYS = Number(process.env.RADAR_RETENTION_DAYS || 14);
/** سقف كلفة فعلي: عدد المواد المحلَّلة يوميًا (بتوقيت الرياض) */
export const DAILY_ANALYZE_CAP = Math.max(0, Number(process.env.RADAR_DAILY_ANALYZE_CAP || 2000));
const autoTransformEnabled = () => process.env.RADAR_AUTO_TRANSFORM !== "false";
const sourceFetchLimit = pLimit(RADAR_FETCH_CONCURRENCY);

export interface RadarCycleSummary {
  sourcesFetched: number;
  newItems: number;
  analyzed: number;
  clustered: number;
  storiesCreated: number;
  alertsSent: number;
  autoDrafts: number;
  cleaned: number;
  errors: number;
  /** نسخ ضُمّت لقصصها بلا تحليل */
  merged: number;
  /** قصص باقية ضُمّت إليها قصص متفرقة لنفس الحدث */
  storiesMerged: number;
  /** بلغ سقف التحليل اليومي — الإشارات الرخيصة مستمرة والتحليل مؤجل */
  analysisCapped: boolean;
}

export interface RadarCycleRecord {
  startedAt: string;
  finishedAt: string;
  summary: RadarCycleSummary;
}

let lastCycle: RadarCycleRecord | null = null;

/** آخر دورة على هذه النسخة من الخادم (قد تكون null على نسخة ليست القائدة) */
export function getLastCycle(): RadarCycleRecord | null {
  return lastCycle;
}

/** جلب مصدر واحد يدويًا (زر "جلب الآن" في الواجهة) — يعيد عدد الجديد */
export async function fetchSingleSource(sourceId: string): Promise<number> {
  await assertRadarEnabled();
  const source = await getSource(sourceId);
  if (!source) throw new Error("RADAR_SOURCE_NOT_FOUND");
  try {
    return await sourceFetchLimit(async () => {
      await assertRadarEnabled();
      const normalized = await fetchSource(source);
      await assertRadarEnabled();
      const inserted = await insertItems(source, normalized);
      await markSourceFetched(source.id, null);
      return inserted.length;
    });
  } catch (error) {
    if (isRadarDisabledError(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    await markSourceFetched(source.id, message.substring(0, 500));
    throw error;
  }
}

export async function runRadarCycle(): Promise<RadarCycleSummary> {
  const summary: RadarCycleSummary = {
    sourcesFetched: 0,
    newItems: 0,
    analyzed: 0,
    clustered: 0,
    storiesCreated: 0,
    alertsSent: 0,
    autoDrafts: 0,
    cleaned: 0,
    errors: 0,
    merged: 0,
    storiesMerged: 0,
    analysisCapped: false,
  };

  await assertRadarEnabled();
  const startedAt = new Date().toISOString();

  // 1) الجلب — فشل مصدر واحد لا يوقف البقية
  const due = await sourcesDueForFetch();
  const fetchResults = await Promise.allSettled(
    due.map((source) => sourceFetchLimit(async () => {
      await assertRadarEnabled();
      try {
        const normalized = await fetchSource(source);
        await assertRadarEnabled();
        const inserted = await insertItems(source, normalized);
        await markSourceFetched(source.id, null);
        return inserted.length;
      } catch (error) {
        if (isRadarDisabledError(error)) throw error;
        const message = error instanceof Error ? error.message : String(error);
        await markSourceFetched(source.id, message.substring(0, 500));
        throw error;
      }
    }))
  );
  await assertRadarEnabled();
  for (let index = 0; index < fetchResults.length; index++) {
    const result = fetchResults[index];
    if (result.status === "fulfilled") {
      summary.sourcesFetched++;
      summary.newItems += result.value;
    } else {
      if (isRadarDisabledError(result.reason)) throw result.reason;
      summary.errors++;
      // فشل جلب/تحليل مصدر RSS (مثل "Unable to parse XML") حالة متوقَّعة لمصادر
      // متقلّبة؛ نكتفي بالرسالة المختصرة بدل إغراق السجلّات بالـ stack كل دقيقة.
      const rateLimited = isRadarRateLimitError(result.reason);
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.warn("[Radar] source fetch failed", {
        sourceId: due[index]?.id,
        type: due[index]?.type,
        reason: rateLimited ? "rate_limited" : reason.substring(0, 160),
      });
    }
  }

  // 2) التجميع قبل التحليل (خلف flag): النسخ شبه المطابقة تُضمّ شاهدًا لقصتها
  // بلا نداء نموذج، والمادة التي فيها جديد تبقى new لتُحلَّل كتطور.
  const touchedStories = new Set<string>();
  if (isClusteringEnabled()) {
    try {
      await assertRadarEnabled();
      const backlog = await itemsNeedingClustering(MAX_CLUSTER_PER_RUN * 3);
      await assertRadarEnabled();
      if (backlog.length) {
        const result = await clusterRadarItems(backlog);
        await assertRadarEnabled();
        summary.clustered += result.clustered;
        summary.storiesCreated += result.created;
        summary.merged += result.merged;
        result.storyIds.forEach((id) => touchedStories.add(id));
      }
    } catch (error) {
      if (isRadarDisabledError(error)) throw error;
      summary.errors++;
      console.error("[Radar] pre-analysis clustering failed:", error);
    }
  }

  // 3) التحليل + الترجمة — جولات متتالية حتى يصفو الطابور أو يبلغ السقف اليومي
  const analyzed: RadarItem[] = [];
  try {
    await assertRadarEnabled();
    let remaining = Math.max(0, DAILY_ANALYZE_CAP - (await countAnalyzedToday()));
    await assertRadarEnabled();
    if (remaining === 0) summary.analysisCapped = true;
    for (let round = 0; round < MAX_ANALYZE_ROUNDS && remaining > 0; round++) {
      const batchSize = Math.min(MAX_ANALYZE_PER_RUN, remaining);
      const pending = await itemsNeedingAnalysis(batchSize);
      await assertRadarEnabled();
      if (!pending.length) break;
      const batch = await analyzeItems(pending);
      await assertRadarEnabled();
      analyzed.push(...batch);
      summary.analyzed += batch.length;
      remaining -= batch.length;
      if (remaining <= 0) summary.analysisCapped = true;
      // دفعة ناقصة = لا مزيد في الطابور
      if (pending.length < batchSize) break;
    }
  } catch (error) {
    if (isRadarDisabledError(error)) throw error;
    summary.errors++;
    console.error("[Radar] analysis failed:", error);
  }

  // 3أ) مواد حُلّلت دون قصة (التجميع فشل سابقًا) — تجميع لاحق
  if (isClusteringEnabled() && analyzed.some((i) => !i.storyId)) {
    try {
      await assertRadarEnabled();
      const result = await clusterRadarItems(analyzed.filter((i) => !i.storyId));
      await assertRadarEnabled();
      summary.clustered += result.clustered;
      summary.storiesCreated += result.created;
      result.storyIds.forEach((id) => touchedStories.add(id));
    } catch (error) {
      if (isRadarDisabledError(error)) throw error;
      summary.errors++;
      console.error("[Radar] clustering failed:", error);
    }
  }

  // 3ب) البوابات: عاجل مؤقت + محاور + مسار، بعد معرفة المصادر المستقلة.
  // وقصص زاد تأييدها تُعاد بواباتها (مصدر مستقل ثانٍ قد يرفع العاجل).
  let gated: RadarItem[] = [];
  try {
    await assertRadarEnabled();
    const fresh = analyzed.length ? await itemsByIds(analyzed.map((i) => i.id)) : [];
    await assertRadarEnabled();
    gated = await applyGates(fresh);
    await assertRadarEnabled();
    // توحيد القصص المتفرقة عبر اللغات (بالعناوين العربية) كل 5 دقائق
    if (isClusteringEnabled() && new Date().getMinutes() % 5 === 0) {
      const keepers = await consolidateStories();
      summary.storiesMerged = keepers.length;
      keepers.forEach((id) => touchedStories.add(id));
    }
    const alreadyGated = new Set(fresh.map((i) => i.storyId).filter(Boolean));
    await regateStories([...touchedStories].filter((id) => !alreadyGated.has(id)));
  } catch (error) {
    if (isRadarDisabledError(error)) throw error;
    summary.errors++;
    console.error("[Radar] gates failed:", error);
  }

  // 3ج) زخم + صلة على القصص النشطة
  if (isMomentumEnabled()) {
    try {
      await assertRadarEnabled();
      await refreshStoryMomentum(50);
      await assertRadarEnabled();
    } catch (error) {
      if (isRadarDisabledError(error)) throw error;
      summary.errors++;
      console.error("[Radar] momentum failed:", error);
    }
  }
  if (isRelevanceEnabled()) {
    try {
      await assertRadarEnabled();
      await refreshStoryRelevance(40);
      await assertRadarEnabled();
    } catch (error) {
      if (isRadarDisabledError(error)) throw error;
      summary.errors++;
      console.error("[Radar] relevance failed:", error);
    }
  }

  // 4) التنبيهات على ما حُلّل في هذه الدورة
  try {
    await assertRadarEnabled();
    summary.alertsSent = await processAlerts(gated.length ? gated : analyzed);
    await assertRadarEnabled();
  } catch (error) {
    if (isRadarDisabledError(error)) throw error;
    summary.errors++;
    console.error("[Radar] alerts failed:", error);
  }

  // 5) التحويل التلقائي للعاجل عالي القيمة — أولوية Breaking News
  if (autoTransformEnabled()) {
    try {
      await assertRadarEnabled();
      const candidates = await breakingItemsNeedingDraft(
        AUTO_TRANSFORM_MIN_SCORE,
        MAX_AUTO_TRANSFORM_PER_RUN
      );
      for (const candidate of candidates) {
        await assertRadarEnabled();
        try {
          await transformItem(candidate);
          await assertRadarEnabled();
          summary.autoDrafts++;
        } catch (error) {
          if (isRadarDisabledError(error)) throw error;
          summary.errors++;
          console.error(`[Radar] auto-transform failed for ${candidate.id}:`, error);
        }
      }
    } catch (error) {
      if (isRadarDisabledError(error)) throw error;
      summary.errors++;
      console.error("[Radar] auto-transform query failed:", error);
    }
  }

  // 6) تنظيف ساعيّ (الدقيقة 0 فقط) — لا حاجة لحذف كل دقيقة
  if (new Date().getMinutes() === 0) {
    try {
      await assertRadarEnabled();
      summary.cleaned = await cleanupOldItems(RETENTION_DAYS);
      await assertRadarEnabled();
    } catch (error) {
      if (isRadarDisabledError(error)) throw error;
      summary.errors++;
      console.error("[Radar] cleanup failed:", error);
    }
  }

  // 7) رادار الفجوات التحريرية — fire-and-forget بعد اكتمال الدورة؛
  // استيراد ديناميكي + catch مزدوج حتى لا يؤثر فشل المطابقة على دورة الرادار
  try {
    await assertRadarEnabled();
    const { refreshCoverageGaps } = await import("../coverageGapMatcher");
    await assertRadarEnabled();
    void refreshCoverageGaps("radar-cycle").catch((error) => {
      console.warn("[Radar] coverage-gap matching failed:", error instanceof Error ? error.message : error);
    });
  } catch (error) {
    console.warn("[Radar] coverage-gap matcher unavailable:", error instanceof Error ? error.message : error);
  }

  lastCycle = { startedAt, finishedAt: new Date().toISOString(), summary };
  return summary;
}
