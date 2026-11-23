import { describe, expect, it } from "vitest";
import {
  agreeVotePercents,
  dateToRiyadhLocal,
  normalizePullQuote,
  pullQuoteAppearsInArticle,
  rescheduleEligibility,
  rescheduleTargetError,
  riyadhLocalToDate,
  validatePullQuote,
  wrapQuoteLines,
} from "@shared/opinionReaderExtras";
import { resolveAvatarUrl } from "../../server/services/opinionQuoteCardImage";

const H = 60 * 60 * 1000;
const D = 24 * H;

describe("جملة المقال", () => {
  it("تزيل علامات التنصيص المحيطة وتوحّد المسافات", () => {
    expect(normalizePullQuote("  «المدن   لا تُبنى بالإسمنت وحده»  ")).toBe("المدن لا تُبنى بالإسمنت وحده");
    expect(normalizePullQuote('"«نص»"')).toBe("نص");
  });

  it("الفارغ يمسح العبارة، والقصير والطويل مرفوضان", () => {
    expect(validatePullQuote("   ")).toEqual({ ok: true, value: null });
    expect(validatePullQuote("قصير").ok).toBe(false);
    expect(validatePullQuote("ب".repeat(241)).ok).toBe(false);
    expect(validatePullQuote("المدن لا تُبنى بالإسمنت وحده")).toEqual({ ok: true, value: "المدن لا تُبنى بالإسمنت وحده" });
  });

  it("تجد العبارة في نص المقال رغم الوسوم والتشكيل والهمزات", () => {
    const html = "<p>المدن لا <strong>تُبنى</strong> بالإسمنت وحده، بل بالثقة.</p>";
    expect(pullQuoteAppearsInArticle("«المدن لا تبنى بالاسمنت وحده»", html)).toBe(true);
    expect(pullQuoteAppearsInArticle("عبارة لم ترد في المقال أصلًا", html)).toBe(false);
  });

  it("تقسيم الأسطر بالكلمات دون كسر كلمة", () => {
    const lines = wrapQuoteLines("كلمة كلمة كلمة كلمة", 10);
    expect(lines).toEqual(["كلمة كلمة", "كلمة كلمة"]);
  });

  it("صورة الكاتب في البطاقة من مضيفات معروفة فقط", () => {
    expect(resolveAvatarUrl("/public-objects/a.jpg")).toBe("https://sabq.org/public-objects/a.jpg");
    expect(resolveAvatarUrl("https://imagedelivery.net/x/y/public")).toContain("imagedelivery.net");
    expect(resolveAvatarUrl("http://imagedelivery.net/x")).toBeNull();
    expect(resolveAvatarUrl("https://169.254.169.254/latest")).toBeNull();
    expect(resolveAvatarUrl("https://evil.example.com/a.png")).toBeNull();
  });
});

describe("أوافق / لا أوافق", () => {
  it("نسبتان مجموعهما 100", () => {
    expect(agreeVotePercents(812, 431)).toEqual({ agree: 65, disagree: 35, total: 1243 });
    expect(agreeVotePercents(1, 2)).toEqual({ agree: 33, disagree: 67, total: 3 });
    expect(agreeVotePercents(0, 0)).toEqual({ agree: 0, disagree: 0, total: 0 });
  });
});

describe("تغيير الموعد مرة واحدة", () => {
  const now = Date.UTC(2026, 10, 24, 9, 0);

  it("حقول الرياض تتحول إلى UTC (الرياض +3 دائمًا)", () => {
    expect(riyadhLocalToDate("2026-11-30", "21:30")?.toISOString()).toBe("2026-11-30T18:30:00.000Z");
    expect(riyadhLocalToDate("2026-12-01", "01:00")?.toISOString()).toBe("2026-11-30T22:00:00.000Z");
    expect(riyadhLocalToDate("2026-02-31", "10:00")).toBeNull();
    expect(riyadhLocalToDate("2026-11-30", "25:00")).toBeNull();
    expect(dateToRiyadhLocal("2026-11-30T22:00:00.000Z")).toEqual({ date: "2026-12-01", time: "01:00" });
  });

  it("متاح للمجدول فقط، ومرة واحدة، ولا يُغيَّر موعد يحين خلال ساعة", () => {
    const at = new Date(now + 3 * D);
    expect(rescheduleEligibility({ status: "scheduled", scheduledAt: at, alreadyUsed: false, nowMs: now })).toEqual({ canReschedule: true });
    expect(rescheduleEligibility({ status: "scheduled", scheduledAt: at, alreadyUsed: true, nowMs: now })).toEqual({ canReschedule: false, reason: "already_used" });
    expect(rescheduleEligibility({ status: "published", scheduledAt: at, alreadyUsed: false, nowMs: now })).toEqual({ canReschedule: false, reason: "not_scheduled" });
    expect(rescheduleEligibility({ status: "scheduled", scheduledAt: new Date(now + 30 * 60 * 1000), alreadyUsed: false, nowMs: now })).toEqual({ canReschedule: false, reason: "too_close" });
  });

  it("الموعد الجديد: بعد ساعة على الأقل، وخلال 30 يومًا، ومختلف عن الحالي", () => {
    const current = now + 3 * D;
    expect(rescheduleTargetError(new Date(now + 30 * 60 * 1000), current, now)).toMatch(/ساعة/);
    expect(rescheduleTargetError(new Date(now + 31 * D), current, now)).toMatch(/30/);
    expect(rescheduleTargetError(new Date(current), current, now)).toMatch(/الحالي/);
    expect(rescheduleTargetError(null, current, now)).toMatch(/صحيحين/);
    expect(rescheduleTargetError(new Date(now + 5 * D), current, now)).toBeNull();
  });
});
