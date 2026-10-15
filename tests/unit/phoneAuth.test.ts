import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));

import {
  isReaderLikeRole,
  isStaffPhoneRole,
  normalizePhone,
  normalizeSaudiPhone,
  phoneCandidates,
  phoneMatchDigits,
  pickPreferredPhoneUser,
} from "../../server/services/phoneAuth";

describe("normalizePhone / normalizeSaudiPhone", () => {
  it("normalizes common Saudi formats to E.164", () => {
    expect(normalizeSaudiPhone("564255999")).toBe("+966564255999");
    expect(normalizeSaudiPhone("0564255999")).toBe("+966564255999");
    expect(normalizeSaudiPhone("966564255999")).toBe("+966564255999");
    expect(normalizeSaudiPhone("+966 56 425 5999")).toBe("+966564255999");
    expect(normalizePhone("564255999")).toBe("+966564255999");
  });

  it("rejects invalid Saudi numbers", () => {
    expect(normalizeSaudiPhone("123")).toBeNull();
    expect(normalizeSaudiPhone("412345678")).toBeNull();
  });
});

describe("phoneCandidates", () => {
  it("covers legacy storage formats for a Saudi E.164 number", () => {
    const c = phoneCandidates("+966564255999");
    expect(c).toEqual(expect.arrayContaining([
      "+966564255999",
      "966564255999",
      "0564255999",
      "564255999",
    ]));
  });
});

describe("phoneMatchDigits", () => {
  it("accepts Saudi local storage forms only for +966 numbers", () => {
    expect(phoneMatchDigits("+966564255999")).toEqual(expect.arrayContaining([
      "966564255999",
      "00966564255999",
      "0564255999",
      "564255999",
    ]));
  });

  it("never matches a foreign number to a Saudi account by its last 9 digits", () => {
    const foreign = phoneMatchDigits("+1202564255999");
    expect(foreign).toEqual(["1202564255999", "001202564255999"]);
    expect(foreign).not.toContain("564255999");
    expect(foreign).not.toContain("966564255999");
    expect(phoneMatchDigits("+966564255999")).not.toContain("1202564255999");
  });
});

describe("staff vs reader phone preference", () => {
  it("recognizes staff and reader-like roles", () => {
    expect(isStaffPhoneRole("reporter")).toBe(true);
    expect(isStaffPhoneRole("opinion_author")).toBe(true);
    expect(isStaffPhoneRole("reader")).toBe(false);
    expect(isReaderLikeRole("reader")).toBe(true);
    expect(isReaderLikeRole("subscriber")).toBe(true);
    expect(isReaderLikeRole("reporter")).toBe(false);
  });

  it("prefers staff over reader when the same phone matches both", () => {
    const preferred = pickPreferredPhoneUser([
      { id: "reader-1", role: "reader", isStaff: false, phoneVerified: true, createdAt: new Date("2024-01-01") },
      { id: "reporter-1", role: "reporter", isStaff: true, phoneVerified: false, createdAt: new Date("2025-01-01") },
    ]);
    expect(preferred?.id).toBe("reporter-1");
  });
});
