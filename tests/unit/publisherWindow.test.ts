import { describe, expect, it } from "vitest";
import { effectivePublishingEndsAt } from "../../shared/publisherWindow";

const now = new Date("2026-11-20T12:00:00Z");
const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("publishing window follows the package", () => {
  it("uses the package expiry instead of a shorter stored window", () => {
    // روافد: باقة حتى 2027-12-31 ونافذة مخزنة حتى 2026-12-31
    expect(effectivePublishingEndsAt(d("2026-12-31"), [{ isActive: true, expiryDate: d("2027-12-31") }], now)).toEqual(d("2027-12-31"));
  });

  it("uses the package expiry instead of a longer stored window", () => {
    expect(effectivePublishingEndsAt(d("2027-11-18"), [{ isActive: true, expiryDate: d("2027-01-18") }], now)).toEqual(d("2027-01-18"));
  });

  it("extends to an activated renewal that starts later", () => {
    const pkgs = [
      { isActive: true, expiryDate: d("2027-01-18") },
      { isActive: true, expiryDate: d("2028-01-18") },
    ];
    expect(effectivePublishingEndsAt(null, pkgs, now)).toEqual(d("2028-01-18"));
  });

  it("ignores expired and cancelled packages and falls back to the stored window", () => {
    const pkgs = [
      { isActive: true, expiryDate: d("2025-12-26") },
      { isActive: false, expiryDate: d("2028-01-01") },
      { isActive: true, expiryDate: null },
    ];
    expect(effectivePublishingEndsAt(d("2026-12-31"), pkgs, now)).toEqual(d("2026-12-31"));
    expect(effectivePublishingEndsAt(null, pkgs, now)).toBeNull();
  });
});
