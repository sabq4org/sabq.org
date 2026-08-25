import { beforeEach, describe, expect, it, vi } from "vitest";

const sent: Array<{ to: string; body: string }> = [];
let routerBehaviour: "ok" | "fail" | "unconfigured" = "ok";

vi.mock("../../server/redis", () => ({ getRedisSessionAdapter: () => null }));
vi.mock("../../server/services/sms/smsRouter", () => ({
  maskPhone: (p: string) => p,
  sendSms: async (to: string, body: string) => {
    sent.push({ to, body });
    if (routerBehaviour === "unconfigured") return { ok: false, configured: false, provider: "bevatel", attempts: [] };
    if (routerBehaviour === "fail") return { ok: false, configured: true, provider: "bevatel", attempts: [], error: "x" };
    return { ok: true, configured: true, provider: "bevatel", attempts: [] };
  },
}));

import {
  __resetOtpMemory,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  sendOtp,
  verifyOtp,
} from "../../server/services/otpService";

const PHONE = "+966501234567";
const codeFromBody = (body: string) => body.match(/#(\d{6})/)![1];

describe("otpService", () => {
  beforeEach(() => {
    __resetOtpMemory();
    sent.length = 0;
    routerBehaviour = "ok";
    vi.useRealTimers();
  });

  it("sends a 6-digit code with the sabq.org autofill line and verifies it once", async () => {
    const r = await sendOtp(PHONE, "login");
    expect(r.success).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(PHONE);
    expect(sent[0].body).toMatch(/@sabq\.org #\d{6}$/);
    const code = codeFromBody(sent[0].body);
    expect((await verifyOtp(PHONE, code, "login")).valid).toBe(true);
    // one-time use
    const again = await verifyOtp(PHONE, code, "login");
    expect(again.valid).toBe(false);
    expect(again.notFound).toBe(true);
  });

  it("purposes are isolated", async () => {
    await sendOtp(PHONE, "login");
    const code = codeFromBody(sent[0].body);
    expect((await verifyOtp(PHONE, code, "2fa")).valid).toBe(false);
    expect((await verifyOtp(PHONE, code, "login")).valid).toBe(true);
  });

  it("locks the code after max wrong attempts", async () => {
    await sendOtp(PHONE, "login");
    const code = codeFromBody(sent[0].body);
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      expect((await verifyOtp(PHONE, "000000", "login")).valid).toBe(false);
    }
    const r = await verifyOtp(PHONE, code, "login");
    expect(r.valid).toBe(false);
    expect(r.notFound).toBe(true);
  });

  it("enforces resend cooldown then allows after it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T10:00:00Z"));
    expect((await sendOtp(PHONE, "login")).success).toBe(true);
    const blocked = await sendOtp(PHONE, "login");
    expect(blocked.success).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    vi.setSystemTime(new Date(Date.now() + (OTP_RESEND_COOLDOWN_SECONDS + 1) * 1000));
    expect((await sendOtp(PHONE, "login")).success).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it("does not store a code when sending fails", async () => {
    routerBehaviour = "fail";
    const r = await sendOtp(PHONE, "login");
    expect(r.success).toBe(false);
    expect(r.configured).toBe(true);
    const v = await verifyOtp(PHONE, "123456", "login");
    expect(v.notFound).toBe(true);
  });

  it("reports configured=false so callers can fall back to legacy Verify", async () => {
    routerBehaviour = "unconfigured";
    const r = await sendOtp(PHONE, "2fa");
    expect(r.success).toBe(false);
    expect(r.configured).toBe(false);
  });
});
