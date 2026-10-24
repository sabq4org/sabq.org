import { describe, expect, it } from "vitest";
import { canUserLogin, getUserEffectiveStatus } from "../../shared/schema";

const base = {
  status: "active",
  deletedAt: null,
  bannedUntil: null,
  suspendedUntil: null,
  accountLocked: false,
  lockedUntil: null,
  emailVerified: true,
} as any;

const day = 24 * 60 * 60 * 1000;

describe("getUserEffectiveStatus / canUserLogin", () => {
  it("blocks a suspension until its end date, then lets the account back in", () => {
    const active = { ...base, status: "suspended", suspendedUntil: new Date(Date.now() + day) };
    expect(getUserEffectiveStatus(active)).toBe("suspended");
    expect(canUserLogin(active)).toBe(false);

    const expired = { ...base, status: "suspended", suspendedUntil: new Date(Date.now() - day) };
    expect(canUserLogin(expired)).toBe(true);
  });

  it("treats a suspension without an end date as indefinite", () => {
    const indefinite = { ...base, status: "suspended", suspendedUntil: null };
    expect(getUserEffectiveStatus(indefinite)).toBe("suspended");
    expect(canUserLogin(indefinite)).toBe(false);
  });
});
