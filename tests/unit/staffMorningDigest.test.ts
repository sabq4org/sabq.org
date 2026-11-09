import { describe, expect, it } from "vitest";
import { DEFAULT_STAFF_ALERT_PREFS, staffAlertPrefsUpdateSchema } from "../../shared/staffApp";
import {
  STAFF_MORNING_DIGEST_TITLE,
  buildStaffMorningDigestText,
  isMorningDigestSentToday,
  riyadhDayKey,
} from "../../shared/staffMorningDigest";

const zero = { tweets: 0, opinion: 0, messages: 0, news: 0, editRequests: 0 };
const body = (counts: Partial<typeof zero>) => buildStaffMorningDigestText({ ...zero, ...counts })?.body;

describe("buildStaffMorningDigestText", () => {
  it("returns null when nothing awaits", () => {
    expect(buildStaffMorningDigestText(zero)).toBeNull();
    expect(buildStaffMorningDigestText({})).toBeNull();
    expect(buildStaffMorningDigestText(null)).toBeNull();
    expect(buildStaffMorningDigestText({ ...zero, tweets: -3, news: Number.NaN })).toBeNull();
  });

  it("uses the fixed title", () => {
    expect(buildStaffMorningDigestText({ ...zero, tweets: 1 })?.title).toBe(STAFF_MORNING_DIGEST_TITLE);
    expect(STAFF_MORNING_DIGEST_TITLE).toBe("صباح الخير، بانتظار قرارك");
  });

  it("singular", () => {
    expect(body({ tweets: 1 })).toBe("تغريدة واحدة");
    expect(body({ opinion: 1 })).toBe("مقال رأي واحد");
    expect(body({ messages: 1 })).toBe("رسالة واحدة");
    expect(body({ news: 1 })).toBe("خبر واحد");
    expect(body({ editRequests: 1 })).toBe("طلب تعديل واحد");
  });

  it("dual", () => {
    expect(body({ tweets: 2 })).toBe("تغريدتان");
    expect(body({ opinion: 2 })).toBe("مقالا رأي");
    expect(body({ messages: 2 })).toBe("رسالتان");
    expect(body({ news: 2 })).toBe("خبران");
    expect(body({ editRequests: 2 })).toBe("طلبا تعديل");
  });

  it("plural for 3–10", () => {
    expect(body({ tweets: 3 })).toBe("3 تغريدات");
    expect(body({ opinion: 10 })).toBe("10 مقالات رأي");
    expect(body({ messages: 5 })).toBe("5 رسائل");
    expect(body({ news: 7 })).toBe("7 أخبار");
    expect(body({ editRequests: 4 })).toBe("4 طلبات تعديل");
  });

  it("singular for 11+ and hundreds follow the last two digits", () => {
    expect(body({ tweets: 11 })).toBe("11 تغريدة");
    expect(body({ opinion: 25 })).toBe("25 مقال رأي");
    expect(body({ messages: 99 })).toBe("99 رسالة");
    expect(body({ news: 11 })).toBe("11 خبرًا");
    expect(body({ news: 100 })).toBe("100 خبر");
    expect(body({ tweets: 103 })).toBe("103 تغريدات");
    expect(body({ tweets: 111 })).toBe("111 تغريدة");
  });

  it("lists only non-zero parts with the Arabic comma and Latin digits", () => {
    expect(body({ tweets: 3, opinion: 2, messages: 1 })).toBe("3 تغريدات، مقالا رأي، رسالة واحدة");
    expect(body({ opinion: 1, news: 12, editRequests: 2 })).toBe("مقال رأي واحد، 12 خبرًا، طلبا تعديل");
    expect(body({ tweets: 4, news: 5 })).not.toMatch(/[٠-٩]/);
  });
});

describe("riyadh day idempotency helper", () => {
  it("rolls the day at 21:00 UTC (midnight Riyadh)", () => {
    expect(riyadhDayKey(new Date("2026-11-09T05:00:00Z"))).toBe("2026-11-09");
    expect(riyadhDayKey(new Date("2026-11-09T20:59:59Z"))).toBe("2026-11-09");
    expect(riyadhDayKey(new Date("2026-11-09T21:00:00Z"))).toBe("2026-11-10");
  });

  it("detects a digest already sent today", () => {
    const now = new Date("2026-11-09T05:00:00Z");
    expect(isMorningDigestSentToday({ day: "2026-11-09" }, now)).toBe(true);
    expect(isMorningDigestSentToday({ day: "2026-11-08" }, now)).toBe(false);
    expect(isMorningDigestSentToday({ day: "2026-11-09" }, new Date("2026-11-09T22:00:00Z"))).toBe(false);
    expect(isMorningDigestSentToday(undefined, now)).toBe(false);
    expect(isMorningDigestSentToday("2026-11-09", now)).toBe(false);
    expect(isMorningDigestSentToday({ day: 20261109 }, now)).toBe(false);
  });
});

describe("morningDigest alert pref", () => {
  it("defaults to on and is optional in the update schema", () => {
    expect(DEFAULT_STAFF_ALERT_PREFS.morningDigest).toBe(true);
    expect(staffAlertPrefsUpdateSchema.safeParse({ quietHours: "night" }).success).toBe(true);
    expect(staffAlertPrefsUpdateSchema.safeParse({ morningDigest: false }).success).toBe(true);
    expect(staffAlertPrefsUpdateSchema.safeParse({ morningDigest: "no" }).success).toBe(false);
  });
});
