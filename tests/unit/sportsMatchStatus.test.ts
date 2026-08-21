import { describe, expect, it } from "vitest";
import {
  inferInPlayCode,
  isPlausibleFootballFullTime,
  latestPositiveEventMinute,
  isWithinLiveOverlayWindow,
  mergeLiveMatchProgress,
  MIN_FULLTIME_PLAYED_MINUTES,
  MIN_MINUTES_AFTER_KICKOFF_FOR_FT,
  type MatchProgress,
} from "../../server/services/sportsMatchStatus";

const base = (over: Partial<MatchProgress> = {}): MatchProgress => ({
  code: "2H",
  label: "الشوط الثاني",
  elapsed: 47,
  extra: null,
  live: true,
  finished: false,
  ...over,
});

describe("isPlausibleFootballFullTime", () => {
  it("يرفض النهاية عند دقيقة 45–47 (استراحة / بداية الشوط الثاني)", () => {
    expect(isPlausibleFootballFullTime({ elapsed: 45, statusCode: "FT" })).toBe(false);
    expect(isPlausibleFootballFullTime({ elapsed: 47, statusCode: "FT" })).toBe(false);
    expect(isPlausibleFootballFullTime({ latestEventMinute: 47, statusCode: "FT" })).toBe(false);
  });

  it("يقبل النهاية بعد اكتمال الوقت الأصلي", () => {
    expect(isPlausibleFootballFullTime({ elapsed: 90, statusCode: "FT" })).toBe(true);
    expect(isPlausibleFootballFullTime({ elapsed: 90, extra: 4, statusCode: "FT" })).toBe(true);
    expect(isPlausibleFootballFullTime({ elapsed: MIN_FULLTIME_PLAYED_MINUTES, statusCode: "FT" })).toBe(true);
  });

  it("يثق برمز النهاية للأرشيف بلا ساعة", () => {
    expect(isPlausibleFootballFullTime({ statusCode: "FT" })).toBe(true);
    expect(isPlausibleFootballFullTime({ statusCode: "AET" })).toBe(true);
  });

  it("يقبل الحسم الإداري مبكرًا", () => {
    expect(isPlausibleFootballFullTime({ elapsed: 10, statusCode: "AWD" })).toBe(true);
    expect(isPlausibleFootballFullTime({ elapsed: 0, statusCode: "WO" })).toBe(true);
  });

  it("يرفض FT إذا مرّ أقل من 100 دقيقة على الانطلاق حتى لو الساعة 90", () => {
    const now = 1_800_000_000;
    expect(
      isPlausibleFootballFullTime({
        elapsed: 90,
        statusCode: "FT",
        kickoffTs: now - 80 * 60,
        nowSec: now,
      }),
    ).toBe(false);
    expect(
      isPlausibleFootballFullTime({
        elapsed: 90,
        statusCode: "FT",
        kickoffTs: now - (MIN_MINUTES_AFTER_KICKOFF_FOR_FT + 5) * 60,
        nowSec: now,
      }),
    ).toBe(true);
  });
});

describe("isWithinLiveOverlayWindow", () => {
  it("تبقى النافذة مفتوحة بعد وسم FT طالما الانطلاق خلال 3 ساعات", () => {
    const now = 1_800_000_000;
    expect(isWithinLiveOverlayWindow(now - 90 * 60, now)).toBe(true);
    expect(isWithinLiveOverlayWindow(now - 4 * 3600, now)).toBe(false);
  });
});

describe("inferInPlayCode", () => {
  it("يستنتج المرحلة من الدقيقة", () => {
    expect(inferInPlayCode(22, null)).toBe("1H");
    expect(inferInPlayCode(45, null)).toBe("HT");
    expect(inferInPlayCode(45, 2)).toBe("1H");
    expect(inferInPlayCode(47, null)).toBe("2H");
    expect(inferInPlayCode(105, null)).toBe("ET");
  });
});

describe("mergeLiveMatchProgress — حادثة الدقيقة 47", () => {
  it("TheSports حيّ في الشوط الثاني يغلب FT كاذب من API-Football", () => {
    const merged = mergeLiveMatchProgress(
      base({ code: "FT", label: "انتهت", live: false, finished: true, elapsed: 47 }),
      { live: true, finished: false, elapsed: 47, statusId: 4 },
    );
    expect(merged.finished).toBe(false);
    expect(merged.live).toBe(true);
    expect(merged.code).toBe("2H");
    expect(merged.label).toBe("الشوط الثاني");
  });

  it("يرفض ومضة TheSports status=8 عند بداية الشوط الثاني", () => {
    const merged = mergeLiveMatchProgress(
      base({ code: "2H", live: true, finished: false, elapsed: 47 }),
      { live: false, finished: true, elapsed: null, statusId: 8, latestEventMinute: 47 },
    );
    expect(merged.finished).toBe(false);
    expect(merged.live).toBe(true);
    expect(merged.code).toBe("2H");
  });

  it("يرفض FT عند الاستراحة (د45) حتى لو المصدران اتفقا", () => {
    const merged = mergeLiveMatchProgress(
      base({ code: "FT", label: "انتهت", live: false, finished: true, elapsed: 45 }),
      { live: false, finished: true, elapsed: 45, statusId: 8 },
    );
    expect(merged.finished).toBe(false);
    expect(merged.live).toBe(true);
    expect(merged.code).toBe("HT");
  });

  it("يقبل نهاية حقيقية بعد 90", () => {
    const merged = mergeLiveMatchProgress(
      base({ code: "2H", live: true, finished: false, elapsed: 90, extra: 3 }),
      { live: false, finished: true, elapsed: 90, extra: 3, statusId: 8 },
    );
    expect(merged.finished).toBe(true);
    expect(merged.live).toBe(false);
    expect(merged.code).toBe("FT");
    expect(merged.label).toBe("انتهت");
  });

  it("يثق بـ FT أرشيفي بلا دقيقة", () => {
    const merged = mergeLiveMatchProgress(
      base({ code: "FT", label: "انتهت", live: false, finished: true, elapsed: null }),
    );
    expect(merged.finished).toBe(true);
    expect(merged.live).toBe(false);
    expect(merged.code).toBe("FT");
  });

  it("يصوّب FT مبكرًا من الأساس وحده (بلا طبقة لحظية)", () => {
    const merged = mergeLiveMatchProgress(
      base({ code: "FT", label: "انتهت", live: false, finished: true, elapsed: 47 }),
    );
    expect(merged.finished).toBe(false);
    expect(merged.live).toBe(true);
    expect(merged.code).toBe("2H");
    expect(merged.label).toBe("الشوط الثاني");
  });

  it("لا تتجمّد الشارة على انتهت في الشوط الثاني إذا قفز المزود لـFT+90", () => {
    const now = 1_800_000_000;
    const merged = mergeLiveMatchProgress(
      base({ code: "FT", label: "انتهت", live: false, finished: true, elapsed: 90 }),
      { latestEventMinute: 71, kickoffTs: now - 85 * 60, nowSec: now },
    );
    expect(merged.finished).toBe(false);
    expect(merged.live).toBe(true);
    expect(merged.code).toBe("2H");
    expect(merged.label).toBe("الشوط الثاني");
    expect(merged.elapsed).toBe(71);
  });
});

describe("latestPositiveEventMinute", () => {
  it("يأخذ أحدث دقيقة موجبة", () => {
    expect(latestPositiveEventMinute([{ minute: 12 }, { minute: 47 }, { minute: 46 }])).toBe(47);
    expect(latestPositiveEventMinute([])).toBeNull();
    expect(latestPositiveEventMinute([{ minute: 0 }])).toBeNull();
  });
});
