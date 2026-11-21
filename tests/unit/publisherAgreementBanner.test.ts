import { describe, expect, it } from "vitest";
import { agreementBannerState, agreementCreditsText, agreementDaysText, creditBannerThresholds } from "../../shared/publisherAgreementBanner";

const open = (daysLeft: number | null, id = "pkg1") => ({ current: { id, isUnlimited: true, daysLeft }, upcoming: null });

describe("open agreement expiry banner", () => {
  it("shows only from 90 days down to the last day", () => {
    expect(agreementBannerState(open(91))).toBeNull();
    expect(agreementBannerState(open(90))?.milestone).toBe(90);
    expect(agreementBannerState(open(45))?.milestone).toBe(90);
    expect(agreementBannerState(open(30))?.milestone).toBe(30);
    expect(agreementBannerState(open(7))?.milestone).toBe(7);
    expect(agreementBannerState(open(0))?.milestone).toBe(7);
    expect(agreementBannerState(open(-1))).toBeNull();
    expect(agreementBannerState(open(null))).toBeNull();
  });

  it("hides once the open package is renewed", () => {
    expect(agreementBannerState({ current: { id: "p", isUnlimited: false, daysLeft: 20 }, upcoming: null })).toBeNull();
    expect(agreementBannerState({ ...open(20), upcoming: { id: "next" } })).toBeNull();
    expect(agreementBannerState(null)).toBeNull();
    expect(agreementBannerState({ current: null, upcoming: null })).toBeNull();
  });

  it("gives each package and milestone its own dismissal, so it returns at 30 and 7 days", () => {
    const at60 = agreementBannerState(open(60))!.dismissId;
    const at50 = agreementBannerState(open(50))!.dismissId;
    const at29 = agreementBannerState(open(29))!.dismissId;
    const at6 = agreementBannerState(open(6))!.dismissId;
    expect(at60).toBe(at50);
    expect(new Set([at60, at29, at6]).size).toBe(3);
    expect(agreementBannerState(open(60, "other"))!.dismissId).not.toBe(at60);
  });

  it("writes the day count in Arabic with Latin digits", () => {
    expect(agreementDaysText(90)).toBe("90 يومًا");
    expect(agreementDaysText(7)).toBe("7 أيام");
    expect(agreementDaysText(2)).toBe("يومان");
    expect(agreementDaysText(1)).toBe("يوم واحد");
    expect(agreementDaysText(0)).toBe("أقل من يوم");
  });

  const limited = (remaining: number, total = 100, upcoming: unknown = null) => ({
    current: { id: "lim", isUnlimited: false, daysLeft: 200, totalCredits: total, remainingCredits: remaining },
    upcoming,
  });

  it("shows for limited packages in proportion to the remaining credit", () => {
    expect(creditBannerThresholds(100)).toEqual([20, 10, 1, 0]);
    expect(creditBannerThresholds(10)).toEqual([2, 1, 0]);
    expect(creditBannerThresholds(3)).toEqual([1, 0]);
    expect(agreementBannerState(limited(21))).toBeNull();
    expect(agreementBannerState(limited(20))).toMatchObject({ kind: "credits", milestone: 20 });
    expect(agreementBannerState(limited(11))?.milestone).toBe(20);
    expect(agreementBannerState(limited(10))?.milestone).toBe(10);
    expect(agreementBannerState(limited(1))?.milestone).toBe(1);
    expect(agreementBannerState(limited(0))?.milestone).toBe(0);
    expect(agreementBannerState(limited(-2))).toMatchObject({ remaining: 0, milestone: 0 });
    expect(agreementBannerState(limited(5, 0))).toBeNull();
  });

  it("returns at each credit threshold and hides once renewed unless credit ran out", () => {
    const ids = [15, 5, 1, 0].map((n) => agreementBannerState(limited(n))!.dismissId);
    expect(new Set(ids).size).toBe(4);
    expect(agreementBannerState(limited(15))!.dismissId).toBe(agreementBannerState(limited(12))!.dismissId);
    expect(agreementBannerState(limited(5, 100, { id: "next" }))).toBeNull();
    expect(agreementBannerState(limited(0, 100, { id: "next" }))?.milestone).toBe(0);
  });

  it("counts news items in Arabic", () => {
    expect(agreementCreditsText(1)).toBe("خبر واحد");
    expect(agreementCreditsText(2)).toBe("خبران");
    expect(agreementCreditsText(5)).toBe("5 أخبار");
    expect(agreementCreditsText(20)).toBe("20 خبرًا");
  });
});
