import { beforeEach, describe, expect, it, vi } from "vitest";

const { getNextSlotsForWriters } = vi.hoisted(() => ({
  getNextSlotsForWriters: vi.fn(),
}));

vi.mock("../../server/services/opinionWritersService", () => ({
  getNextSlotsForWriters,
}));

import {
  enrichMobileAdminSchedules,
  mobileScheduleError,
} from "../../server/services/mobileAdminSchedule";

describe("mobile admin opinion schedule enrichment", () => {
  beforeEach(() => getNextSlotsForWriters.mockReset());

  it("looks up unique draft and scheduled opinion writers and preserves saved dates", async () => {
    const slot = { weekday: 2, publishTime: "06:00", nextSlot: "2026-09-29T03:00:00.000Z" };
    getNextSlotsForWriters.mockResolvedValue({ w1: slot, w3: slot });
    const saved = "2026-09-22T03:00:00.000Z";
    const rows = await enrichMobileAdminSchedules([
      { id: "a1", status: "draft", articleType: "opinion", authorId: "w1", scheduledAt: saved },
      { id: "a2", status: "draft", articleType: "opinion", authorId: "w1", scheduledAt: null },
      { id: "a3", status: "draft", articleType: "news", authorId: "w2", scheduledAt: null },
      { id: "a4", status: "scheduled", articleType: "opinion", authorId: "w3", scheduledAt: saved },
    ]);

    expect(getNextSlotsForWriters).toHaveBeenCalledOnce();
    expect(getNextSlotsForWriters).toHaveBeenCalledWith(["w1", "w3"]);
    expect(rows[0]).toMatchObject({ scheduledAt: saved, writerWeeklySlot: slot });
    expect(rows[1]).toMatchObject({ scheduledAt: null, writerWeeklySlot: slot });
    expect(rows[2].writerWeeklySlot).toBeUndefined();
    expect(rows[3]).toMatchObject({ scheduledAt: saved, writerWeeklySlot: slot });
  });

  it("does not query schedules for news, published, archived or authorless articles", async () => {
    const rows = await enrichMobileAdminSchedules([
      { status: "draft", articleType: "news", authorId: "w1" },
      { status: "published", articleType: "opinion", authorId: "w2" },
      { status: "archived", articleType: "opinion", authorId: "w2" },
      { status: "draft", articleType: "opinion", authorId: null },
    ]);
    expect(getNextSlotsForWriters).not.toHaveBeenCalled();
    expect(rows).toHaveLength(4);
  });
});

describe("mobileScheduleError", () => {
  const now = new Date("2026-09-23T12:00:00.000Z");

  it.each([
    [null, "حدّد تاريخ ووقت النشر قبل حفظ الجدولة"],
    [undefined, "حدّد تاريخ ووقت النشر قبل حفظ الجدولة"],
    ["not-a-date", "حدّد تاريخ ووقت النشر قبل حفظ الجدولة"],
    ["2026-09-23T11:59:59.000Z", "فات موعد النشر المحدد؛ اختر موعداً مستقبلياً أو انشر الآن"],
    ["2026-09-23T12:00:00.000Z", "فات موعد النشر المحدد؛ اختر موعداً مستقبلياً أو انشر الآن"],
  ])("rejects scheduled date %j", (scheduledAt, expected) => {
    expect(mobileScheduleError("scheduled", scheduledAt, now)).toBe(expected);
  });

  it("accepts a future scheduled date", () => {
    expect(mobileScheduleError("scheduled", "2026-09-23T12:00:01.000Z", now)).toBeNull();
  });

  it("allows drafts to retain a past scheduledAt for web parity", () => {
    expect(mobileScheduleError("draft", "2026-09-20T12:00:00.000Z", now)).toBeNull();
  });
});
