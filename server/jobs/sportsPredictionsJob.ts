/**
 * جوب تسوية توقّعات المباريات (المرحلة 4 — المجتمع).
 *
 * كل 10 دقائق يجلب المباريات التي توقّعها المستخدمون ومضى على انطلاقها وقتٌ
 * كافٍ لانتهائها، يجلب نتيجتها النهائية من المزوّد، ويحسب نقاط كل توقّع
 * (3 للمطابقة التامة، 1 للاتجاه الصحيح، 0 للخطأ).
 *
 * يعمل على القائد فقط (يُفحص داخل كل دورة لا عند التسجيل — نفس نمط بقية الجوبات).
 * لا يحتاج متغيّر بيئة منفصل: التسوية عملية داخلية رخيصة، تُحرس فقط بتوفّر
 * مزوّد البيانات الرياضية (saudiLeagueService).
 *
 * Phase A/B additions:
 * - يُسوّي توقّعات الهدافين (sportsPoolPlayerPicks) بعد تسوية المباراة.
 * - يُغلق توقّعات الهدافين المنطلقة (lockMatchPicksIfDue).
 * - كل يوم سبت 00:00 (توقيت الرياض) يُعيد توزيع الأقسام الأسبوعيّة.
 */
import cron from "node-cron";
import { isLeader } from "../leaderElection";
import { isSaudiLeagueConfigured } from "../services/saudiLeagueService";
import { settleFinishedPredictions } from "../services/sportsPredictionsService";
import {
  isSportsPredictionsEnabled,
  settleFinishedMatches as settlePoolMatches,
} from "../services/sportsPoolPredictionsService";
import { settlePlayerPickMatches, lockMatchPicksIfDue } from "../services/sportsPoolPlayerPicksService";
import { recomputeDivisions } from "../services/sportsPoolDivisionsService";

let isRunning = false;

async function tick(trigger: string): Promise<void> {
  if (!isLeader()) return;
  if (!isSaudiLeagueConfigured()) return;
  if (isRunning) {
    console.log("[SportsPredictions Job] previous cycle still running — skipping");
    return;
  }
  isRunning = true;
  try {
    const settled = await settleFinishedPredictions();
    if (settled > 0) {
      console.log(`[SportsPredictions Job] (${trigger}) settled=${settled} predictions`);
    }
    // Generalized tiered-pool predictions (separate engine) — only when enabled.
    if (isSportsPredictionsEnabled()) {
      // 1) إغلاق بركة الهدافين المنطلقة قبل التسوية.
      const locked = await lockMatchPicksIfDue();
      if (locked > 0) {
        console.log(`[SportsPredictions Job] (${trigger}) locked ${locked} scorer-pick matches`);
      }

      // 2) تسوية نتائج المباراة (يحقن مضاعف طبقة الولاء داخليًّا).
      const pool = await settlePoolMatches();
      if (pool.settled > 0 || pool.errors > 0) {
        console.log(`[SportsPredictions Job] (${trigger}) pool settled=${pool.settled} awarded=${pool.awarded} errors=${pool.errors}`);
      }

      // 3) تسوية توقّعات الهدافين (بركة منفصلة 300/200).
      const picks = await settlePlayerPickMatches();
      if (picks.settled > 0 || picks.errors > 0) {
        console.log(`[SportsPredictions Job] (${trigger}) picks settled=${picks.settled} awarded=${picks.awarded} errors=${picks.errors}`);
      }
    }
  } catch (error) {
    console.error("[SportsPredictions Job] cycle failed:", error);
  } finally {
    isRunning = false;
  }
}

export function startSportsPredictionsJob(): void {
  if (!isSaudiLeagueConfigured()) {
    console.log("[SportsPredictions Job] disabled (sports provider not configured)");
    return;
  }

  cron.schedule("*/10 * * * *", () => void tick("cron"), { timezone: "Asia/Riyadh" });
  console.log("[SportsPredictions Job] 🎯 scheduled — every 10 minutes (settle finished matches)");

  // إعادة توزيع الأقسام الأسبوعية كل يوم سبت 00:00 بتوقيت الرياض.
  cron.schedule("0 0 * * 6", async () => {
    if (!isLeader() || !isSportsPredictionsEnabled()) return;
    try {
      const r = await recomputeDivisions();
      if (r.recomputed > 0) {
        console.log(`[SportsPredictions Job] (weekly) divisions: recomputed=${r.recomputed} promoted=${r.promoted} relegated=${r.relegated} week=${r.weekId}`);
      }
    } catch (error) {
      console.error("[SportsPredictions Job] weekly divisions failed:", error);
    }
  }, { timezone: "Asia/Riyadh" });
  console.log("[SportsPredictions Job] 📊 weekly divisions scheduled — Saturday 00:00 (Asia/Riyadh)");

  // دورة أولى بعد دقيقة من الإقلاع لتسوية أي متأخّرات.
  setTimeout(() => void tick("startup"), 60 * 1000);
}
