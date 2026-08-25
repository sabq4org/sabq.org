/**
 * موصل Bevatel SMS — https://sms-api.bevatel.com (مواصفة docsv1.json).
 *   POST /msgs/sms  { src, dests[], body, msgClass, secure, dlr }
 *   Authorization: Bearer <BEVATEL_API_KEY>
 *
 * البيئة: BEVATEL_API_KEY (إلزامي)، BEVATEL_SENDER_ID (اسم المرسل المعتمد، افتراضيًا SABQ)،
 * BEVATEL_API_BASE (اختياري لبيئة اختبار).
 *
 * ملاحظة: Bevatel يستقبل الأرقام بلا «+» (96654XXXXXXX) — نزيلها هنا.
 */
import type { SmsProvider, SmsSendResult } from "./types";

const DEFAULT_BASE = "https://sms-api.bevatel.com";
const TIMEOUT_MS = 10_000;

function pickMessageId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const p = payload as Record<string, any>;
  const direct = p.msgId ?? p.messageId ?? p.jobId ?? p.id;
  if (typeof direct === "string" || typeof direct === "number") return String(direct);
  const first = Array.isArray(p.msgs) ? p.msgs[0] : Array.isArray(p.messages) ? p.messages[0] : undefined;
  if (first && typeof first === "object") {
    const v = first.msgId ?? first.id;
    if (typeof v === "string" || typeof v === "number") return String(v);
  }
  return undefined;
}

export const bevatelProvider: SmsProvider = {
  name: "bevatel",
  isConfigured() {
    return Boolean(process.env.BEVATEL_API_KEY?.trim());
  },
  async send(to, body): Promise<SmsSendResult> {
    const apiKey = process.env.BEVATEL_API_KEY?.trim();
    if (!apiKey) return { ok: false, provider: "bevatel", error: "BEVATEL_API_KEY not configured" };
    const base = (process.env.BEVATEL_API_BASE?.trim() || DEFAULT_BASE).replace(/\/+$/, "");
    const src = process.env.BEVATEL_SENDER_ID?.trim() || "SABQ";
    const dest = to.replace(/^\+/, "").replace(/\D/g, "");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${base}/msgs/sms`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          src,
          dests: [dest],
          body,
          msgClass: "transactional",
          // secure: نص الرسالة مشفّر لدى المزوّد — مناسب لرموز التحقق.
          secure: true,
          dlr: true,
          // رموز OTP قصيرة العمر: لا فائدة من بقائها في الطابور أكثر من 10 دقائق.
          validity: 10,
          maxParts: 1,
        }),
        signal: controller.signal,
      });
      const text = await res.text();
      let payload: unknown = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = null;
      }
      if (!res.ok) {
        return {
          ok: false,
          provider: "bevatel",
          error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
        };
      }
      return { ok: true, provider: "bevatel", messageId: pickMessageId(payload) };
    } catch (err: any) {
      return {
        ok: false,
        provider: "bevatel",
        error: err?.name === "AbortError" ? "timeout" : String(err?.message || err),
      };
    } finally {
      clearTimeout(timer);
    }
  },
};
