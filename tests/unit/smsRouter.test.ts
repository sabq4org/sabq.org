import { describe, expect, it } from "vitest";
import { orderProviders, sendSms } from "../../server/services/sms/smsRouter";
import type { SmsProvider } from "../../server/services/sms/types";

function fake(name: "bevatel" | "twilio", configured: boolean, ok = true): SmsProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    name,
    calls,
    isConfigured: () => configured,
    send: async (to) => {
      calls.push(to);
      return ok ? { ok: true, provider: name, messageId: `${name}-1` } : { ok: false, provider: name, error: "boom" };
    },
  };
}

describe("smsRouter", () => {
  it("bevatel first for Saudi numbers, twilio fallback", () => {
    const b = fake("bevatel", true), t = fake("twilio", true);
    expect(orderProviders("+966501234567", { providers: [b, t], env: {} }).map((p) => p.name)).toEqual(["bevatel", "twilio"]);
  });

  it("non-Saudi numbers skip bevatel as primary", () => {
    const b = fake("bevatel", true), t = fake("twilio", true);
    expect(orderProviders("+201001234567", { providers: [b, t], env: {} }).map((p) => p.name)).toEqual(["twilio", "bevatel"]);
  });

  it("SMS_PRIMARY_PROVIDER=twilio flips the order", () => {
    const b = fake("bevatel", true), t = fake("twilio", true);
    expect(
      orderProviders("+966501234567", { providers: [b, t], env: { SMS_PRIMARY_PROVIDER: "twilio" } }).map((p) => p.name),
    ).toEqual(["twilio", "bevatel"]);
  });

  it("falls back to the next provider when the first fails", async () => {
    const b = fake("bevatel", true, false), t = fake("twilio", true);
    const r = await sendSms("+966501234567", "hi", { providers: [b, t], env: {} });
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("twilio");
    expect(r.attempts.map((a) => a.provider)).toEqual(["bevatel", "twilio"]);
  });

  it("reports configured=false when nothing is set up", async () => {
    const r = await sendSms("+966501234567", "hi", { providers: [fake("bevatel", false), fake("twilio", false)], env: {} });
    expect(r.configured).toBe(false);
    expect(r.ok).toBe(false);
  });

  it("only-bevatel configured still serves non-Saudi numbers", async () => {
    const b = fake("bevatel", true);
    const r = await sendSms("+201001234567", "hi", { providers: [b, fake("twilio", false)], env: {} });
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("bevatel");
  });
});
