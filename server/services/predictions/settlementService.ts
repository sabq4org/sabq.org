// محرك التسوية المركزي — القلب التشغيلي للمنصة.
//
// الضمانات (مقترح v2 §10 و§16):
// - تسوية واحدة لكل (مسابقة، نسخة نتيجة، إصدار استراتيجية): صف تسوية فريد
//   يُستأنف بعد الفشل ولا يتكرر بعد النجاح.
// - قفل استشاري لكل مسابقة يمنع عاملَين من تسويتها معًا، وقفل لكل بركة
//   (بطولة + نوع) يسلسل قراءة/كتابة رصيد الترحيل.
// - Settlement + Ledger + Carry + Outbox + حالة المسابقة في Transaction واحدة.
// - القيود Append-only: إعادة التشغيل بنفس المدخلات لا تضيف قيدًا (قيود
//   فريدة + onConflictDoNothing)، والتصحيح بقيود عكسية فقط.
// - مضاعف العضوية يُحتسب هنا لقيمة المحفظة فقط (outbox) ولا يلمس نقاط
//   البطولة — فصل النقاط مبدأ حاكم.

import crypto from "crypto";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  predictionAwardOutbox,
  predictionContests,
  predictionEntries,
  predictionPointsLedger,
  predictionPoolState,
  predictionScoringProfiles,
  predictionSettlements,
  userPointsTotal,
} from "@shared/schema";
import { REASON_CODES, type ContestType } from "@shared/predictions";
import { tierMultiplierForPoints } from "@shared/loyalty";
import { runStrategy } from "./registry";
import type { SettlementInput } from "./strategyTypes";

const MAX_CONTESTS_PER_TICK = 10;

function computeInputHash(payload: {
  resultPayload: unknown;
  resultVersion: number;
  profileId: string;
  profileVersion: number;
  params: unknown;
  entryIds: string[];
}): string {
  const canonical = JSON.stringify({
    ...payload,
    entryIds: [...payload.entryIds].sort(),
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/** يقفل المسابقات المفتوحة التي بلغ وقت إغلاقها. يعيد عدد المقفلة. */
export async function lockDueContests(): Promise<number> {
  const locked = await db
    .update(predictionContests)
    .set({ status: "locked", updatedAt: new Date() })
    .where(and(eq(predictionContests.status, "open"), lte(predictionContests.locksAt, new Date())))
    .returning({ id: predictionContests.id });
  return locked.length;
}

/** يلتقط المسابقات الجاهزة ويسوّيها واحدة واحدة. يعيد ملخصًا للرصد. */
export async function settleReadyContests(): Promise<{
  settled: number;
  failed: number;
  errors: Array<{ contestId: string; error: string }>;
}> {
  const ready = await db
    .select({ id: predictionContests.id })
    .from(predictionContests)
    .where(eq(predictionContests.status, "ready"))
    .orderBy(asc(predictionContests.updatedAt))
    .limit(MAX_CONTESTS_PER_TICK);

  let settledCount = 0;
  let failedCount = 0;
  const errors: Array<{ contestId: string; error: string }> = [];

  for (const row of ready) {
    try {
      await settleContest(row.id);
      settledCount++;
    } catch (error) {
      failedCount++;
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ contestId: row.id, error: message });
      console.error(`[Prediction Core] settlement failed for contest ${row.id}:`, message);
    }
  }

  return { settled: settledCount, failed: failedCount, errors };
}

/**
 * تسوية مسابقة واحدة بصورة idempotent. آمنة لإعادة الاستدعاء: النجاح السابق
 * يُعاد كما هو، والفشل الجزئي يُستأنف من صف التسوية نفسه.
 */
export async function settleContest(contestId: string): Promise<{ settlementId: string; alreadySettled: boolean }> {
  return db.transaction(async (tx) => {
    // قفل المسابقة: عامل واحد فقط يسوّيها في اللحظة الواحدة
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`prediction-settle:${contestId}`}))`);

    const [contest] = await tx
      .select()
      .from(predictionContests)
      .where(eq(predictionContests.id, contestId))
      .limit(1);
    if (!contest) throw new Error("CONTEST_NOT_FOUND");
    if (contest.status === "settled") {
      const [existing] = await tx
        .select({ id: predictionSettlements.id })
        .from(predictionSettlements)
        .where(and(
          eq(predictionSettlements.contestId, contestId),
          eq(predictionSettlements.status, "settled"),
        ))
        .orderBy(asc(predictionSettlements.startedAt))
        .limit(1);
      return { settlementId: existing?.id ?? "", alreadySettled: true };
    }
    if (contest.status !== "ready") throw new Error(`CONTEST_NOT_READY:${contest.status}`);
    if (!contest.resultPayload) throw new Error("RESULT_NOT_FINAL");

    const [profile] = await tx
      .select()
      .from(predictionScoringProfiles)
      .where(eq(predictionScoringProfiles.id, contest.scoringProfileId))
      .limit(1);
    if (!profile) throw new Error("SCORING_PROFILE_NOT_FOUND");

    const entries = await tx
      .select()
      .from(predictionEntries)
      .where(and(
        eq(predictionEntries.contestId, contestId),
        eq(predictionEntries.status, "active"),
      ));

    // قفل بركة (البطولة، النوع) ثم قراءة رصيد الترحيل
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`prediction-pool:${contest.competitionId}:${contest.contestType}`}))`);
    const [poolState] = await tx
      .select()
      .from(predictionPoolState)
      .where(and(
        eq(predictionPoolState.competitionId, contest.competitionId),
        eq(predictionPoolState.contestType, contest.contestType),
      ))
      .limit(1);
    const carryIn = poolState?.carryBalance ?? 0;

    // تنفيذ الاستراتيجية — دالة نقية حتمية
    const input: SettlementInput = {
      contestType: contest.contestType as ContestType,
      entries: entries.map((e) => ({
        entryId: e.id,
        userId: e.userId,
        payload: e.predictionPayload as Record<string, unknown>,
        submittedAt: e.submittedAt,
      })),
      resultPayload: contest.resultPayload as Record<string, unknown>,
      carryIn,
      locksAt: contest.locksAt,
    };
    const { result, strategyVersion } = runStrategy(profile.strategyKey, input, profile.params);

    const inputHash = computeInputHash({
      resultPayload: contest.resultPayload,
      resultVersion: contest.resultVersion,
      profileId: profile.id,
      profileVersion: profile.version,
      params: profile.params,
      entryIds: entries.map((e) => e.id),
    });

    // صف التسوية: onConflictDoNothing ثم إعادة القراءة — الاستئناف بعد فشل
    // جزئي يلتقط الصف نفسه (قيد فريد contest/resultVersion/strategyVersion)
    await tx
      .insert(predictionSettlements)
      .values({
        contestId,
        resultVersion: contest.resultVersion,
        strategyKey: profile.strategyKey,
        strategyVersion,
        inputHash,
        status: "processing",
      })
      .onConflictDoNothing();
    const [settlement] = await tx
      .select()
      .from(predictionSettlements)
      .where(and(
        eq(predictionSettlements.contestId, contestId),
        eq(predictionSettlements.resultVersion, contest.resultVersion),
        eq(predictionSettlements.strategyVersion, strategyVersion),
      ))
      .limit(1);
    if (!settlement) throw new Error("SETTLEMENT_ROW_MISSING");
    if (settlement.status === "settled") {
      return { settlementId: settlement.id, alreadySettled: true };
    }
    if (settlement.inputHash !== inputHash) {
      // المدخلات تغيرت تحت نفس نسخة النتيجة — لا نكمل بصمت
      await tx
        .update(predictionSettlements)
        .set({ status: "failed", errorCode: "INPUT_HASH_MISMATCH", completedAt: new Date() })
        .where(eq(predictionSettlements.id, settlement.id));
      throw new Error("INPUT_HASH_MISMATCH");
    }

    // قيود النقاط — Append-only مع قيد فريد يجعل الاستئناف آمنًا
    if (result.awards.length > 0) {
      await tx
        .insert(predictionPointsLedger)
        .values(result.awards.map((award) => ({
          settlementId: settlement.id,
          contestId,
          competitionId: contest.competitionId,
          entryId: award.entryId,
          userId: award.userId,
          points: award.basePoints,
          pointScope: "competition",
          reasonCode: award.reasonCode,
          breakdown: { ...award.breakdown, ruleVersion: profile.version },
        })))
        .onConflictDoNothing();
    }
    const ledgerRows = await tx
      .select()
      .from(predictionPointsLedger)
      .where(eq(predictionPointsLedger.settlementId, settlement.id));

    // Outbox المحفظة: مضاعف طبقة العضوية يُطبق هنا فقط (فصل النقاط)
    const winnerIds = [...new Set(ledgerRows.filter((r) => r.points > 0).map((r) => r.userId))];
    const lifetimeRows = winnerIds.length > 0
      ? await tx
          .select({ userId: userPointsTotal.userId, lifetimePoints: userPointsTotal.lifetimePoints })
          .from(userPointsTotal)
          .where(inArray(userPointsTotal.userId, winnerIds))
      : [];
    const lifetimeByUser = new Map(lifetimeRows.map((r) => [r.userId, r.lifetimePoints ?? 0]));

    const outboxValues = ledgerRows
      .filter((r) => r.points > 0 && r.reasonCode !== REASON_CODES.REVERSAL)
      .map((r) => {
        const multiplier = tierMultiplierForPoints(lifetimeByUser.get(r.userId) ?? 0);
        const multiplierSnapshot = Math.round(multiplier * 100);
        return {
          ledgerId: r.id,
          userId: r.userId,
          basePoints: r.points,
          multiplierSnapshot,
          walletPoints: Math.round((r.points * multiplierSnapshot) / 100),
        };
      })
      .filter((v) => v.walletPoints > 0);
    if (outboxValues.length > 0) {
      await tx.insert(predictionAwardOutbox).values(outboxValues).onConflictDoNothing();
    }

    // تحديث رصيد الترحيل
    if (poolState) {
      await tx
        .update(predictionPoolState)
        .set({ carryBalance: result.pool.carried, lastSettlementId: settlement.id, updatedAt: new Date() })
        .where(eq(predictionPoolState.id, poolState.id));
    } else {
      await tx.insert(predictionPoolState).values({
        competitionId: contest.competitionId,
        contestType: contest.contestType,
        carryBalance: result.pool.carried,
        lastSettlementId: settlement.id,
      });
    }

    const winners = new Set(result.awards.map((a) => a.userId)).size;
    await tx
      .update(predictionSettlements)
      .set({
        status: "settled",
        summary: {
          entries: entries.length,
          winners,
          poolAvailable: result.pool.available,
          poolAwarded: result.pool.awarded,
          poolCarried: result.pool.carried,
          poolRemainder: result.pool.remainder,
        },
        errorCode: null,
        completedAt: new Date(),
      })
      .where(eq(predictionSettlements.id, settlement.id));

    await tx
      .update(predictionContests)
      .set({ status: "settled", settledAt: new Date(), updatedAt: new Date() })
      .where(eq(predictionContests.id, contestId));

    console.log(
      `[Prediction Core] settled contest ${contestId}: entries=${entries.length} winners=${winners} ` +
        `pool=${result.pool.available} awarded=${result.pool.awarded} carried=${result.pool.carried}`,
    );
    return { settlementId: settlement.id, alreadySettled: false };
  });
}

/**
 * تصحيح نتيجة مسابقة مسوّاة (مقترح v2 §10.3): قيود عكسية للتسوية الأصلية +
 * نسخة نتيجة جديدة + إعادة الحالة إلى ready ليسوّيها العامل بالنتيجة الصحيحة.
 * لا يلمس المحفظة — استرداد نقاط الولاء الممنوحة قرار منتج منفصل (قرار §26/9).
 */
export async function reverseAndReopen(
  contestId: string,
  newResultPayload: Record<string, unknown>,
): Promise<{ reversalSettlementId: string }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`prediction-settle:${contestId}`}))`);

    const [contest] = await tx
      .select()
      .from(predictionContests)
      .where(eq(predictionContests.id, contestId))
      .limit(1);
    if (!contest) throw new Error("CONTEST_NOT_FOUND");
    if (contest.status !== "settled") throw new Error(`CONTEST_NOT_SETTLED:${contest.status}`);

    const [original] = await tx
      .select()
      .from(predictionSettlements)
      .where(and(
        eq(predictionSettlements.contestId, contestId),
        eq(predictionSettlements.status, "settled"),
        eq(predictionSettlements.resultVersion, contest.resultVersion),
      ))
      .limit(1);
    if (!original) throw new Error("SETTLEMENT_NOT_FOUND");

    const originalLedger = await tx
      .select()
      .from(predictionPointsLedger)
      .where(eq(predictionPointsLedger.settlementId, original.id));

    // تسوية عكسية بنسخة نتيجة جديدة (النسخة القادمة تصبح +2)
    const reversalResultVersion = contest.resultVersion + 1;
    const [reversal] = await tx
      .insert(predictionSettlements)
      .values({
        contestId,
        resultVersion: reversalResultVersion,
        strategyKey: original.strategyKey,
        strategyVersion: original.strategyVersion,
        inputHash: original.inputHash,
        status: "settled",
        reversesSettlementId: original.id,
        summary: {
          entries: 0,
          winners: 0,
          poolAvailable: 0,
          poolAwarded: -originalLedger.reduce((sum, r) => sum + r.points, 0),
          poolCarried: 0,
          poolRemainder: 0,
        },
        completedAt: new Date(),
      })
      .returning();

    if (originalLedger.length > 0) {
      await tx
        .insert(predictionPointsLedger)
        .values(originalLedger.map((row) => ({
          settlementId: reversal.id,
          contestId,
          competitionId: row.competitionId,
          entryId: row.entryId,
          userId: row.userId,
          points: -row.points,
          pointScope: row.pointScope,
          reasonCode: REASON_CODES.REVERSAL,
          breakdown: { reasonCode: REASON_CODES.REVERSAL, reverses: row.reasonCode },
          reversesLedgerId: row.id,
        })))
        .onConflictDoNothing();
    }

    await tx
      .update(predictionSettlements)
      .set({ status: "reversed" })
      .where(eq(predictionSettlements.id, original.id));

    await tx
      .update(predictionContests)
      .set({
        resultPayload: newResultPayload,
        resultVersion: reversalResultVersion + 1,
        status: "ready",
        settledAt: null,
        updatedAt: new Date(),
      })
      .where(eq(predictionContests.id, contestId));

    console.log(`[Prediction Core] reversed settlement ${original.id} for contest ${contestId}`);
    return { reversalSettlementId: reversal.id };
  });
}
