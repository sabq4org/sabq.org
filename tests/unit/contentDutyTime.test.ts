import { describe, expect, it } from "vitest";
import type { ContentDutyManager } from "@shared/contentDuty";
import { dutySegments, formatDutyHour, riyadhDutyTime } from "../../client/src/lib/contentDuty";

const night: ContentDutyManager = {
  key: "night", name: "المناوب", online: null, shifts: [{ days: [4, 6], startHour: 20, endHour: 2 }],
};
const relief: ContentDutyManager = { ...night, key: "relief", shifts: [{ days: [4], startHour: 20, endHour: 2 }] };

function assignedAt(date: string) {
  const { day, hour } = riyadhDutyTime(new Date(date));
  return dutySegments([night, relief], day)
    .filter(segment => segment.start <= hour && hour < segment.end)
    .map(segment => segment.manager.key);
}

describe("مناوبات غرفة الأخبار بتوقيت الرياض", () => {
  it("retains both Thursday managers across local midnight and releases them at 02:00", () => {
    expect(assignedAt("2026-11-19T16:59:59Z")).toEqual([]);
    expect(assignedAt("2026-11-19T17:00:00Z")).toEqual(["night", "relief"]);
    expect(assignedAt("2026-11-19T21:00:00Z")).toEqual(["night", "relief"]);
    expect(assignedAt("2026-11-19T22:59:59Z")).toEqual(["night", "relief"]);
    expect(assignedAt("2026-11-19T23:00:00Z")).toEqual([]);
  });

  it("carries Saturday into Sunday without relying on the browser timezone", () => {
    expect(assignedAt("2026-11-21T21:00:00Z")).toEqual(["night"]);
    expect(dutySegments([night], 0)[0]).toMatchObject({ start: 0, end: 2, carry: true });
  });

  it("uses Latin digits and preserves 24:00 as the end of a chart day", () => {
    expect([0, 8, 14, 24].map(formatDutyHour)).toEqual(["00:00", "08:00", "14:00", "24:00"]);
  });
});
