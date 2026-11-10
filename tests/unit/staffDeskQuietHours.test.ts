import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));

import { DEFAULT_STAFF_ALERT_PREFS, isStaffQuietHour, staffAlertPrefsUpdateSchema } from "@shared/staffApp";
import { applyStaffDeskPrefs, riyadhHour, staffDeskFollowTitle } from "../../server/services/staffAppPushService";
import { normalizeStaffAlertPrefs } from "../../server/services/staffAlertPrefsService";

const message = { title: "t", body: "b", type: "x", deeplink: "sabqdesk://inbox" };
// 21:00Z = 00:00 Riyadh; 09:00Z = 12:00 Riyadh.
const midnight = new Date("2026-10-26T21:00:00Z");
const noon = new Date("2026-10-26T09:00:00Z");

describe("desk quiet hours and per-kind switches", () => {
  it("windows cross midnight in Riyadh time", () => {
    expect(isStaffQuietHour("night", 23)).toBe(true);
    expect(isStaffQuietHour("night", 6)).toBe(true);
    expect(isStaffQuietHour("night", 7)).toBe(false);
    expect(isStaffQuietHour("offhours", 17)).toBe(true);
    expect(isStaffQuietHour("offhours", 12)).toBe(false);
    expect(isStaffQuietHour("off", 2)).toBe(false);
    expect(riyadhHour(midnight)).toBe(0);
    expect(riyadhHour(noon)).toBe(12);
  });

  it("drops a kind the member turned off, and silences inside quiet hours", () => {
    const prefs = { ...DEFAULT_STAFF_ALERT_PREFS, writerMessages: false, quietHours: "night" as const };
    expect(applyStaffDeskPrefs(prefs, "writerMessages", message, noon)).toBeNull();
    expect(applyStaffDeskPrefs(prefs, "socialProposals", message, noon)).toEqual(message);
    expect(applyStaffDeskPrefs(prefs, "socialProposals", message, midnight)).toEqual({
      ...message,
      interruptionLevel: "passive",
    });
    // Unknown prefs (lookup failed) deliver as before.
    expect(applyStaffDeskPrefs(undefined, "adminAlerts", message, midnight)).toEqual(message);
  });

  it("normalizes and validates the new fields", () => {
    expect(normalizeStaffAlertPrefs({ quietHours: "weekend", socialProposals: "no" })).toEqual(DEFAULT_STAFF_ALERT_PREFS);
    expect(normalizeStaffAlertPrefs({ quietHours: "offhours", writerMessages: false })).toEqual({
      ...DEFAULT_STAFF_ALERT_PREFS,
      quietHours: "offhours",
      writerMessages: false,
    });
    expect(staffAlertPrefsUpdateSchema.safeParse({ quietHours: "night" }).success).toBe(true);
    expect(staffAlertPrefsUpdateSchema.safeParse({ quietHours: "always" }).success).toBe(false);
  });
});

// 2026-11-10: «نشاط البوتات» مفعّل افتراضياً، و«متابعة النشر» مطفأة حتى يفعّلها العضو.
describe("staff desk bot and follow prefs", () => {
  const push = { title: "t", body: "b", type: "desk.x", deeplink: "sabqdesk://notifications" };
  const noon = new Date("2026-11-10T09:00:00Z");

  it("sends bot activity by default and holds follow-ups until opted in", () => {
    expect(DEFAULT_STAFF_ALERT_PREFS.botNews).toBe(true);
    expect(DEFAULT_STAFF_ALERT_PREFS.publishFollow).toBe(false);
    expect(applyStaffDeskPrefs(undefined, "botNews", push, noon)).toEqual(push);
    expect(applyStaffDeskPrefs(undefined, "publishFollow", push, noon)).toBeNull();
    // صف قديم بلا المفتاحين: الافتراضي نفسه.
    const old = normalizeStaffAlertPrefs({ publisherNews: false });
    expect(old.botNews).toBe(true);
    expect(old.publishFollow).toBe(false);
    expect(applyStaffDeskPrefs(normalizeStaffAlertPrefs({ publishFollow: true }), "publishFollow", push, noon)).toEqual(push);
    expect(applyStaffDeskPrefs(normalizeStaffAlertPrefs({ botNews: false }), "botNews", push, noon)).toBeNull();
  });

  it("names the bot in the follow-up title", () => {
    expect(staffDeskFollowTitle("tweet_published", "قروك بوت")).toBe("نُشرت تغريدة من قروك بوت");
    expect(staffDeskFollowTitle("tweet_scheduled", null)).toBe("جُدولت تغريدة");
    expect(staffDeskFollowTitle("opinion_scheduled")).toBe("جُدول مقال رأي");
  });
});
