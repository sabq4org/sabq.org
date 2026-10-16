import { describe, expect, it } from "vitest";
import { dashboardBucket, overdueDays, overdueLabel } from "@shared/mawaeed/dashboard";

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
});
