import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));

const {
  COMMENT_LIMITS,
  COMMENT_REJECTION_CODES,
  evaluateCommentSubmission,
  evaluateRateLimits,
  isCopiedFromArticle,
  isNumericOrSymbolsOnly,
  isTemplateRepeat,
  meetsMinimumContent,
  normalizeArabic,
} = await import("../../server/services/commentQuality");

const ARTICLE = {
  id: "article-1",
  title: "وزارة الصحة تعلن نتائج حملة التطعيم الموسمية في جميع المناطق",
  excerpt: "أعلنت وزارة الصحة اليوم نتائج حملة التطعيم الموسمية",
  content:
    "<p>أعلنت <strong>وزارة الصحة</strong> اليوم نتائج حملة التطعيم الموسمية التي شملت جميع المناطق، " +
    "وأكدت أن نسبة الإقبال تجاوزت التوقعات.</p><p>إنا لله وإنا إليه راجعون</p>",
};

const noHistory = { loadRecent: async () => [] };

function submit(content: string, deps = noHistory, now = new Date("2026-10-25T12:00:00Z")) {
  return evaluateCommentSubmission({ userId: "u1", content, article: ARTICLE, now }, deps);
}

describe("normalizeArabic", () => {
  it("strips tashkeel, tatweel, html and punctuation and unifies letter forms", () => {
    expect(normalizeArabic("<b>إِنَّـــا</b> لِلَّهِ، وَإِنَّا إِلَيْهِ رَاجِعُونَ!")).toBe("انا لله وانا اليه راجعون");
    expect(normalizeArabic("مستشفى  الرياض الجديدة")).toBe("مستشفي الرياض الجديده");
  });
});

describe("legit short phrases pass", () => {
  const legit = [
    "رحمه الله",
    "آمين",
    "احسنت",
    "إنا لله وإنا إليه راجعون",
    "قواهم الله",
    "حسبنا الله ونعم الوكيل",
    "الله يرحمهم",
    "ما شاء الله",
  ];
  it.each(legit)("«%s» passes the content checks and is accepted", async (text) => {
    expect(isNumericOrSymbolsOnly(text)).toBe(false);
    expect(meetsMinimumContent(text)).toBe(true);
    const out = await submit(text);
    expect(out.ok).toBe(true);
  });
});

describe("numeric / symbol-only comments are rejected", () => {
  const junk = ["1", "65", "0", "123", "١", "١٢٣", "٦٥", "۱۲۳", ".", "؟", "...", "×××", "1 + 1 = 2", "٪١٠٠"];
  it.each(junk)("«%s» → COMMENT_NUMERIC_ONLY (400)", async (text) => {
    const out = await submit(text);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe(COMMENT_REJECTION_CODES.NUMERIC_ONLY);
    expect(out.httpStatus).toBe(400);
    expect(out.messageAr).toContain("أرقاماً أو رموزاً");
  });
});

describe("too-short comments are rejected", () => {
  it.each(["جيد", "لا", "ok", "ب ج"])("«%s» → COMMENT_TOO_SHORT", async (text) => {
    const out = await submit(text);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe(COMMENT_REJECTION_CODES.TOO_SHORT);
  });
});

describe("copied from article", () => {
  it("detects a substring of the body despite tashkeel / html / punctuation differences", () => {
    expect(isCopiedFromArticle("نَتائِجَ حملةِ التطعيمِ الموسمية!!", ARTICLE)).toBe(true);
    expect(isCopiedFromArticle("<i>وزارة الصحة تعلن نتائج حملة التطعيم</i>", ARTICLE)).toBe(true);
  });

  it("detects ≥ 80% trigram overlap even with a word appended", () => {
    expect(
      isCopiedFromArticle("أعلنت وزارة الصحة اليوم نتائج حملة التطعيم الموسمية التي شملت جميع المناطق رائع", ARTICLE),
    ).toBe(true);
  });

  it("does not flag short religious phrases that appear in the body", () => {
    expect(isCopiedFromArticle("إنا لله وإنا إليه راجعون", ARTICLE)).toBe(false);
    expect(isCopiedFromArticle("رحمه الله", ARTICLE)).toBe(false);
  });

  it("does not flag an original opinion", () => {
    expect(isCopiedFromArticle("أتمنى أن تشمل الحملة القادمة القرى البعيدة أيضاً", ARTICLE)).toBe(false);
  });

  it("is allowed but held (no points) at submit time", async () => {
    const out = await submit("نتائج حملة التطعيم الموسمية التي شملت جميع المناطق");
    expect(out).toMatchObject({ ok: true, flags: { copied: true }, awardEligible: false });
  });
});

describe("cross-article template repeat", () => {
  const text = "خبر مهم شكرا سبق على التغطية";
  const recentOn = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      targetId: `other-${i}`,
      content: i % 2 ? "خَبَرٌ مهم، شكراً سبق على التغطية!" : text,
      createdAt: new Date(`2026-10-2${i % 4}T08:00:00Z`),
    }));

  it("same text on 5 other articles + this one (> 5 distinct) → template, no points", async () => {
    expect(isTemplateRepeat(text, recentOn(5), ARTICLE.id)).toBe(true);
    const out = await submit(text, { loadRecent: async () => recentOn(5) });
    expect(out).toMatchObject({ ok: true, flags: { template: true }, awardEligible: false });
  });

  it("5 distinct articles in total is still fine", () => {
    expect(isTemplateRepeat(text, recentOn(4), ARTICLE.id)).toBe(false);
  });
});

describe("rate limits (DB timestamps)", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const min = 60 * 1000;
  const hour = 60 * min;

  it("20 comments in 24h → COMMENT_RATE_LIMIT (daily)", () => {
    const stamps = Array.from({ length: 20 }, (_, i) => ago(hour + i * 30 * min));
    const out = evaluateRateLimits(stamps, now);
    expect(out?.code).toBe(COMMENT_REJECTION_CODES.RATE_LIMIT);
    expect(out?.messageAr).toContain("للحد اليومي");
    expect(out?.httpStatus).toBe(429);
    expect(out?.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("19 in 24h spread out is allowed", () => {
    const stamps = Array.from({ length: 19 }, (_, i) => ago(hour + i * 30 * min));
    expect(evaluateRateLimits(stamps, now)).toBeNull();
  });

  it("5 comments in 10 minutes → burst limit", () => {
    const stamps = [1, 2, 3, 4, 5].map((i) => ago(i * min));
    const out = evaluateRateLimits(stamps, now);
    expect(out?.code).toBe(COMMENT_REJECTION_CODES.RATE_LIMIT);
    expect(out?.messageAr).not.toContain("للحد اليومي");
    // the oldest of the 5 (5 min ago) leaves the 10-min window in 5 minutes
    expect(out?.retryAfterSeconds).toBe(5 * 60);
  });

  it("a comment 10 seconds ago → COMMENT_COOLDOWN with ~20s retry", () => {
    const out = evaluateRateLimits([ago(10 * 1000)], now);
    expect(out?.code).toBe(COMMENT_REJECTION_CODES.COOLDOWN);
    expect(out?.retryAfterSeconds).toBe(20);
  });

  it("a comment 31 seconds ago is fine", () => {
    expect(evaluateRateLimits([ago(31 * 1000)], now)).toBeNull();
  });

  it("evaluateCommentSubmission applies limits from the mocked DB rows before insert", async () => {
    const rows = Array.from({ length: COMMENT_LIMITS.perDay }, (_, i) => ({
      targetId: `a-${i}`,
      content: `رأي رقم ${i} حول الخبر`,
      createdAt: ago(2 * hour + i * min),
    }));
    const loadRecent = vi.fn(async () => rows);
    const out = await submit("رأي جديد حول هذا الخبر", { loadRecent }, now);
    expect(loadRecent).toHaveBeenCalledWith("u1", expect.any(Date));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe(COMMENT_REJECTION_CODES.RATE_LIMIT);
  });

  it("fails open when the history lookup throws", async () => {
    const out = await submit("رأي جديد حول هذا الخبر", {
      loadRecent: async () => {
        throw new Error("db down");
      },
    });
    expect(out.ok).toBe(true);
  });

  it("numeric-only is rejected before any DB lookup", async () => {
    const loadRecent = vi.fn(async () => []);
    await submit("65", { loadRecent });
    expect(loadRecent).not.toHaveBeenCalled();
  });
});
