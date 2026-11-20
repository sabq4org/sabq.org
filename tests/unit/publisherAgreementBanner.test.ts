import { describe, expect, it } from "vitest";
import { agreementBannerState, agreementDaysText } from "../../shared/publisherAgreementBanner";

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

  it("is for open packages only and hides once renewed", () => {
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
});
