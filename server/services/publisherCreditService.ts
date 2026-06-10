// Publisher credit deduction — extracted from storage.deductPublisherCredit
// per ADR-001 (docs/architecture/ADR-001-data-access-layer.md) while fixing
// audit finding M1.2 (2026-06-10): the old implementation ran the UPDATE and
// the credit-log INSERT as two separate statements (a crash in between lost
// the audit trail), and both publish routes swallowed every failure with a
// console.warn — billing silently leaked.
//
// Guarantees here:
//   - UPDATE + log INSERT are atomic (one transaction).
//   - The decrement is guarded by `remaining_credits > 0`, so concurrent
//     publishes can never drive the balance negative.
//   - Business outcomes (author isn't a publisher / no usable package) are
//     returned, not retried — retrying can't mint credit.
//   - Technical failures retry up to MAX_ATTEMPTS; the transaction makes
//     retries safe (no double deduction).
//   - This function NEVER throws: publishing must not break over billing.
//     Instead, every unrecovered failure logs a `[PUBLISHER CREDIT][RECONCILE]`
//     line with full context — grep Railway logs for RECONCILE to find
//     articles published without a deduction.

import { and, asc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { publisherCredits, publisherCreditLogs } from "@shared/schema";
import { storage } from "../storage";

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 250;

export type CreditDeductionResult =
  | { status: "deducted"; publisherId: string }
  | { status: "not_publisher" }
  | { status: "no_credits"; publisherId: string }
  | { status: "failed"; publisherId: string };

function reconcileLog(context: Record<string, unknown>, error?: unknown) {
  console.error(
    `[PUBLISHER CREDIT][RECONCILE] article published without a credit deduction — needs manual reconciliation`,
    JSON.stringify(context),
    error instanceof Error ? error.stack || error.message : error ?? "",
  );
}

async function deductOnce(
  publisherId: string,
  articleId: string,
  performedBy: string,
): Promise<"deducted" | "no_credits"> {
  const now = new Date();
  return db.transaction(async (tx) => {
    // Same package-selection rules as storage.getActivePublisherCredit:
    // active, has balance, not expired, soonest-expiring first.
    const [credit] = await tx
      .select()
      .from(publisherCredits)
      .where(
        and(
          eq(publisherCredits.publisherId, publisherId),
          eq(publisherCredits.isActive, true),
          sql`${publisherCredits.remainingCredits} > 0`,
          or(
            isNull(publisherCredits.expiryDate),
            gte(publisherCredits.expiryDate, now),
          ),
        ),
      )
      .orderBy(asc(publisherCredits.expiryDate))
      .limit(1);

    if (!credit) return "no_credits";

    const [updated] = await tx
      .update(publisherCredits)
      .set({
        usedCredits: sql`${publisherCredits.usedCredits} + 1`,
        remainingCredits: sql`${publisherCredits.remainingCredits} - 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(publisherCredits.id, credit.id),
          sql`${publisherCredits.remainingCredits} > 0`,
        ),
      )
      .returning();

    // A concurrent publish drained the package between SELECT and UPDATE.
    if (!updated) return "no_credits";

    await tx.insert(publisherCreditLogs).values({
      publisherId,
      creditPackageId: credit.id,
      articleId,
      actionType: "credit_used",
      creditsBefore: updated.remainingCredits + 1,
      creditsChanged: -1,
      creditsAfter: updated.remainingCredits,
      performedBy,
      notes: "تم خصم رصيد مقابل نشر خبر",
    });

    return "deducted";
  });
}

/**
 * Deduct one publishing credit for the author's publisher, if any.
 * Never throws — see module header for the failure-handling contract.
 */
export async function deductPublisherCreditSafely(params: {
  authorUserId: string | null | undefined;
  articleId: string;
  actorId: string;
}): Promise<CreditDeductionResult> {
  const { authorUserId, articleId, actorId } = params;
  if (!authorUserId) return { status: "not_publisher" };

  let publisherId: string;
  try {
    const publisher = await storage.getPublisherByUserId(authorUserId);
    if (!publisher || !publisher.isActive) return { status: "not_publisher" };
    publisherId = publisher.id;
  } catch (error) {
    reconcileLog({ stage: "publisher_lookup", authorUserId, articleId, actorId }, error);
    return { status: "failed", publisherId: "unknown" };
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const outcome = await deductOnce(publisherId, articleId, actorId);
      if (outcome === "no_credits") {
        // Business outcome, not an error — but the article IS going out
        // without a deduction, so it still needs to be visible.
        reconcileLog({ stage: "no_credits", publisherId, articleId, actorId });
        return { status: "no_credits", publisherId };
      }
      console.log(
        `💰 [PUBLISHER CREDIT] Deducted 1 credit for publisher ${publisherId} - article ${articleId}`,
      );
      return { status: "deducted", publisherId };
    } catch (error) {
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * attempt));
        continue;
      }
      reconcileLog(
        { stage: "deduction", publisherId, articleId, actorId, attempts: attempt },
        error,
      );
    }
  }
  return { status: "failed", publisherId };
}
