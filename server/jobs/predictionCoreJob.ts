// مهمة المنصة المركزية للتوقعات — عامل تسوية واحد لكل البطولات (لا cron
// لكل بطولة). كل دقيقة: قفل المسابقات المستحقة، تسوية الجاهزة، تسليم Outbox
// المحفظة. القيادة عبر isLeader، والأقفال الاستشارية داخل التسوية تجعل تشغيل
// نسخ متعددة آمنًا حتى لو تزامن قائدان لحظيًا.

import cron from "node-cron";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "../db";
import { predictionCompetitions, predictionContests } from "@shared/schema";
import { isLeader } from "../leaderElection";
import { isPredictionCoreEnabled } from "../services/predictions/predictionCoreService";
import { lockDueContests, settleReadyContests } from "../services/predictions/settlementService";
import { deliverPendingAwards } from "../services/predictions/outboxService";
import { syncCompetitionFixtures } from "../services/predictions/fixtureAdapter";
import { isGcPredictionsEnabled } from "../services/gcFeatureFlags";
import { settleMajlisDuels } from "../services/gcDuelsService";
import { runWithSportsPriority } from "../services/sportsRequestContext";

let isRunning = false;

async function tick(trigger: string): Promise<void> {
  if (!isLeader()) return;
  if (isRunning) return;
  isRunning = true;
  try {
    // المزامنة أولًا (إنشاء/جدولة/نتائج) ثم القفل فالتسوية فالتسليم —
    // نتيجة تصل في هذه الدورة تُسوّى في الدورة نفسها
    const sync = await syncCompetitionFixtures();
    const locked = await lockDueContests();
    const settlement = await settleReadyContests();
    const outbox = await deliverPendingAwards();
    await settleGulfDuels();

    const activity =
      sync.created + sync.rescheduled + sync.resultsSet + sync.voided + sync.errors.length;
    if (activity > 0 || locked > 0 || settlement.settled > 0 || settlement.failed > 0 || outbox.delivered > 0 || outbox.deadLettered > 0) {
      console.log(
        `[Prediction Core Job] (${trigger}) synced(created=${sync.created} rescheduled=${sync.rescheduled} ` +
          `results=${sync.resultsSet} voided=${sync.voided}) locked=${locked} settled=${settlement.settled} ` +
          `failed=${settlement.failed} outboxDelivered=${outbox.delivered} deadLettered=${outbox.deadLettered}`,
      );
    }
  } catch (error) {
    console.error("[Prediction Core Job] tick failed:", error);
  } finally {
    isRunning = false;
  }
}

/**
 * تحديات المجلس (رهانات P2P على مباريات خليجي 27) تُسوّى من حالة المباريات
 * النهائية — كان محفزها job المحرك القديم المتقاعد. settleMajlisDuels
 * idempotent وتفحص حالة المزود بنفسها، فنمررها مباريات الخليج التي بلغت
 * حالة نهائية في الساعات الأخيرة.
 */
async function settleGulfDuels(): Promise<void> {
  if (!isGcPredictionsEnabled()) return;
  try {
    const rows = await db
      .select({ ref: predictionContests.externalRef })
      .from(predictionContests)
      .innerJoin(
        predictionCompetitions,
        eq(predictionCompetitions.id, predictionContests.competitionId),
      )
      .where(and(
        eq(predictionCompetitions.slug, "gulf-cup-27"),
        eq(predictionContests.contestType, "match_score"),
        inArray(predictionContests.status, ["settled", "void"]),
        gte(predictionContests.updatedAt, new Date(Date.now() - 6 * 3_600_000)),
      ));
    if (rows.length > 0) {
      await settleMajlisDuels(rows.map((row) => row.ref));
    }
  } catch (error) {
    console.error("[Prediction Core Job] gulf duels settlement failed:", error);
  }
}

export function startPredictionCoreJob(): void {
  if (!isPredictionCoreEnabled()) {
    console.log("[Prediction Core Job] disabled (PREDICTION_CORE_ENABLED != true)");
    return;
  }
  cron.schedule("* * * * *", () => void runWithSportsPriority("background", () => tick("cron")), { timezone: "Asia/Riyadh" });
  setTimeout(() => void runWithSportsPriority("background", () => tick("startup")), 60 * 1000);
  console.log("[Prediction Core Job] scheduled (every minute)");
}
