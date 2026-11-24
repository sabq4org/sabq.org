import { describe, expect, it } from "vitest";
import {
  nameSortKey,
  pickHotArticles,
  pickSpotlight,
  riyadhDayKey,
  riyadhWeekDays,
  rotateByHour,
  sortRosterByName,
} from "@shared/opinionFront";

const H = 60 * 60 * 1000;

describe("riyadh days", () => {
  it("uses Riyadh midnight, not UTC", () => {
    // 22:30 UTC = 01:30 Riyadh next day
    expect(riyadhDayKey(new Date("2026-11-23T22:30:00Z"))).toBe("2026-11-24");
  });

  it("builds Saturday→Friday week with future days marked", () => {
    const days = riyadhWeekDays(new Date("2026-11-24T08:00:00Z")); // Tuesday
    expect(days.map((d) => d.key)).toEqual([
      "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27",
    ]);
    expect(days[3].isToday).toBe(true);
    expect(days.filter((d) => d.isFuture)).toHaveLength(3);
  });

  it("Saturday starts a new week", () => {
    const days = riyadhWeekDays(new Date("2026-11-28T06:00:00Z"));
    expect(days[0]).toMatchObject({ key: "2026-11-28", isToday: true });
  });
});

describe("rotateByHour", () => {
  it("gives every article the top slot once over n hours", () => {
    const items = ["a", "b", "c"];
    const base = Date.UTC(2026, 10, 24, 0) ;
    const tops = [0, 1, 2].map((h) => rotateByHour(items, new Date(base + h * H))[0]);
    expect(new Set(tops).size).toBe(3);
  });

  it("is stable within the same hour", () => {
    const t = Date.UTC(2026, 10, 24, 9);
    expect(rotateByHour([1, 2, 3, 4], new Date(t + 60_000))).toEqual(rotateByHour([1, 2, 3, 4], new Date(t + 59 * 60_000)));
  });
});

describe("pickHotArticles", () => {
  const now = new Date("2026-11-24T12:00:00Z");
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * H);

  it("prefers reading speed over accumulated totals", () => {
    const hot = pickHotArticles(
      [
        { id: "old", authorId: "w1", views: 11000, publishedAt: at(140) }, // outside 72h
        { id: "twoDays", authorId: "w2", views: 9000, publishedAt: at(56) }, // ~160/h
        { id: "fresh", authorId: "w3", views: 1500, publishedAt: at(6) }, // 250/h
      ],
      now,
    );
    expect(hot.map((h) => h.id)).toEqual(["fresh", "twoDays"]);
  });

  it("keeps one article per writer and skips pieces younger than 3h", () => {
    const hot = pickHotArticles(
      [
        { id: "a1", authorId: "w1", views: 5000, publishedAt: at(10) },
        { id: "a2", authorId: "w1", views: 4000, publishedAt: at(12) },
        { id: "b", authorId: "w2", views: 900, publishedAt: at(20) },
        { id: "new", authorId: "w3", views: 900, publishedAt: at(1) },
      ],
      now,
    );
    expect(hot.map((h) => h.id)).toEqual(["a1", "b"]);
  });
});

describe("pickSpotlight", () => {
  const now = new Date("2026-11-24T12:00:00Z");
  const recent = new Date("2026-11-20T12:00:00Z");
  it("rotates among the least-exposed third of active writers", () => {
    const writers = Array.from({ length: 9 }, (_, i) => ({ authorId: `w${i}`, recentViews: i * 1000, lastPublishedAt: recent }));
    const picks = new Set(
      [0, 1, 2, 3, 4, 5].map((d) => pickSpotlight(writers, new Date(now.getTime() + d * 24 * H))!.authorId),
    );
    expect([...picks].every((id) => ["w0", "w1", "w2"].includes(id))).toBe(true);
    expect(picks.size).toBe(3);
  });

  it("ignores writers inactive for 14+ days", () => {
    const pick = pickSpotlight(
      [
        { authorId: "quiet", recentViews: 0, lastPublishedAt: new Date("2026-10-01T00:00:00Z") },
        { authorId: "active", recentViews: 9000, lastPublishedAt: recent },
      ],
      now,
    );
    expect(pick?.authorId).toBe("active");
  });
});

describe("roster order", () => {
  it("sorts alphabetically ignoring titles", () => {
    expect(nameSortKey("أ.د. عبدالعزيز الهاجري")).toBe("عبدالعزيز الهاجري");
    const sorted = sortRosterByName([{ name: "د. عاصم الحضيف" }, { name: "سعيد مسروح" }, { name: "أحمد" }]);
    expect(sorted.map((w) => w.name)).toEqual(["أحمد", "سعيد مسروح", "د. عاصم الحضيف"]);
  });
});
