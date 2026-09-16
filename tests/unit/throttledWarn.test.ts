import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetThrottledWarnState, warnThrottled } from "../../server/utils/throttledWarn";

describe("warnThrottled", () => {
  beforeEach(() => {
    resetThrottledWarnState();
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("يطبع أول ظهور ويكتم التكرار داخل النافذة", () => {
    expect(warnThrottled("k", "رسالة")).toBe(true);
    expect(warnThrottled("k", "رسالة")).toBe(false);
    expect(warnThrottled("k", "رسالة")).toBe(false);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("يعود للطباعة بعد انقضاء النافذة", () => {
    warnThrottled("k", "رسالة", 60_000);
    vi.advanceTimersByTime(59_000);
    expect(warnThrottled("k", "رسالة", 60_000)).toBe(false);
    vi.advanceTimersByTime(2_000);
    expect(warnThrottled("k", "رسالة", 60_000)).toBe(true);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it("المفاتيح مستقلة — لاعب لا يكتم لاعبًا آخر", () => {
    expect(warnThrottled("deadline:form:586960", "أ")).toBe(true);
    expect(warnThrottled("deadline:form:536423", "ب")).toBe(true);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it("سقف الذاكرة صلب: آلاف المفاتيح لا تنمو بلا حد", () => {
    for (let i = 0; i < 5_000; i++) {
      warnThrottled(`key-${i}`, `m${i}`, 60_000);
    }
    // بعد السقف (2000) يجري تشذيب؛ المفاتيح الجديدة تُطبع دائمًا رغم الإسقاط
    expect(warnThrottled("key-new", "جديد", 60_000)).toBe(true);
  });
});
