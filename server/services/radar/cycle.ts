/**
 * دورة الرادار — الأوركسترا التي يستدعيها الـ cron كل دقيقة:
 * 1) جلب المصادر التي حان موعدها (فترة لكل مصدر) وإدراج الجديد بلا تكرار.
 * 2) تحليل دفعة من المواد الجديدة (قيمة إخبارية + ترجمة) بنداء نموذج واحد.
 * 3) تقييم قواعد التنبيه على ما حُلّل (عاجل + تيليجرام).
 * 4) تحويل تحريري تلقائي للعاجل عالي القيمة — جاهز للنشر قبل أن يطلبه أحد.
 * 5) تنظيف ساعيّ للمواد القديمة غير المُصدَّرة.
 */
import type { RadarItem } from "@shared/schema";
import { analyzeItems } from "./analyst";
import { processAlerts } from "./alerts";
import { fetchSource } from "./fetcher";
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

const MAX_ANALYZE_PER_RUN = Number(process.env.RADAR_MAX_ANALYZE_PER_RUN || 12);
const AUTO_TRANSFORM_MIN_SCORE = Number(process.env.RADAR_AUTOTRANSFORM_MIN_SCORE || 80);
const MAX_AUTO_TRANSFORM_PER_RUN = 2;
const RETENTION_DAYS = Number(process.env.RADAR_RETENTION_DAYS || 14);
const autoTransformEnabled = () => process.env.RADAR_AUTO_TRANSFORM !== "false";

export interface RadarCycleSummary {
  sourcesFetched: number;
  newItems: number;
  analyzed: number;
  alertsSent: number;
  autoDrafts: number;
  cleaned: number;
  errors: number;
}

/** جلب مصدر واحد يدويًا (زر "جلب الآن" في الواجهة) — يعيد عدد الجديد */
export async function fetchSingleSource(sourceId: string): Promise<number> {
  const source = await getSource(sourceId);
  if (!source) throw new Error("RADAR_SOURCE_NOT_FOUND");
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
}

export async function runRadarCycle(): Promise<RadarCycleSummary> {
  const summary: RadarCycleSummary = {
    sourcesFetched: 0,
    newItems: 0,
    analyzed: 0,
    alertsSent: 0,
    autoDrafts: 0,
    cleaned: 0,
    errors: 0,
  };

  // 1) الجلب — فشل مصدر واحد لا يوقف البقية
  const due = await sourcesDueForFetch();
  const fetchResults = await Promise.allSettled(
    due.map(async (source) => {
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
    })
  );
  for (const result of fetchResults) {
    if (result.status === "fulfilled") {
      summary.sourcesFetched++;
      summary.newItems += result.value;
    } else {
      summary.errors++;
      console.error("[Radar] source fetch failed:", result.reason);
    }
  }

  // 2) التحليل — دفعة واحدة بنداء نموذج واحد
  let analyzed: RadarItem[] = [];
  try {
    const pending = await itemsNeedingAnalysis(MAX_ANALYZE_PER_RUN);
    if (pending.length) {
      analyzed = await analyzeItems(pending);
      summary.analyzed = analyzed.length;
    }
  } catch (error) {
    summary.errors++;
    console.error("[Radar] analysis failed:", error);
  }

  // 3) التنبيهات على ما حُلّل للتو
  try {
    summary.alertsSent = await processAlerts(analyzed);
  } catch (error) {
    summary.errors++;
    console.error("[Radar] alerts failed:", error);
  }

  // 4) التحويل التلقائي للعاجل عالي القيمة — أولوية Breaking News
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

  // 5) تنظيف ساعيّ (الدقيقة 0 فقط) — لا حاجة لحذف كل دقيقة
  if (new Date().getMinutes() === 0) {
    try {
      summary.cleaned = await cleanupOldItems(RETENTION_DAYS);
    } catch (error) {
      summary.errors++;
      console.error("[Radar] cleanup failed:", error);
    }
  }

  return summary;
}
