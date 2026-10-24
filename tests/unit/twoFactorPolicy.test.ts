import { describe, expect, it } from "vitest";
import { smsSecondFactorAllowed } from "../../server/utils/twoFactorPolicy";

describe("smsSecondFactorAllowed", () => {
  it("refuses SMS for authenticator-only accounts", () => {
    expect(smsSecondFactorAllowed("authenticator", "password")).toBe(false);
    expect(smsSecondFactorAllowed(null, "password")).toBe(false);
  });

  it("refuses SMS when the first factor was the same phone's OTP", () => {
    expect(smsSecondFactorAllowed("sms", "phone")).toBe(false);
    expect(smsSecondFactorAllowed("both", "phone")).toBe(false);
  });

  it("allows SMS for sms/both accounts after a password or OAuth first factor", () => {
    expect(smsSecondFactorAllowed("sms", "password")).toBe(true);
    expect(smsSecondFactorAllowed("both", "oauth")).toBe(true);
    // جلسات قديمة بلا علامة العامل الأول تبقى على السلوك السابق للحسابات sms
    expect(smsSecondFactorAllowed("sms", undefined)).toBe(true);
  });
});
