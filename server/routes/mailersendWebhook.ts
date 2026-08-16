// MailerSend deliverability webhook (F-05).
//
// MailerSend POSTs activity events (hard bounces, spam complaints, …) here so we
// can suppress addresses that must not be emailed again. Mounted under the
// already-CSRF-exempt `/api/webhooks/` prefix. Gated on MAILERSEND_WEBHOOK_SECRET
// — if unset, the route rejects with a clear log (graceful-disable, like APNs /
// IndexNow), so nothing breaks when the secret isn't provisioned.
//
// Signing: MailerSend HMAC-SHA256's the raw request body with the webhook's
// signing secret and sends the hex digest in the `Signature` header.

import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { addEmailSuppression, type SuppressionReason } from "../services/emailSuppressionService";
import { log } from "../utils/logger";

const router: Router = Router();

function verifyMailerSendSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  const secret = process.env.MAILERSEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[MailerSend Webhook] MAILERSEND_WEBHOOK_SECRET not configured — rejecting webhook");
    return false;
  }
  if (!signatureHeader) {
    console.error("[MailerSend Webhook] Missing Signature header");
    return false;
  }

  const computed = crypto.createHmac("sha256", secret).update(rawBody).digest();
  const raw = signatureHeader.startsWith("sha256=") ? signatureHeader.slice(7) : signatureHeader;
  const received = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");

  if (computed.length !== received.length) return false;
  try {
    return crypto.timingSafeEqual(computed, received);
  } catch {
    return false;
  }
}

// Map MailerSend event types → our suppression reasons. Only permanent-negative
// signals suppress; transient (soft bounce, delivery delay) do NOT.
function suppressionReasonFor(eventType: string): SuppressionReason | null {
  switch (eventType) {
    case "activity.hard_bounced":
      return "hard_bounce";
    case "activity.spam_complaint":
      return "spam_complaint";
    case "activity.unsubscribed":
      return "unsubscribe";
    default:
      return null;
  }
}

router.post("/api/webhooks/mailersend", async (req: Request, res: Response) => {
  try {
    const rawBody: Buffer | undefined = (req as any).rawBody;
    if (!rawBody) {
      // The global express.json verify callback populates req.rawBody; without it
      // we cannot verify the signature, so refuse rather than trust the body.
      return res.status(400).json({ error: "raw body unavailable" });
    }

    const signature = (req.headers["signature"] || req.headers["Signature"]) as string | undefined;
    if (!verifyMailerSendSignature(rawBody, signature)) {
      return res.status(401).json({ error: "invalid webhook signature" });
    }

    // MailerSend delivers a single event: { type, data: { email: { recipient: { email } } } }.
    // Be tolerant of shape drift; extract event type + recipient defensively.
    const body: any = req.body || {};
    const eventType: string = body.type || body.event || "";
    const recipient: string | undefined =
      body?.data?.email?.recipient?.email ||
      body?.data?.recipient?.email ||
      body?.data?.email ||
      body?.email;

    const reason = suppressionReasonFor(eventType);
    if (reason && recipient) {
      await addEmailSuppression(recipient, reason, "mailersend_webhook", eventType);
      log.warn(`[MailerSend Webhook] suppressed a recipient (${eventType})`); // no PII
    }

    // Always 200 so MailerSend doesn't retry indefinitely on events we ignore.
    return res.json({ ok: true });
  } catch (err) {
    console.error("[MailerSend Webhook] handler error:", err);
    // Still 200 — a handler error must not make MailerSend hammer retries.
    return res.json({ ok: true });
  }
});

export default router;
