// مصادقة webhook البريد الوارد ورمز النشر للمرسل الموثوق — منفصلة عن
// server/routes/emailAgent.ts لتُختبر دون تحميل مسار المعالجة كله.
import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";

/** مقارنة رمز النشر المرسل بالمخزَّن (غير حساسة لحالة الأحرف، زمن ثابت). */
export function emailTokenMatches(provided: string | null | undefined, stored: string | null | undefined): boolean {
  if (!provided || !stored) return false;
  const a = Buffer.from(provided.toLowerCase());
  const b = Buffer.from(stored.toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Shared-secret check for the SendGrid Inbound Parse webhook.
// SendGrid Inbound Parse does NOT sign its requests — it relies on URL
// obscurity. We add a shared-secret token check (URL query OR header)
// so anyone who guesses the URL still can't fabricate inbound mail.
//
// Set SENDGRID_INBOUND_SECRET on the backend, then configure SendGrid
// Inbound Parse with either:
//   - URL: https://api.sabq.org/api/email-agent/webhook?token=<secret>
//   - or a custom header X-Webhook-Token: <secret>
//
// (Security audit C6, 2026-05-11.)
export function verifyInboundWebhookSecret(req: Request): { ok: boolean; reason?: string } {
  const inboundSecret = process.env.SENDGRID_INBOUND_SECRET;
  if (!inboundSecret) {
    // The old fail-open compatibility window is closed in production:
    // failing OPEN here meant an unauthenticated endpoint that accepts file
    // uploads, writes to the database and spends GPT-4o Vision credit, gated
    // on nothing but URL obscurity. Outside production the permissive path
    // stays so local and preview runs don't need the secret.
    if (process.env.NODE_ENV === "production") {
      console.error("[Email Agent] CRITICAL: SENDGRID_INBOUND_SECRET not set — rejecting inbound webhook. Set this env var on the backend.");
      return { ok: false, reason: "webhook secret not configured" };
    }
    console.warn("[Email Agent] SENDGRID_INBOUND_SECRET not set — accepting unauthenticated webhook (non-production only).");
    return { ok: true };
  }
  const provided = String(req.query.token || req.get("x-webhook-token") || "");
  if (!provided) {
    return { ok: false, reason: "missing token" };
  }
  const a = Buffer.from(inboundSecret);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return { ok: false, reason: "token length mismatch" };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, reason: "invalid token" };
  return { ok: true };
}

// السر في الاستعلام/الترويسة، فيُفحص قبل multer: لا يُخزَّن جسم multipart
// في الذاكرة لطلب غير موثّق.
export function requireInboundWebhookSecret(req: Request, res: Response, next: NextFunction) {
  const secretCheck = verifyInboundWebhookSecret(req);
  if (!secretCheck.ok) {
    console.warn(`[Email Agent] Rejected inbound webhook: ${secretCheck.reason}`);
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}
