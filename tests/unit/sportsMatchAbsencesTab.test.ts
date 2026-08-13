/**
 * تبويب الغيابات في مركز مباراة البوابة — التبويب الافتراضي للمباراة القادمة
 * يجب أن يطابق مفتاح جلب /facts وإلا تظهر «لا غيابات» كذبًا.
 */
import { describe, expect, it } from "vitest";
import { defaultMatchCenterTab } from "@/components/sports/matchCenterTabs";

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

  it("defaults to lineups when kickoff is within 15 minutes", () => {
    expect(defaultMatchCenterTab(true, 3 * 60_000)).toBe("lineups");
    expect(defaultMatchCenterTab(true, 20 * 60_000)).toBe("absences");
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
