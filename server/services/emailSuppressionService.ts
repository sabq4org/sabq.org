// Email deliverability suppression (F-05).
//
// Before the audit there was NO suppression handling: an address that hard-
// bounced or filed a spam complaint was retried on every verification / reset /
// resend, silently degrading the sending domain's reputation, and send failures
// were console-only with no signal. This service backs a local suppression list
// (populated by the MailerSend webhook, see server/routes/mailersendWebhook.ts)
// and a pre-send check used by server/services/email.ts.
//
// ADR-001: DB access for this feature lives here, not in the route module.

import { eq } from "drizzle-orm";
import { db } from "../db";
import { emailSuppressions } from "@shared/schema";
import { log } from "../utils/logger";

export type SuppressionReason =
  | "hard_bounce"
  | "spam_complaint"
  | "unsubscribe"
  | "manual";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** True if the address is on the suppression list and should NOT be emailed. */
export async function isEmailSuppressed(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  try {
    const [row] = await db
      .select({ email: emailSuppressions.email })
      .from(emailSuppressions)
      .where(eq(emailSuppressions.email, normalizeEmail(email)))
      .limit(1);
    return Boolean(row);
  } catch (err) {
    // Fail OPEN: a suppression-store read error must never block a legitimate
    // send (e.g. table not yet migrated on a fresh env). Log and allow.
    log.warn(`[EmailSuppression] lookup failed (allowing send): ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

/** Add (or refresh) a suppression entry. Idempotent upsert on the email PK. */
export async function addEmailSuppression(
  email: string,
  reason: SuppressionReason,
  source: string,
  detail?: string,
): Promise<void> {
  const normalized = normalizeEmail(email);
  await db
    .insert(emailSuppressions)
    .values({ email: normalized, reason, source, detail: detail ?? null })
    .onConflictDoUpdate({
      target: emailSuppressions.email,
      set: { reason, source, detail: detail ?? null, createdAt: new Date() },
    });
  log.info(`[EmailSuppression] suppressed (${reason}/${source})`); // no PII in the log
}

/** Remove an address from the suppression list (admin recovery / false positive). */
export async function removeEmailSuppression(email: string): Promise<void> {
  await db.delete(emailSuppressions).where(eq(emailSuppressions.email, normalizeEmail(email)));
}
