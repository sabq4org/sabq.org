import { describe, expect, it } from "vitest";
import { confirmBlockedReason, dashboardBucket, isStaleWrite, overdueDays, overdueLabel } from "@shared/mawaeed/dashboard";

const base = { startsOn: "2026-10-10", endsOn: null, status: "scheduled", certainty: "unverified", published: true };
const today = "2026-10-16";

describe("mawaeed dashboard buckets", () => {
  it("keeps a passed, unresolved date in attention with its days overdue", () => {
    expect(dashboardBucket(base, today)).toBe("attention");
    expect(overdueDays(base, today)).toBe(6);
    expect(overdueLabel(6)).toBe("متأخر 6 أيام");
    expect(overdueDays({ ...base, certainty: "expected", published: false }, today)).toBe(6);
  });

  it("archives public, cancelled and superseded dates normally", () => {
    for (const row of [
      { ...base, certainty: "confirmed" },
      { ...base, status: "cancelled" },
      { ...base, status: "superseded" },
    ]) {
      expect(dashboardBucket(row, today)).toBe("past");
      expect(overdueDays(row, today)).toBeNull();
    }
  });

  it("treats an ongoing range as current, not overdue", () => {
    const ongoing = { ...base, startsOn: "2026-10-14", endsOn: "2026-10-18" };
    expect(dashboardBucket(ongoing, today)).toBe("attention");
    expect(overdueDays(ongoing, today)).toBeNull();
    expect(dashboardBucket({ ...ongoing, certainty: "confirmed" }, today)).toBe("upcoming");
    expect(dashboardBucket({ ...base, startsOn: today }, today)).toBe("attention");
    expect(overdueDays({ ...base, startsOn: today }, today)).toBeNull();
  });

  it("archives a cancelled or superseded range once it has started", () => {
    const range = { ...base, startsOn: "2026-10-14", endsOn: "2026-10-18" };
    expect(dashboardBucket({ ...range, status: "cancelled" }, today)).toBe("past");
    expect(dashboardBucket({ ...range, status: "superseded" }, today)).toBe("past");
  });

  it("blocks the one-click confirm on cancelled and superseded rows only", () => {
    expect(confirmBlockedReason({ status: "scheduled" })).toBeNull();
    expect(confirmBlockedReason({ status: "cancelled" })).toContain("ملغى");
    expect(confirmBlockedReason({ status: "superseded" })).toContain("مستبدل");
  });

  it("flags a stale write only when both stamps exist and differ", () => {
    const current = "2026-10-16T10:00:00.000Z";
    expect(isStaleWrite(current, current)).toBe(false);
    expect(isStaleWrite("2026-10-16T10:00:00+00:00", current)).toBe(false);
    expect(isStaleWrite("2026-10-16T09:59:00.000Z", current)).toBe(true);
    expect(isStaleWrite(null, current)).toBe(false);
    expect(isStaleWrite(undefined, current)).toBe(false);
    expect(isStaleWrite("garbage", current)).toBe(false);
  });
});
