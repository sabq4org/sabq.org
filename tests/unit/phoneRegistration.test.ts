import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));

import {
  hasRealEmail,
  isSyntheticPhoneEmail,
  SYNTHETIC_PHONE_EMAIL_DOMAIN,
} from "../../shared/authEmail";
import {
  EMAIL_FORMAT_REGEX,
  phoneAccountNeedsCompletion,
} from "../../server/services/phoneRegistrationService";

describe("shared/authEmail — synthetic phone email rule", () => {
  it("recognizes the historical synthetic pattern", () => {
    expect(isSyntheticPhoneEmail("p966558623783@phone.sabq.org")).toBe(true);
    expect(isSyntheticPhoneEmail("P966558623783@PHONE.SABQ.ORG")).toBe(true);
    expect(isSyntheticPhoneEmail(`x${SYNTHETIC_PHONE_EMAIL_DOMAIN}`)).toBe(true);
  });

  it("does not flag real addresses (even ones containing digits)", () => {
    expect(isSyntheticPhoneEmail("user@gmail.com")).toBe(false);
    expect(isSyntheticPhoneEmail("p966558623783@gmail.com")).toBe(false);
    expect(isSyntheticPhoneEmail("phone.sabq.org@gmail.com")).toBe(false);
    expect(isSyntheticPhoneEmail(null)).toBe(false);
    expect(isSyntheticPhoneEmail(undefined)).toBe(false);
    expect(isSyntheticPhoneEmail("")).toBe(false);
  });

  it("hasRealEmail: real address only — synthetic and missing are not real", () => {
    expect(hasRealEmail("user@gmail.com")).toBe(true);
    expect(hasRealEmail("p966558623783@phone.sabq.org")).toBe(false);
    expect(hasRealEmail(null)).toBe(false);
    expect(hasRealEmail("   ")).toBe(false);
  });
});

describe("phoneAuth re-export stays in sync with shared", () => {
  it("re-exports the same implementation", async () => {
    const phoneAuth = await import("../../server/services/phoneAuth");
    expect(phoneAuth.isSyntheticPhoneEmail).toBe(isSyntheticPhoneEmail);
  });
});

describe("phoneRegistrationService — pure helpers", () => {
  it("EMAIL_FORMAT_REGEX accepts normal addresses and rejects garbage", () => {
    expect(EMAIL_FORMAT_REGEX.test("user@example.com")).toBe(true);
    expect(EMAIL_FORMAT_REGEX.test("user.name+tag@sub.example.org")).toBe(true);
    expect(EMAIL_FORMAT_REGEX.test("no-at-sign")).toBe(false);
    expect(EMAIL_FORMAT_REGEX.test("a@b")).toBe(false);
    expect(EMAIL_FORMAT_REGEX.test("سبق@مثال")).toBe(false);
    expect(EMAIL_FORMAT_REGEX.test("a b@c.com")).toBe(false);
  });

  it("phoneAccountNeedsCompletion: only phone-provider accounts, missing email or password", () => {
    // حساب جوال قديم ببريد اصطناعي وبلا كلمة مرور → يحتاج استكمالًا
    expect(
      phoneAccountNeedsCompletion({
        email: "p966558623783@phone.sabq.org",
        passwordHash: null,
        authProvider: "phone",
      }),
    ).toBe(true);

    // حساب جوال جديد (بريد فارغ) → يحتاج استكمالًا
    expect(
      phoneAccountNeedsCompletion({ email: null, passwordHash: null, authProvider: "phone" }),
    ).toBe(true);

    // حساب جوال أكمل بريده لكن بلا كلمة مرور → ما يزال ناقصًا
    expect(
      phoneAccountNeedsCompletion({
        email: "user@gmail.com",
        passwordHash: null,
        authProvider: "phone",
      }),
    ).toBe(true);

    // حساب جوال مكتمل → لا
    expect(
      phoneAccountNeedsCompletion({
        email: "user@gmail.com",
        passwordHash: "$2b$12$hash",
        authProvider: "phone",
      }),
    ).toBe(false);

    // حسابات بريد/OAuth لا يشملها الاستكمال حتى لو بلا كلمة مرور
    expect(
      phoneAccountNeedsCompletion({ email: "user@gmail.com", passwordHash: null, authProvider: "google" }),
    ).toBe(false);
    expect(
      phoneAccountNeedsCompletion({ email: "user@gmail.com", passwordHash: "$2b$12$h", authProvider: "local" }),
    ).toBe(false);
  });
});
