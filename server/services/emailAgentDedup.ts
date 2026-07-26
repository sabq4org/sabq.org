/**
 * Deduplication helpers for the Smart Mail (email-agent) inbound webhook.
 *
 * Two layers:
 * 1) Message-ID — blocks SendGrid webhook retries of the same MIME message.
 * 2) Content fingerprint (sender + normalized subject) — blocks a trusted
 *    sender resending the same story minutes/hours later as a new Message-ID.
 *
 * Incident 2026-07-26: gazwanss@gmail.com resent the same export story 6× in
 * ~23 minutes; Message-ID-only dedup let every copy publish.
 */
import crypto from "crypto";

export const DEFAULT_CONTENT_DEDUP_HOURS = 6;

export type EmailDedupReason = "duplicate_message" | "duplicate_content";

export type EmailDedupClaimResult =
  | { claimed: true; messageKey: string; contentKey: string }
  | { claimed: false; reason: EmailDedupReason; messageKey: string; contentKey: string };

/** Hours to block the same sender+subject after a successful claim. */
export function getContentDedupHours(): number {
  const raw = process.env.EMAIL_AGENT_CONTENT_DEDUP_HOURS;
  if (raw == null || raw === "") return DEFAULT_CONTENT_DEDUP_HOURS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_CONTENT_DEDUP_HOURS;
  return Math.min(n, 168); // cap at 7 days
}

/** Pull bare address from `"Name" <user@host>` or return trimmed lowercased input. */
export function extractEmailAddress(from: string): string {
  const raw = (from || "").trim();
  const match = raw.match(/<([^>]+)>/);
  return (match?.[1] || raw).trim().toLowerCase();
}

/**
 * Normalize subject for content fingerprinting.
 * Strips repeated Re:/Fwd:/Arabic reply prefixes and collapses whitespace.
 */
export function normalizeEmailSubject(subject: string): string {
  let s = (subject || "").trim();
  const prefix =
    /^(?:re|fw|fwd|رد|إعادة|اعادة|تحويل|إعادة\s*توجيه|اعادة\s*توجيه)\s*:\s*/i;
  for (let i = 0; i < 5 && prefix.test(s); i++) {
    s = s.replace(prefix, "").trim();
  }
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Primary key for webhook-retry dedup (Message-ID, or minute-bucket fallback). */
export function buildMessageDedupKey(
  messageId: string,
  from: string,
  subject: string,
  now: Date = new Date(),
): string {
  const mid = (messageId || "").trim();
  if (mid) return mid;
  const minuteBucket = now.toISOString().substring(0, 16);
  return `${extractEmailAddress(from)}_${normalizeEmailSubject(subject)}_${minuteBucket}`;
}

/** Stable id for sender+subject content dedup (`content:<sha256…>`). */
export function buildContentDedupKey(senderEmail: string, subject: string): string {
  const payload = `${extractEmailAddress(senderEmail)}|${normalizeEmailSubject(subject)}`;
  const hash = crypto.createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 40);
  return `content:${hash}`;
}

async function tryInsertProcessed(params: {
  id: string;
  messageId: string | null;
  subject: string;
  sender: string;
}): Promise<boolean> {
  const { db } = await import("../db");
  const { sql } = await import("drizzle-orm");
  const inserted = await db.execute(
    sql`INSERT INTO email_agent_processed (id, message_id, subject, sender)
        VALUES (
          ${params.id},
          ${params.messageId},
          ${params.subject.substring(0, 500)},
          ${params.sender.substring(0, 255)}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id`,
  );
  return (inserted.rows?.length ?? 0) > 0;
}

/**
 * Atomically claim message + content fingerprints.
 * Returns claimed:false if this webhook is a retry or a near-term content resend.
 */
export async function claimEmailDedup(params: {
  messageId: string;
  from: string;
  subject: string;
  contentDedupHours?: number;
  now?: Date;
}): Promise<EmailDedupClaimResult> {
  const { db } = await import("../db");
  const { sql } = await import("drizzle-orm");

  const now = params.now ?? new Date();
  const sender = extractEmailAddress(params.from);
  const normalizedSubject = normalizeEmailSubject(params.subject);
  const messageKey = buildMessageDedupKey(params.messageId, params.from, params.subject, now);
  const contentKey = buildContentDedupKey(sender, normalizedSubject);
  const messageId = (params.messageId || "").trim() || null;
  const hours = params.contentDedupHours ?? getContentDedupHours();
  const windowStart = new Date(now.getTime() - hours * 60 * 60 * 1000);

  // 1) Message-ID / minute-bucket — blocks SendGrid retries (atomic claim).
  const messageClaimed = await tryInsertProcessed({
    id: messageKey,
    messageId,
    subject: params.subject || normalizedSubject,
    sender,
  });
  if (!messageClaimed) {
    return { claimed: false, reason: "duplicate_message", messageKey, contentKey };
  }

  // Also match legacy rows that stored message_id separately from id.
  if (messageId) {
    const byMessageId = await db.execute(
      sql`SELECT id FROM email_agent_processed
          WHERE message_id = ${messageId} AND id <> ${messageKey}
          LIMIT 1`,
    );
    if ((byMessageId.rows?.length ?? 0) > 0) {
      return { claimed: false, reason: "duplicate_message", messageKey, contentKey };
    }
  }

  // 2) Content fingerprint — blocks same sender+subject within the window.
  const recentContent = await db.execute(
    sql`SELECT id, processed_at FROM email_agent_processed
        WHERE id = ${contentKey}
          AND processed_at >= ${windowStart}
        LIMIT 1`,
  );
  if ((recentContent.rows?.length ?? 0) > 0) {
    return { claimed: false, reason: "duplicate_content", messageKey, contentKey };
  }

  // Expired fingerprint: refresh timestamp and allow republish after the window.
  const contentClaimed = await tryInsertProcessed({
    id: contentKey,
    messageId,
    subject: normalizedSubject || params.subject,
    sender,
  });
  if (!contentClaimed) {
    const refreshed = await db.execute(
      sql`UPDATE email_agent_processed
          SET processed_at = ${now},
              message_id = COALESCE(${messageId}, message_id),
              subject = ${normalizedSubject.substring(0, 500)},
              sender = ${sender.substring(0, 255)}
          WHERE id = ${contentKey}
            AND processed_at < ${windowStart}
          RETURNING id`,
    );
    if ((refreshed.rows?.length ?? 0) === 0) {
      return { claimed: false, reason: "duplicate_content", messageKey, contentKey };
    }
  }

  return { claimed: true, messageKey, contentKey };
}
