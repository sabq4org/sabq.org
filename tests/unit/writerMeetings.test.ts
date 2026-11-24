import { describe, expect, it } from "vitest";
import { canJoinWriterMeeting, writerMeetingCountdown } from "../../client/src/lib/writerMeetings";

const NOW = Date.parse("2026-11-24T10:00:00Z");
const inMin = (m: number) => new Date(NOW + m * 60_000).toISOString();

describe("writer meetings", () => {
  it("opens join 10 minutes before and while live", () => {
    expect(canJoinWriterMeeting({ isLive: false, scheduledAt: inMin(11), now: NOW })).toBe(false);
    expect(canJoinWriterMeeting({ isLive: false, scheduledAt: inMin(10), now: NOW })).toBe(true);
    expect(canJoinWriterMeeting({ isLive: true, scheduledAt: null, now: NOW })).toBe(true);
    expect(canJoinWriterMeeting({ isLive: false, scheduledAt: null, now: NOW })).toBe(false);
  });

  it("writes a short Arabic countdown", () => {
    expect(writerMeetingCountdown(inMin(25), NOW)).toBe("بعد 25 دقيقة");
    expect(writerMeetingCountdown(inMin(5), NOW)).toBe("بعد 5 دقائق");
    expect(writerMeetingCountdown(inMin(2 * 1440 + 180), NOW)).toBe("بعد يومين و3 ساعات");
    expect(writerMeetingCountdown(inMin(60), NOW)).toBe("بعد ساعة");
    expect(writerMeetingCountdown(inMin(-3), NOW)).toBe("حان الموعد");
  });
});
