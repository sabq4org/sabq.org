import { describe, expect, it } from "vitest";
import {
  agreeVotePercents,
  normalizePullQuote,
  pullQuoteAppearsInArticle,
  validatePullQuote,
  wrapQuoteLines,
} from "@shared/opinionReaderExtras";
import { resolveAvatarUrl } from "../../server/services/opinionQuoteCardImage";

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
