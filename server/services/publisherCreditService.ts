// Publisher credit deduction — the ONE place that charges an agency package
// for a published article. Every publish path (newsroom create/update, the
// direct publish endpoint, admin approval, the publisher portal, the bot API
// and the scheduled publisher) goes through `chargePublishInTx` or
// `deductPublisherCreditSafely`.
//
// History: the logic used to be copied in four places with different package
// selection rules, the scheduled publisher never charged at all, and a
// re-publish could charge the same article twice. Audit finding M1.2
// (2026-06-10) made the original copy atomic; the 2026-10 review unified it.
//
// Guarantees here:
//   - One article is charged at most once: a per-article advisory lock plus a
//     check of the ledger (credit_used + credit_settled − credit_refunded)
//     inside the same transaction. Re-publishing an archived article does not
//     charge again. `credit_settled` is a zero-amount entry written once by
//     scripts/sql/settle-publisher-credit-ledger-2026-10-06.sql for articles
//     published before this service caught every path; it marks them charged
//     without touching any balance or the usage counters.
//   - UPDATE + log INSERT are atomic (one transaction).
//   - Package selection: active, not expired, (unlimited OR has balance) —
//     unlimited first, then the soonest-expiring.
//   - The decrement is guarded by `remaining_credits > 0`, so concurrent
//     publishes can never drive the balance negative.
//   - The agency is resolved from `articles.publisher_id` first (the agency
//     stamp the newsroom editor and portal write), then from the author's
//     ownership/membership.
//   - `deductPublisherCreditSafely` NEVER throws: publishing must not break
//     over billing. Every unrecovered failure logs a
//     `[PUBLISHER CREDIT][RECONCILE]` line — grep Railway logs for RECONCILE.
//     Paths that must block on an empty package (direct publish, admin
//     approval) call `chargePublishInTx` inside their own transaction.

import { and, asc, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db";
import { articles, publishers, publisherCredits, publisherCreditLogs, users } from "@shared/schema";

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 250;

/** Anything that can run the queries below: `db` or a transaction handle. */
export type CreditTx = Pick<typeof db, "select" | "insert" | "update" | "execute">;

export type ChargeOutcome = "deducted" | "already_charged" | "no_credits";

export type CreditDeductionResult =
  | { status: "deducted"; publisherId: string }
  | { status: "already_charged"; publisherId: string }
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

/**
 * Charge one credit for `articleId` against the agency's usable package.
 * Must run inside a transaction (the advisory lock is transaction-scoped).
 * Idempotent per article.
 */
export async function chargePublishInTx(
  tx: CreditTx,
  params: { publisherId: string; articleId: string; performedBy: string | null; note?: string },
): Promise<ChargeOutcome> {
  const { publisherId, articleId, performedBy, note } = params;
  const now = new Date();

  // Serialize concurrent charges for the same article (double click, publish
  // racing the scheduler) so the ledger check below is reliable.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"publisher-credit:" + articleId}))`);

  const [ledger] = await tx
    .select({
      net: sql<number>`COALESCE(SUM(CASE ${publisherCreditLogs.actionType}
        WHEN 'credit_used' THEN 1 WHEN 'credit_settled' THEN 1
        WHEN 'credit_refunded' THEN -1 ELSE 0 END), 0)::int`,
    })
    .from(publisherCreditLogs)
    .where(eq(publisherCreditLogs.articleId, articleId));
  if (Number(ledger?.net ?? 0) > 0) return "already_charged";

  const [credit] = await tx
    .select()
    .from(publisherCredits)
    .where(
      and(
        eq(publisherCredits.publisherId, publisherId),
        eq(publisherCredits.isActive, true),
        // باقة تجديد مفعلة مسبقًا لا تُستهلك قبل موعد بدايتها
        lte(publisherCredits.startDate, now),
        or(
          eq(publisherCredits.isUnlimited, true),
          sql`${publisherCredits.remainingCredits} > 0`,
        ),
        or(
          isNull(publisherCredits.expiryDate),
          gte(publisherCredits.expiryDate, now),
        ),
      ),
    )
    .orderBy(desc(publisherCredits.isUnlimited), asc(publisherCredits.expiryDate))
    .limit(1);

  if (!credit) return "no_credits";

  // الباقة المفتوحة: إحصاء الاستخدام فقط دون إنقاص الرصيد
  if (credit.isUnlimited) {
    await tx
      .update(publisherCredits)
      .set({
        usedCredits: sql`${publisherCredits.usedCredits} + 1`,
        updatedAt: now,
      })
      .where(eq(publisherCredits.id, credit.id));

    await tx.insert(publisherCreditLogs).values({
      publisherId,
      creditPackageId: credit.id,
      articleId,
      actionType: "credit_used",
      creditsBefore: credit.remainingCredits,
      creditsChanged: 0,
      creditsAfter: credit.remainingCredits,
      performedBy,
      notes: note ? `نشر خبر ضمن باقة مفتوحة: ${note}` : "نشر خبر ضمن باقة مفتوحة",
    });

    return "deducted";
  }

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
    notes: note ? `تم خصم رصيد مقابل نشر خبر: ${note}` : "تم خصم رصيد مقابل نشر خبر",
  });

  return "deducted";
}

/**
 * The agency to charge for an article: its `publisher_id` stamp first, then
 * the author's agency (owner or linked member). Inactive agencies are skipped.
 */
async function resolveChargeablePublisher(
  articleId: string,
  authorUserId: string | null | undefined,
): Promise<string | null> {
  const [article] = await db
    .select({ publisherId: articles.publisherId })
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);

  let publisherId = article?.publisherId ?? null;
  if (!publisherId && authorUserId) {
    const [owned] = await db
      .select({ id: publishers.id })
      .from(publishers)
      .where(eq(publishers.userId, authorUserId))
      .limit(1);
    if (owned) {
      publisherId = owned.id;
    } else {
      const [member] = await db
        .select({ linkedPublisherId: users.linkedPublisherId })
        .from(users)
        .where(eq(users.id, authorUserId))
        .limit(1);
      publisherId = member?.linkedPublisherId ?? null;
    }
  }
  if (!publisherId) return null;

  const [publisher] = await db
    .select({ id: publishers.id, isActive: publishers.isActive })
    .from(publishers)
    .where(eq(publishers.id, publisherId))
    .limit(1);
  return publisher?.isActive ? publisher.id : null;
}

/**
 * Charge one publishing credit for an article that has just been published,
 * if it belongs to an agency. Never throws — see module header.
 */
export async function deductPublisherCreditSafely(params: {
  authorUserId: string | null | undefined;
  articleId: string;
  actorId: string | null | undefined;
}): Promise<CreditDeductionResult> {
  const { authorUserId, articleId } = params;
  const actorId = params.actorId ?? null;

  let publisherId: string;
  try {
    const resolved = await resolveChargeablePublisher(articleId, authorUserId);
    if (!resolved) return { status: "not_publisher" };
    publisherId = resolved;
  } catch (error) {
    reconcileLog({ stage: "publisher_lookup", authorUserId, articleId, actorId }, error);
    return { status: "failed", publisherId: "unknown" };
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const outcome = await db.transaction((tx) =>
        chargePublishInTx(tx, { publisherId, articleId, performedBy: actorId }),
      );
      if (outcome === "no_credits") {
        // Business outcome, not an error — but the article IS going out
        // without a deduction, so it still needs to be visible.
        reconcileLog({ stage: "no_credits", publisherId, articleId, actorId });
        return { status: "no_credits", publisherId };
      }
      if (outcome === "already_charged") {
        return { status: "already_charged", publisherId };
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
