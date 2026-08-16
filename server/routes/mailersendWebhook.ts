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
  // ALWAYS respond 2xx. MailerSend sends a test request when the webhook is
  // CREATED/UPDATED and refuses to save it unless the endpoint returns 2xx — but
  // at creation time the signing secret it just generated isn't on our server
  // yet (chicken-and-egg), so a strict 401 made webhook creation fail silently.
  // Security is preserved by gating the only side effect (addEmailSuppression)
  // behind a successful signature check: an unverified request gets 200 but does
  // NOTHING. This also stops MailerSend retry-storms on events we ignore.
  try {
    const rawBody: Buffer | undefined = (req as any).rawBody;
    const signature = (req.headers["signature"] || req.headers["Signature"]) as string | undefined;
    const verified = !!rawBody && verifyMailerSendSignature(rawBody, signature);

    if (!verified) {
      // Setup verification test, missing secret, or a forged/unsigned request:
      // acknowledge so the webhook can be saved, but take no action.
      log.warn("[MailerSend Webhook] unverified request acknowledged (no action taken)");
      return res.json({ ok: true, verified: false });
    }

    // Extract event type + recipient defensively — MailerSend uses more than one
    // shape. Real activity events nest it as data.email.recipient.email, while
    // the "Test webhook" (and some payloads) put it as a PLAIN STRING at
    // data.recipient. The original code only handled the nested object form, so
    // recipient came back undefined and NO row was created even on a verified
    // event. Handle string-or-object at every level.
    const body: any = req.body || {};
    const eventType: string = body.type || body.event || "";
    const d: any = body.data ?? {};
    const asEmail = (v: any): string | undefined =>
      typeof v === "string" ? v : typeof v?.email === "string" ? v.email : undefined;
    const recipient: string | undefined =
      asEmail(d.recipient) ||
      asEmail(d?.email?.recipient) ||
      asEmail(d.email) ||
      asEmail(body.recipient) ||
      asEmail(body.email);

    const reason = suppressionReasonFor(eventType);
    if (reason && recipient) {
      await addEmailSuppression(recipient, reason, "mailersend_webhook", eventType);
      log.warn(`[MailerSend Webhook] suppressed a recipient (${eventType})`); // no PII
    }

    return res.json({ ok: true, verified: true });
  } catch (err) {
    console.error("[MailerSend Webhook] handler error:", err);
    // Still 200 — a handler error must not make MailerSend hammer retries.
    return res.json({ ok: true });
  }
});

export default router;
