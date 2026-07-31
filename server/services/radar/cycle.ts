/**
 * دورة الرادار — الأوركسترا التي يستدعيها الـ cron كل دقيقة:
 * 1) جلب المصادر التي حان موعدها (فترة لكل مصدر) وإدراج الجديد بلا تكرار.
 * 2) تحليل دفعة من المواد الجديدة (قيمة إخبارية + ترجمة) بنداء نموذج واحد.
 * 3) تقييم قواعد التنبيه على ما حُلّل (عاجل + تيليجرام).
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
  isRadarForceDisabled,
  isRelevanceEnabled,
} from "./flags";
import { refreshStoryMomentum } from "./momentum";
import { refreshStoryRelevance } from "./relevance";
import { isRadarRateLimitError, RADAR_FETCH_CONCURRENCY } from "./fetchPolicy";
import {
  breakingItemsNeedingDraft,
  cleanupOldItems,
  getSource,
  insertItems,
  itemsNeedingAnalysis,
  markSourceFetched,
  sourcesDueForFetch,
} from "./repo";
import { transformItem } from "./transformer";

// بعد توسعة المصادر تراكم طابور إنجليزي — دفعة أكبر + جولات متعددة لتصفية الترجمة
const MAX_ANALYZE_PER_RUN = Number(process.env.RADAR_MAX_ANALYZE_PER_RUN || 20);
const MAX_ANALYZE_ROUNDS = Math.max(1, Number(process.env.RADAR_MAX_ANALYZE_ROUNDS || 3));
const MAX_CLUSTER_PER_RUN = Number(process.env.RADAR_MAX_CLUSTER_PER_RUN || 40);
const AUTO_TRANSFORM_MIN_SCORE = Number(process.env.RADAR_AUTOTRANSFORM_MIN_SCORE || 80);
const MAX_AUTO_TRANSFORM_PER_RUN = 2;
const RETENTION_DAYS = Number(process.env.RADAR_RETENTION_DAYS || 14);
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
}

/** جلب مصدر واحد يدويًا (زر "جلب الآن" في الواجهة) — يعيد عدد الجديد */
export async function fetchSingleSource(sourceId: string): Promise<number> {
  if (isRadarForceDisabled()) {
    throw new Error("RADAR_FORCE_DISABLED");
  }
  const source = await getSource(sourceId);
  if (!source) throw new Error("RADAR_SOURCE_NOT_FOUND");
  try {
    return await sourceFetchLimit(async () => {
      const normalized = await fetchSource(source);
      const inserted = await insertItems(source, normalized);
      await markSourceFetched(source.id, null);
      return inserted.length;
    });
  } catch (error) {
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
  };

  if (isRadarForceDisabled()) {
    return summary;
  }

  // 1) الجلب — فشل مصدر واحد لا يوقف البقية
  const due = await sourcesDueForFetch();
  const fetchResults = await Promise.allSettled(
    due.map((source) => sourceFetchLimit(async () => {
      try {
        const normalized = await fetchSource(source);
        const inserted = await insertItems(source, normalized);
        await markSourceFetched(source.id, null);
        return inserted.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await markSourceFetched(source.id, message.substring(0, 500));
        throw error;
      }
    }))
  );
  for (let index = 0; index < fetchResults.length; index++) {
    const result = fetchResults[index];
    if (result.status === "fulfilled") {
      summary.sourcesFetched++;
      summary.newItems += result.value;
    } else {
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

  // 2) التحليل + الترجمة — جولات متتالية حتى يصفو الطابور أو يبلغ السقف
  const analyzed: RadarItem[] = [];
  try {
    for (let round = 0; round < MAX_ANALYZE_ROUNDS; round++) {
      const pending = await itemsNeedingAnalysis(MAX_ANALYZE_PER_RUN);
      if (!pending.length) break;
      const batch = await analyzeItems(pending);
      analyzed.push(...batch);
      summary.analyzed += batch.length;
      // دفعة ناقصة = لا مزيد في الطابور
      if (pending.length < MAX_ANALYZE_PER_RUN) break;
    }
  } catch (error) {
    summary.errors++;
    console.error("[Radar] analysis failed:", error);
  }

  // 3) تجميع القصص (خلف flag) — بعد التحليل لتوفر العناوين المترجمة عند الإمكان
  if (isClusteringEnabled()) {
    try {
      const pool = analyzed.length
        ? analyzed
        : await itemsNeedingClustering(MAX_CLUSTER_PER_RUN);
      const result = await clusterRadarItems(pool);
      summary.clustered = result.clustered;
      summary.storiesCreated = result.created;
      // أيضاً صفّ طابور المواد القديمة بلا قصة
      if (analyzed.length) {
        const backlog = await itemsNeedingClustering(MAX_CLUSTER_PER_RUN);
        if (backlog.length) {
          const more = await clusterRadarItems(backlog);
          summary.clustered += more.clustered;
          summary.storiesCreated += more.created;
        }
      }
    } catch (error) {
      summary.errors++;
      console.error("[Radar] clustering failed:", error);
    }
  }

  // 3ب) زخم + صلة على القصص النشطة
  if (isMomentumEnabled()) {
    try {
      await refreshStoryMomentum(50);
    } catch (error) {
      summary.errors++;
      console.error("[Radar] momentum failed:", error);
    }
  }
  if (isRelevanceEnabled()) {
    try {
      await refreshStoryRelevance(40);
    } catch (error) {
      summary.errors++;
      console.error("[Radar] relevance failed:", error);
    }
  }

  // 4) التنبيهات على ما حُلّل في هذه الدورة
  try {
    summary.alertsSent = await processAlerts(analyzed);
  } catch (error) {
    summary.errors++;
    console.error("[Radar] alerts failed:", error);
  }

  // 5) التحويل التلقائي للعاجل عالي القيمة — أولوية Breaking News
  if (autoTransformEnabled()) {
    try {
      const candidates = await breakingItemsNeedingDraft(
        AUTO_TRANSFORM_MIN_SCORE,
        MAX_AUTO_TRANSFORM_PER_RUN
      );
      for (const candidate of candidates) {
        try {
          await transformItem(candidate);
          summary.autoDrafts++;
        } catch (error) {
          summary.errors++;
          console.error(`[Radar] auto-transform failed for ${candidate.id}:`, error);
        }
      }
    } catch (error) {
      summary.errors++;
      console.error("[Radar] auto-transform query failed:", error);
    }
  }

  // 6) تنظيف ساعيّ (الدقيقة 0 فقط) — لا حاجة لحذف كل دقيقة
  if (new Date().getMinutes() === 0) {
    try {
      summary.cleaned = await cleanupOldItems(RETENTION_DAYS);
    } catch (error) {
      summary.errors++;
      console.error("[Radar] cleanup failed:", error);
    }
  }

  // 7) رادار الفجوات التحريرية — fire-and-forget بعد اكتمال الدورة؛
  // استيراد ديناميكي + catch مزدوج حتى لا يؤثر فشل المطابقة على دورة الرادار
  try {
    const { refreshCoverageGaps } = await import("../coverageGapMatcher");
    void refreshCoverageGaps("radar-cycle").catch((error) => {
      console.warn("[Radar] coverage-gap matching failed:", error instanceof Error ? error.message : error);
    });
  } catch (error) {
    console.warn("[Radar] coverage-gap matcher unavailable:", error instanceof Error ? error.message : error);
  }

  return summary;
}
