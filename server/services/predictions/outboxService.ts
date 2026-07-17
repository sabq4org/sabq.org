// تسليم Outbox المحفظة — الجسر الوحيد بين سجل نقاط البطولات ومحفظة الولاء.
//
// كل التسليم يمر عبر awardPoints (بوابة الولاء الواحدة — مبدأ v2 §4.7) بمصدر
// prediction:<ledgerId>؛ فتبقى ضمانات المحفظة (dedup مدى الحياة على المصدر)
// سارية حتى لو انهار العامل بين المنح وتحديث حالة الصف: إعادة المحاولة تعود
// بـ reason=DEDUP وتُعامل نجاحًا.

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import { predictionAwardOutbox } from "@shared/schema";
import { LOYALTY_ACTIONS } from "@shared/loyalty";
import { awardPoints } from "../loyalty";

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 8;

function backoffMinutes(attempts: number): number {
  return Math.min(2 ** attempts, 60);
}

/** يسلّم الرسائل المعلقة المستحقة. يعيد ملخصًا للرصد. */
export async function deliverPendingAwards(): Promise<{
  delivered: number;
  retried: number;
  deadLettered: number;
}> {
  const pending = await db
    .select()
    .from(predictionAwardOutbox)
    .where(and(
      eq(predictionAwardOutbox.status, "pending"),
      lte(predictionAwardOutbox.nextAttemptAt, new Date()),
    ))
    .orderBy(asc(predictionAwardOutbox.createdAt))
    .limit(BATCH_SIZE);

  let delivered = 0;
  let retried = 0;
  let deadLettered = 0;

  for (const row of pending) {
    try {
      const outcome = await awardPoints({
        userId: row.userId,
        action: LOYALTY_ACTIONS.PREDICTION_WIN,
        source: `prediction:${row.ledgerId}`,
        points: row.walletPoints,
        metadata: {
          ledgerId: row.ledgerId,
          basePoints: row.basePoints,
          multiplier: row.multiplierSnapshot / 100,
        },
      });

      // DEDUP = سُلّمت في محاولة سابقة انهارت قبل تحديث الحالة — نجاح
      if (outcome.awarded || outcome.reason === "DEDUP") {
        await db
          .update(predictionAwardOutbox)
          .set({ status: "delivered", deliveredAt: new Date(), lastError: null })
          .where(eq(predictionAwardOutbox.id, row.id));
        delivered++;
        continue;
      }

      // DAILY_CAP لا ينطبق (null للفعل) وNEGATIVE_POINTS لا يصل (wallet > 0)،
      // لكن أي رفض آخر مستقبلي يذهب لإعادة المحاولة لا للإسقاط الصامت
      throw new Error(`AWARD_REJECTED:${outcome.reason}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = row.attempts + 1;
      const isDead = attempts >= MAX_ATTEMPTS;
      await db
        .update(predictionAwardOutbox)
        .set({
          attempts,
          status: isDead ? "failed" : "pending",
          nextAttemptAt: sql`now() + make_interval(mins => ${backoffMinutes(attempts)})`,
          lastError: message.slice(0, 500),
        })
        .where(eq(predictionAwardOutbox.id, row.id));
      if (isDead) {
        deadLettered++;
        console.error(`[Prediction Core] outbox ${row.id} dead-lettered after ${attempts} attempts: ${message}`);
      } else {
        retried++;
      }
    }
  }

  return { delivered, retried, deadLettered };
}

/** لإعادة تشغيل رسالة فاشلة يدويًا من لوحة الإدارة لاحقًا. */
export async function retryFailedAward(outboxId: string): Promise<void> {
  await db
    .update(predictionAwardOutbox)
    .set({ status: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: null })
    .where(and(eq(predictionAwardOutbox.id, outboxId), eq(predictionAwardOutbox.status, "failed")));
}
