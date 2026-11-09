import { describe, expect, it } from "vitest";
import {
  applyOfficialWindow,
  hideFarFutureStart,
} from "../../server/services/sports/officialSchedule";

describe("applyOfficialWindow", () => {
  it("يستبدل تاريخ المزوّد القديم لكأس آسيا بالموعد الرسمي بعد التأجيل", () => {
    expect(applyOfficialWindow("asian-cup", "2027-01-07", "2027-01-20")).toEqual({
      start: "2027-12-23",
      end: "2028-01-21",
    });
  });

  it("يثبّت الموعد الرسمي حين لا يعيد المزوّد تاريخًا", () => {
    expect(applyOfficialWindow("asian-cup", null, null).start).toBe("2027-12-23");
  });

  it("يثق بالمزوّد متى لحق بالموعد الرسمي أو تجاوزه", () => {
    expect(applyOfficialWindow("asian-cup", "2027-12-23", "2028-01-21")).toEqual({
      start: "2027-12-23",
      end: "2028-01-21",
    });
    expect(applyOfficialWindow("asian-cup", "2028-06-01", "2028-07-01").start).toBe("2028-06-01");
  });

  it("لا يمسّ بطولة بلا موعد مثبّت", () => {
    expect(applyOfficialWindow("pro-league", "2026-08-13", "2027-05-20")).toEqual({
      start: "2026-08-13",
      end: "2027-05-20",
    });
  });
});

describe("hideFarFutureStart", () => {
  const now = new Date("2026-11-09T20:00:00Z").getTime();

  it("يحجب بداية أبعد من 60 يومًا حتى لا يظهر عدّاد بمئات الأيام", () => {
    const [row] = hideFarFutureStart([{ slug: "asian-cup", start: "2027-12-23", end: "2028-01-21" }], now);
    expect(row.start).toBeNull();
    expect(row.end).toBe("2028-01-21");
  });

  it("يُبقي بداية قريبة أو ماضية كما هي", () => {
    const rows = hideFarFutureStart(
      [
        { slug: "a", start: "2026-12-20" },
        { slug: "b", start: "2026-08-11" },
        { slug: "c", start: null },
      ],
      now,
    );
    expect(rows.map((r) => r.start)).toEqual(["2026-12-20", "2026-08-11", null]);
  });

  it("يعيد التاريخ تلقائيًا عند دخول نافذة الستين يومًا", () => {
    const near = new Date("2027-10-25T00:00:00Z").getTime();
    expect(hideFarFutureStart([{ start: "2027-12-23" }], near)[0].start).toBe("2027-12-23");
  });
});
