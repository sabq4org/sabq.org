/**
 * تبويب الغيابات في مركز مباراة البوابة — التبويب الافتراضي للمباراة القادمة
 * يجب أن يطابق مفتاح جلب /facts وإلا تظهر «لا غيابات» كذبًا.
 */
import { describe, expect, it } from "vitest";

/** يطابق منطق MatchCenter في SportsHub بعد إصلاح 2026-08-11. */
function defaultMatchCenterTab(isUpcoming: boolean): "absences" | "events" {
  return isUpcoming ? "absences" : "events";
}

function factsQueryEnabled(opts: {
  id: number | null;
  matchStarted: boolean;
  isUpcoming: boolean;
  tab: string;
}): boolean {
  const { id, matchStarted, isUpcoming, tab } = opts;
  return (
    id != null &&
    ((matchStarted && (tab === "events" || tab === "stats")) ||
      (isUpcoming && tab === "absences"))
  );
}

describe("sports portal match absences tab", () => {
  it("defaults upcoming matches to absences (not events)", () => {
    expect(defaultMatchCenterTab(true)).toBe("absences");
    expect(defaultMatchCenterTab(false)).toBe("events");
  });

  it("enables /facts for upcoming when tab is absences", () => {
    expect(
      factsQueryEnabled({ id: 1567327, matchStarted: false, isUpcoming: true, tab: "absences" }),
    ).toBe(true);
  });

  it("does not enable /facts for upcoming while tab stuck on events", () => {
    // هذا كان انحدار البوابة: الواجهة تعرض absences عبر activeKey وtab=events.
    expect(
      factsQueryEnabled({ id: 1567327, matchStarted: false, isUpcoming: true, tab: "events" }),
    ).toBe(false);
  });
});
