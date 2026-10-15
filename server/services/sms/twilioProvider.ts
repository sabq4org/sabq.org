/**
 * موصل Twilio (Messages API — لا Verify). يُستخدم كمسار تراجع ولأرقام خارج السعودية.
 * البيئة: TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN، ومصدر الإرسال أحدهما:
 *   TWILIO_MESSAGING_SERVICE_SID (مفضّل) أو TWILIO_SMS_FROM (رقم/اسم مرسل).
 */
import type { SmsProvider, SmsSendResult } from "./types";

function fromConfig(): { messagingServiceSid?: string; from?: string } | null {
  const msid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  if (msid) return { messagingServiceSid: msid };
  const from = process.env.TWILIO_SMS_FROM?.trim();
  if (from) return { from };
  return null;
}

export const twilioProvider: SmsProvider = {
  name: "twilio",
  isConfigured() {
    return Boolean(
      process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim() && fromConfig(),
    );
  },
  async send(to, body): Promise<SmsSendResult> {
    const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const token = process.env.TWILIO_AUTH_TOKEN?.trim();
    const source = fromConfig();
    if (!sid || !token || !source) {
      return { ok: false, provider: "twilio", error: "Twilio SMS not configured" };
    }
    try {
      const { default: twilio } = await import("twilio");
      const client = twilio(sid, token);
      const msg = await client.messages.create({ to, body, ...source });
      const failed = msg.status === "failed" || msg.status === "undelivered";
      return failed
        ? { ok: false, provider: "twilio", messageId: msg.sid, error: `status=${msg.status}` }
        : { ok: true, provider: "twilio", messageId: msg.sid };
    } catch (err: any) {
      return { ok: false, provider: "twilio", error: `${err?.code ?? ""} ${err?.message ?? err}`.trim() };
    }
  },
};
