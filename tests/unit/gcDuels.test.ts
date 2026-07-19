import { describe, expect, it } from "vitest";
import {
  duelFixtureDisposition,
  duelRefundRecipientIds,
  evaluateDuelAcceptance,
  resolveDuel,
} from "../../server/services/gcMajlisLogic";

describe("GC duel resolution", () => {
  it.each([
    ["exact", "margin", "challenger"],
    ["outcome", "exact", "challenged"],
    ["none", "none", "refund"],
    ["margin", "margin", "refund"],
  ] as const)("%s vs %s -> %s", (challenger, challenged, expected) => {
    expect(resolveDuel(challenger, challenged)).toBe(expected);
  });

  it("treats one missing pick as a forfeit and both missing as a refund", () => {
    expect(resolveDuel(null, "none")).toBe("challenged");
    expect(resolveDuel("none", null)).toBe("challenger");
    expect(resolveDuel(null, null)).toBe("refund");
  });
});

describe("GC duel escrow release", () => {
  const fixture = (code: string, finished = false, home: number | null = null, away: number | null = null) => ({
    status: { code, label: code, elapsed: null, live: false, finished },
    goals: { home, away },
  });

  it.each(["CANC", "ABD", "PST", "WO", "AWD"])("refunds %s fixtures", (code) => {
    expect(duelFixtureDisposition(fixture(code, code === "WO" || code === "AWD"))).toBe("refund");
  });

  it("settles only an on-pitch final score and refunds a malformed final result", () => {
    expect(duelFixtureDisposition(fixture("FT", true, 2, 1))).toBe("settle");
    expect(duelFixtureDisposition(fixture("FT", true))).toBe("refund");
    expect(duelFixtureDisposition(fixture("NS"))).toBe("wait");
  });

  it("returns only the held challenger stake while pending and both stakes after acceptance", () => {
    expect(duelRefundRecipientIds({
      status: "pending",
      challengerId: "challenger",
      challengedId: "challenged",
    })).toEqual(["challenger"]);
    expect(duelRefundRecipientIds({
      status: "accepted",
      challengerId: "challenger",
      challengedId: "challenged",
    })).toEqual(["challenger", "challenged"]);
  });
});

describe("GC duel acceptance privacy gate", () => {
  const base = {
    nowMs: 1_000,
    storedExpiresAtMs: 2_000,
    currentKickoffMs: 2_000,
    live: false,
    finished: false,
    disposition: "wait" as const,
  };

  it("rejects a provider kickoff that has arrived even when stored expiry is later", () => {
    expect(evaluateDuelAcceptance({
      ...base,
      nowMs: 1_500,
      storedExpiresAtMs: 3_000,
      currentKickoffMs: 1_500,
    })).toEqual({ allowed: false, reason: "LOCKED" });
  });

  it("rejects live, finished, and non-settleable provider states", () => {
    expect(evaluateDuelAcceptance({ ...base, live: true })).toEqual({ allowed: false, reason: "LOCKED" });
    expect(evaluateDuelAcceptance({ ...base, finished: true })).toEqual({ allowed: false, reason: "LOCKED" });
    expect(evaluateDuelAcceptance({ ...base, disposition: "refund" })).toEqual({ allowed: false, reason: "LOCKED" });
  });

  it("adopts a later kickoff only before the original privacy gate expires", () => {
    expect(evaluateDuelAcceptance({
      ...base,
      currentKickoffMs: 4_000,
    })).toEqual({ allowed: true, expiresAtMs: 4_000, kickoffChanged: true });

    expect(evaluateDuelAcceptance({
      ...base,
      nowMs: 2_000,
      currentKickoffMs: 4_000,
    })).toEqual({ allowed: false, reason: "EXPIRED" });
  });

  it("synchronizes an earlier future kickoff and keeps an unchanged one stable", () => {
    expect(evaluateDuelAcceptance({ ...base, currentKickoffMs: 1_500 }))
      .toEqual({ allowed: true, expiresAtMs: 1_500, kickoffChanged: true });
    expect(evaluateDuelAcceptance(base))
      .toEqual({ allowed: true, expiresAtMs: 2_000, kickoffChanged: false });
  });
});
