import { describe, it, expect } from "vitest";
import {
  validatePassword,
  PASSWORD_MIN_LENGTH,
} from "../../server/utils/passwordPolicy";

describe("validatePassword — type and length", () => {
  it("rejects non-strings with the required-field message", () => {
    for (const bad of [undefined, null, 12345678, {}, []]) {
      const r = validatePassword(bad);
      expect(r.ok).toBe(false);
      expect(r.message).toBe("كلمة المرور مطلوبة");
    }
  });

  it(`rejects ${PASSWORD_MIN_LENGTH - 1} chars and accepts exactly ${PASSWORD_MIN_LENGTH}`, () => {
    expect(validatePassword("Xk9#mQ2").ok).toBe(false);
    expect(validatePassword("Xk9#mQ2v").ok).toBe(true);
  });

  it("accepts exactly 128 chars and rejects 129", () => {
    const base = "Xk9#mQ2v";
    expect(validatePassword(base.repeat(16)).ok).toBe(true); // 128
    expect(validatePassword(base.repeat(16) + "a").ok).toBe(false); // 129
  });
});

describe("validatePassword — banned list", () => {
  it("rejects banned passwords case-insensitively", () => {
    for (const banned of ["password", "PASSWORD", "P@ssw0rd", "QwErTy123"]) {
      const r = validatePassword(banned);
      expect(r.ok, banned).toBe(false);
      expect(r.message).toContain("شائعة");
    }
  });

  it("rejects the Sabq-specific banned set", () => {
    for (const banned of ["sabq1234", "SABQ2026", "sabqsabq"]) {
      expect(validatePassword(banned).ok, banned).toBe(false);
    }
  });

  it("accepts a strong unbanned password", () => {
    expect(validatePassword("Tr8$wq-Zx1").ok).toBe(true);
  });
});
