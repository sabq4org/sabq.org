import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));
import {
  DEFAULT_DUTY_THRESHOLDS,
  buildDeskItems,
  buildPresenceCells,
  computeShiftReport,
  coverageGaps,
  expandOccurrences,
  liveStatus,
  riyadhMidnight,
  riyadhWeekday,
  summarizePresence,
  attributeUnclaimedPublishes,
  workCountFrom,
  validateShiftInput,
  type ActivityKind,
  type DeskArticle,
  type DutyShiftRule,
} from "../../shared/contentDuty";
import { legacyRosterToShifts } from "../../server/services/contentDuty/dutyRosterStore";
import { activityKindFor } from "../../server/services/contentDuty/staffActivityRecorder";

const MIN = 60_000;
// الخميس 26 نوفمبر 2026 بتوقيت الرياض
const THU = "2026-11-26";
const thuMidnight = riyadhMidnight(THU);

describe("calendar", () => {
  it("knows Riyadh weekdays (Sunday = 0)", () => {
    expect(riyadhWeekday(THU)).toBe(4);
    expect(riyadhWeekday("2026-11-22")).toBe(0);
  });

  it("validates shifts", () => {
    expect(validateShiftInput({ days: [4], startMinute: 1200, endMinute: 120 })).toBeNull();
    expect(validateShiftInput({ days: [4], startMinute: 600, endMinute: 600 })).not.toBeNull();
    expect(validateShiftInput({ days: [], startMinute: 0, endMinute: 60 })).not.toBeNull();
  });
});

describe("expandOccurrences", () => {
  const night: DutyShiftRule = { id: "fahad", userId: "fahad", days: [4, 5, 6], startMinute: 20 * 60, endMinute: 2 * 60 };
  const amjad: DutyShiftRule = { id: "amjad", userId: "amjad", days: [0, 1, 2, 3, 4, 5, 6], startMinute: 20 * 60, endMinute: 2 * 60 };

  it("carries an overnight shift past midnight", () => {
    const occ = expandOccurrences([night], [], thuMidnight, thuMidnight + 30 * 60 * MIN);
    expect(occ).toHaveLength(1);
    expect(occ[0].dutyDate).toBe(THU);
    expect(occ[0].end - occ[0].start).toBe(6 * 60 * MIN);
    expect(occ[0].start).toBe(thuMidnight + 20 * 60 * MIN);
  });

  it("drops a leave and swaps in the cover", () => {
    const leave = expandOccurrences([amjad], [{ id: "e", dutyDate: THU, userId: "amjad", coverUserId: null }], thuMidnight, thuMidnight + 24 * 60 * MIN);
    expect(leave.find((o) => o.dutyDate === THU)).toBeUndefined();
    const cover = expandOccurrences([amjad], [{ id: "e", dutyDate: THU, userId: "amjad", coverUserId: "fahad" }], thuMidnight, thuMidnight + 24 * 60 * MIN);
    const thu = cover.find((o) => o.dutyDate === THU);
    expect(thu?.userId).toBe("fahad");
    expect(thu?.coveredUserId).toBe("amjad");
  });

  it("lets two managers share the same hours", () => {
    const fri = riyadhMidnight("2026-11-27");
    const occ = expandOccurrences([night, amjad], [], fri + 21 * 60 * MIN, fri + 22 * 60 * MIN);
    expect(occ.map((o) => o.userId).sort()).toEqual(["amjad", "fahad"]);
  });

  it("finds uncovered hours", () => {
    const sunday = "2026-11-22";
    const sun = riyadhMidnight(sunday);
    const shift: DutyShiftRule = { id: "d", userId: "d", days: [0], startMinute: 8 * 60, endMinute: 14 * 60 };
    const occ = expandOccurrences([shift], [], sun - 24 * 60 * MIN, sun + 8 * 24 * 60 * MIN);
    const gaps = coverageGaps(occ, sunday).filter((g) => g.dutyDate === sunday);
    expect(gaps).toEqual([
      { dutyDate: sunday, startMinute: 0, endMinute: 480 },
      { dutyDate: sunday, startMinute: 840, endMinute: 1440 },
    ]);
  });
});

describe("presence", () => {
  const occ = { start: thuMidnight + 8 * 60 * MIN, end: thuMidnight + 9 * 60 * MIN };
  const minutes = new Map<number, ActivityKind>();
  // يبدأ متأخرًا 10 دقائق، يعمل 20 دقيقة، يغيب 20، يتصل فقط 10
  for (let m = 10; m < 30; m++) minutes.set(occ.start + m * MIN, "action");
  for (let m = 50; m < 60; m++) minutes.set(occ.start + m * MIN, "view");

  it("builds 5-minute cells and future cells", () => {
    const cells = buildPresenceCells(occ, minutes, occ.start + 40 * MIN);
    expect(cells).toHaveLength(12);
    expect(cells.slice(0, 2)).toEqual(["absent", "absent"]);
    expect(cells[2]).toBe("action");
    expect(cells.slice(8)).toEqual(["future", "future", "future", "future"]);
  });

  it("summarizes late start, longest gap and presence", () => {
    const now = occ.end + MIN;
    const cells = buildPresenceCells(occ, minutes, now);
    const s = summarizePresence(occ, cells, minutes, now);
    expect(s.lateStartMin).toBe(10);
    expect(s.longestGap?.minutes).toBe(20);
    expect(s.presentPct).toBe(50);
    expect(s.earlyLeaveMin).toBe(0);
  });

  it("reports live status from the last 10 minutes", () => {
    expect(liveStatus(minutes, occ.start + 25 * MIN)).toBe("active");
    expect(liveStatus(minutes, occ.start + 55 * MIN)).toBe("idle");
    expect(liveStatus(minutes, occ.start + 45 * MIN)).toBe("away");
  });
});

describe("desk items and shift report", () => {
  const start = thuMidnight + 20 * 60 * MIN;
  const article = (id: string, extra: Partial<DeskArticle> = {}): DeskArticle => ({
    id, title: id, breaking: false, ownerId: "reporter", createdAt: start - 30 * MIN,
    status: "published", reviewStatus: null, reviewedAt: null, reviewedBy: null, ...extra,
  });

  it("waits from the owner's last save until someone else publishes", () => {
    const items = buildDeskItems(
      [article("a"), article("own", { ownerId: "fahad" }), article("p", { status: "draft", reviewStatus: "pending_review" })],
      [
        { articleId: "a", actorId: "reporter", action: "updated", at: start + 5 * MIN },
        { articleId: "a", actorId: "fahad", action: "published", at: start + 12 * MIN },
        { articleId: "own", actorId: "fahad", action: "published", at: start + 3 * MIN },
      ],
    );
    expect(items.map((i) => i.articleId).sort()).toEqual(["a", "p"]);
    const a = items.find((i) => i.articleId === "a");
    expect(a?.waitingSince).toBe(start + 5 * MIN);
    expect(a?.decidedBy).toBe("fahad");
    expect(items.find((i) => i.articleId === "p")?.decidedAt).toBeNull();
  });

  it("measures response to the manager's first touch, not to a scheduled publish", () => {
    const items = buildDeskItems(
      [article("s")],
      [
        { articleId: "s", actorId: "reporter", action: "updated", at: start + 5 * MIN },
        // المناوب حفظه وجدوله بعد 3 دقائق، والنشر المجدول بعد ساعتين
        { articleId: "s", actorId: "fahad", action: "updated", at: start + 8 * MIN },
        { articleId: "s", actorId: "fahad", action: "published", at: start + 125 * MIN },
      ],
    );
    const s = items[0];
    expect(s.decidedAt).toBe(start + 125 * MIN);
    expect(s.respondedAt).toBe(start + 8 * MIN);
    const occ = { start, end: start + 6 * 60 * MIN, userId: "fahad" };
    const report = computeShiftReport({
      occ, now: occ.end, minutes: new Map<number, ActivityKind>(),
      ownVersions: [], ownReviews: [], items, breakingIds: new Set<string>(), thresholds: DEFAULT_DUTY_THRESHOLDS,
    });
    expect(report.responseMedianMin).toBe(3);
  });

  it("counts output, response time and what was left at handoff", () => {
    const occ = { start, end: start + 6 * 60 * MIN, userId: "fahad" };
    const items = buildDeskItems(
      [article("a", { breaking: true }), article("late", { status: "draft", reviewStatus: "pending_review", createdAt: start + 5 * 60 * MIN })],
      [
        { articleId: "a", actorId: "reporter", action: "updated", at: start + 10 * MIN },
        { articleId: "a", actorId: "fahad", action: "published", at: start + 14 * MIN },
      ],
    );
    const minutes = new Map<number, ActivityKind>([[start + 14 * MIN, "action"]]);
    const report = computeShiftReport({
      occ, now: occ.end + 5 * MIN, minutes,
      ownVersions: [
        { articleId: "a", actorId: "fahad", action: "published", at: start + 14 * MIN },
        // النشر نفسه مسجّل مرة ثانية في article_events
        { articleId: "a", actorId: "fahad", action: "published", at: start + 15 * MIN },
      ],
      ownReviews: [], items, breakingIds: new Set(["a"]), thresholds: DEFAULT_DUTY_THRESHOLDS,
    });
    expect(report.published).toBe(1);
    expect(report.responseMedianMin).toBe(4);
    expect(report.breakingFast).toBe(1);
    expect(report.ticks).toEqual([{ offsetMin: 14, breaking: true }]);
    expect(report.hourly[0]).toBe(1);
    expect(report.leftAtHandoff).toBe(1);
  });
});

describe("early start", () => {
  const start = thuMidnight + 8 * 60 * MIN;
  const occ = { start, end: start + 6 * 60 * MIN, userId: "abdullah" };

  it("credits work done up to 30 minutes before the shift, but not from an earlier own shift", () => {
    expect(workCountFrom(occ, [occ])).toBe(start - 30 * MIN);
    const previous = { userId: "abdullah", start: start - 6 * 60 * MIN, end: start - 10 * MIN };
    expect(workCountFrom(occ, [previous, occ])).toBe(start - 10 * MIN);
    const other = { userId: "amjad", start: start - 6 * 60 * MIN, end: start };
    expect(workCountFrom(occ, [other, occ])).toBe(start - 30 * MIN);
    const overlapping = { userId: "abdullah", start: start - 6 * 60 * MIN, end: start + 10 * MIN };
    expect(workCountFrom(occ, [overlapping, occ])).toBe(start);
  });

  it("counts publishes minutes before the start in the first hour", () => {
    const publish = (id: string, offsetMin: number) => ({ articleId: id, actorId: "abdullah", action: "published", at: start + offsetMin * MIN });
    const base = {
      occ, now: start + 7 * MIN, minutes: new Map<number, ActivityKind>(),
      ownVersions: [publish("a", -5), publish("b", -1), publish("c", -45)],
      ownReviews: [], items: [], breakingIds: new Set<string>(), thresholds: DEFAULT_DUTY_THRESHOLDS,
    };
    expect(computeShiftReport(base).published).toBe(0);
    const report = computeShiftReport({ ...base, countFrom: workCountFrom(occ, [occ]) });
    expect(report.published).toBe(2);
    expect(report.hourly[0]).toBe(2);
    expect(report.ticks.map((t) => t.offsetMin)).toEqual([0, 0]);
  });

  it("keeps publishes per hour separate from saves and reviews", () => {
    const v = (id: string, action: string, offsetMin: number) => ({ articleId: id, actorId: "abdullah", action, at: start + offsetMin * MIN });
    const report = computeShiftReport({
      occ, now: start + 90 * MIN, minutes: new Map<number, ActivityKind>(),
      ownVersions: [v("a", "edited", 5), v("a", "edited", 8), v("a", "published", 10), v("b", "edited", 20), v("b", "published", 70)],
      ownReviews: [start + 30 * MIN], items: [], breakingIds: new Set<string>(), thresholds: DEFAULT_DUTY_THRESHOLDS,
    });
    expect(report.published).toBe(2);
    expect(report.hourly.slice(0, 2)).toEqual([5, 1]);
    expect(report.hourlyPublished.slice(0, 2)).toEqual([1, 1]);
    expect(report.hourlyPublished.filter((h): h is number => h !== null).reduce((a, b) => a + b, 0)).toBe(report.published);
  });
});

describe("server helpers", () => {
  it("imports the old env roster as minutes and skips entries without a user", () => {
    const raw = JSON.stringify({ managers: [
      { userId: "fahad", shifts: [{ days: [4, 5, 6], startHour: 20, endHour: 2 }] },
      { name: "بلا معرف", shifts: [{ days: [0], startHour: 8, endHour: 14 }] },
    ] });
    expect(legacyRosterToShifts(raw)).toEqual([{ userId: "fahad", days: [4, 5, 6], startMinute: 1200, endMinute: 120 }]);
    expect(legacyRosterToShifts("not json")).toEqual([]);
  });

  it("treats reads and background pings as presence, writes as work", () => {
    expect(activityKindFor("GET", "/api/articles")).toBe("view");
    expect(activityKindFor("POST", "/api/presence/heartbeat")).toBe("view");
    expect(activityKindFor("PATCH", "/api/admin/articles/1")).toBe("action");
    expect(activityKindFor("OPTIONS", "/api/x")).toBeNull();
  });
});

describe("before presence tracking started", () => {
  it("does not mark the early part of a shift as absent", () => {
    const start = riyadhMidnight(THU) + 20 * 60 * MIN;
    const occ = { start, end: start + 6 * 60 * MIN };
    const trackedFrom = start + 140 * MIN;
    const minutes = new Map<number, ActivityKind>();
    for (let m = 140; m < 150; m++) minutes.set(start + m * MIN, "action");
    const now = start + 150 * MIN;
    const cells = buildPresenceCells(occ, minutes, now, 5, trackedFrom);
    expect(cells.slice(0, 28).every((c) => c === "untracked")).toBe(true);
    expect(cells[28]).toBe("action");
    const s = summarizePresence(occ, cells, minutes, now);
    expect(s.presentPct).toBe(100);
    expect(s.lateStartMin).toBe(0);
    expect(s.longestGap).toBeNull();
  });

  it("reports nothing for a shift that ended before tracking started", () => {
    const start = riyadhMidnight(THU) + 8 * 60 * MIN;
    const occ = { start, end: start + 60 * MIN };
    const now = start + 3 * 60 * MIN;
    const cells = buildPresenceCells(occ, new Map(), now, 5, now - MIN);
    expect(cells.every((c) => c === "untracked")).toBe(true);
    const s = summarizePresence(occ, cells, new Map(), now);
    expect(s.presentPct).toBeNull();
    expect(s.lateStartMin).toBe(0);
    expect(s.longestGap).toBeNull();
  });
});

describe("scheduled publishing", () => {
  it("credits a publish with no recorded publisher to whoever last saved it", () => {
    const at = riyadhMidnight(THU) + 21 * 60 * MIN;
    const out = attributeUnclaimedPublishes(
      [
        { id: "sched", ownerId: "reporter", publishedAt: at },
        { id: "known", ownerId: "reporter", publishedAt: at },
      ],
      [
        { articleId: "sched", actorId: "reporter", action: "created", at: at - 60 * MIN },
        { articleId: "sched", actorId: "amjad", action: "updated", at: at - 20 * MIN },
        { articleId: "known", actorId: "amjad", action: "updated", at: at - 5 * MIN },
        { articleId: "known", actorId: "fahad", action: "published", at },
      ],
    );
    expect(out).toEqual([{ articleId: "sched", actorId: "amjad", action: "published", at }]);
  });
});
