import { afterEach, describe, expect, it, vi } from "vitest";
import {
  displayTimeZone,
  isStaffPath,
  RIYADH_TIME_ZONE,
} from "../../client/src/lib/displayTimeZone";

function mockDeviceTimeZone(tz: string) {
  const real = Intl.DateTimeFormat.prototype.resolvedOptions;
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (this: Intl.DateTimeFormat) {
    return { ...real.call(this), timeZone: tz };
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("displayTimeZone", () => {
  it("يعرض صفحات القراء بتوقيت جهاز القارئ", () => {
    mockDeviceTimeZone("Africa/Cairo");
    expect(displayTimeZone("/article/some-slug")).toBe("Africa/Cairo");
    expect(displayTimeZone("/")).toBe("Africa/Cairo");
    expect(displayTimeZone("/en/article/x")).toBe("Africa/Cairo");
    expect(displayTimeZone("/opinion/123")).toBe("Africa/Cairo");
  });

  it("يبقي صفحات العمل بتوقيت الرياض", () => {
    mockDeviceTimeZone("Africa/Cairo");
    expect(displayTimeZone("/dashboard/articles")).toBe(RIYADH_TIME_ZONE);
    expect(displayTimeZone("/dashboard")).toBe(RIYADH_TIME_ZONE);
    expect(displayTimeZone("/admin/x")).toBe(RIYADH_TIME_ZONE);
    expect(displayTimeZone("/en/dashboard/news")).toBe(RIYADH_TIME_ZONE);
    expect(displayTimeZone("/ur/dashboard")).toBe(RIYADH_TIME_ZONE);
  });

  it("لا يخلط مسارًا يبدأ بالاسم نفسه مع صفحة العمل", () => {
    expect(isStaffPath("/dashboarding")).toBe(false);
    expect(isStaffPath("/administration")).toBe(false);
  });

  it("يعود للرياض إذا كانت منطقة الجهاز غير صالحة", () => {
    mockDeviceTimeZone("Not/AZone");
    expect(displayTimeZone("/article/x")).toBe(RIYADH_TIME_ZONE);
  });

  it("وقت نشر 20:00 بالتوقيت العالمي يظهر 10 مساء في القاهرة و11 مساء في الرياض", () => {
    const publishedAt = new Date("2026-11-22T20:00:00Z");
    const fmt = (tz: string) =>
      new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(publishedAt);
    mockDeviceTimeZone("Africa/Cairo");
    expect(fmt(displayTimeZone("/article/x"))).toBe("22:00");
    expect(fmt(displayTimeZone("/dashboard/articles"))).toBe("23:00");
  });
});
