import { afterEach, describe, expect, it, vi } from "vitest";
import { displayTimeZone, RIYADH_TIME_ZONE } from "../../client/src/lib/displayTimeZone";

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
  it("يعرض بتوقيت جهاز المستخدم", () => {
    mockDeviceTimeZone("Africa/Cairo");
    expect(displayTimeZone()).toBe("Africa/Cairo");
  });

  it("يعود للرياض إذا كانت منطقة الجهاز غير صالحة أو غائبة", () => {
    mockDeviceTimeZone("Not/AZone");
    expect(displayTimeZone()).toBe(RIYADH_TIME_ZONE);
    vi.restoreAllMocks();
    mockDeviceTimeZone("");
    expect(displayTimeZone()).toBe(RIYADH_TIME_ZONE);
  });

  it("خبر نُشر 20:00 بالتوقيت العالمي يظهر 10 مساء في القاهرة و11 مساء في الرياض", () => {
    const publishedAt = new Date("2026-11-22T20:00:00Z");
    const fmt = () =>
      new Intl.DateTimeFormat("en-GB", { timeZone: displayTimeZone(), hour: "2-digit", minute: "2-digit", hour12: false }).format(publishedAt);
    mockDeviceTimeZone("Africa/Cairo");
    expect(fmt()).toBe("22:00");
    vi.restoreAllMocks();
    mockDeviceTimeZone("Asia/Riyadh");
    expect(fmt()).toBe("23:00");
  });
});
