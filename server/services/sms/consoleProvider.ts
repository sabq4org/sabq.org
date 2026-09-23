/**
 * موصل تطويري: يطبع الرسالة في السجل بدل إرسالها.
 * يعمل فقط حين SMS_DEV_CONSOLE=true وخارج الإنتاج — لاختبار تدفقات OTP محليًا
 * (توثيق الجوال، الدخول بالجوال) دون مفاتيح Bevatel/Twilio.
 */
import type { SmsProvider, SmsSendResult } from "./types";

export const consoleProvider: SmsProvider = {
  name: "console",
  isConfigured() {
    return process.env.SMS_DEV_CONSOLE === "true" && process.env.NODE_ENV !== "production";
  },
  async send(to, body): Promise<SmsSendResult> {
    console.log(`[sms:console] → ${to}\n${body}`);
    return { ok: true, provider: "console" };
  },
};
