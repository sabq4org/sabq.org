import { describe, expect, it } from "vitest";
import { deviceDiffersFromRiyadh, pickerDateToWall, riyadhWallToIso, toRiyadhWall, wallToPickerDate } from "../../client/src/lib/riyadhSchedule";

describe("حقل الجدولة بتوقيت الرياض", () => {
  it("يحوّل اللحظة إلى ساعة الرياض وبالعكس", () => {
    expect(toRiyadhWall("2026-11-23T19:00:00.000Z")).toBe("2026-11-23T22:00");
    expect(toRiyadhWall("2026-11-23T22:30:00.000Z")).toBe("2026-11-24T01:30");
    expect(riyadhWallToIso("2026-11-23T22:00")).toBe("2026-11-23T19:00:00.000Z");
    expect(riyadhWallToIso("bad")).toBeNull();
    expect(toRiyadhWall("not a date")).toBe("");
  });

  it("المنتقي يعرض ساعة الرياض كما هي أيًّا كانت منطقة الجهاز", () => {
    const picker = wallToPickerDate("2026-11-23T22:00");
    expect(picker).not.toBeNull();
    expect(pickerDateToWall(picker as Date)).toBe("2026-11-23T22:00");
  });

  it("يعرف متى يختلف الجهاز عن الرياض", () => {
    const winter = Date.parse("2026-11-23T12:00:00Z");
    expect(deviceDiffersFromRiyadh(winter, "Africa/Cairo")).toBe(true);
    expect(deviceDiffersFromRiyadh(winter, "Asia/Riyadh")).toBe(false);
    expect(deviceDiffersFromRiyadh(winter, "Asia/Kuwait")).toBe(false);
  });
});

describe("مسودات محلية قديمة", () => {
  it("يرحّل موعد مسودة حُفظت بساعة الجهاز، ويترك المسودة الجديدة كما هي", async () => {
    const { draftScheduledAtToRiyadh } = await import("../../client/src/lib/riyadhSchedule");
    expect(draftScheduledAtToRiyadh("2026-11-23T22:00", "Asia/Riyadh")).toBe("2026-11-23T22:00");
    const legacy = draftScheduledAtToRiyadh("2026-11-23T22:00", undefined);
    expect(legacy).toBe(new Date(new Date("2026-11-23T22:00").getTime() + 3 * 3600_000).toISOString().slice(0, 16));
    expect(draftScheduledAtToRiyadh("", undefined)).toBe("");
  });
});
