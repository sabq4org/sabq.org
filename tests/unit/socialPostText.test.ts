import { describe, expect, it } from "vitest";
import {
  composeXPostText,
  stripMarkdownEmphasis,
  validateXPostText,
  xLengthReport,
  xWeightedLength,
  X_MAX_PREMIUM_WEIGHTED_LENGTH,
  X_MAX_WEIGHTED_LENGTH,
  X_URL_WEIGHT,
} from "../../shared/socialPostText";

describe("socialPostText — العد الموزون لمنصة X", () => {
  it("يحسب الحرف العربي واللاتيني بوزن 1", () => {
    expect(xWeightedLength("مرحبا")).toBe(5);
    expect(xWeightedLength("hello")).toBe(5);
    expect(xWeightedLength("خبر عاجل: hello")).toBe(15);
  });

  it("يحسب الإيموجي بوزن 2", () => {
    expect(xWeightedLength("😀")).toBe(2);
    expect(xWeightedLength("ا😀ب")).toBe(4);
  });

  it("يحسب أي رابط بوزن ثابت 23 مهما طال", () => {
    const short = "https://x.co/a";
    const long = `https://sabq.org/article/${"x".repeat(300)}`;
    expect(xWeightedLength(short)).toBe(X_URL_WEIGHT);
    expect(xWeightedLength(long)).toBe(X_URL_WEIGHT);
    expect(xWeightedLength(`اقرأ ${long}`)).toBe(5 + X_URL_WEIGHT);
  });

  it("يحسب عدة روابط كلاً بوزن 23", () => {
    expect(xWeightedLength("https://a.com/x https://b.com/y")).toBe(23 + 1 + 23);
  });

  it("يركب النص والرابط بسطر جديد", () => {
    expect(composeXPostText("خبر", "https://sabq.org/a")).toBe("خبر\nhttps://sabq.org/a");
    expect(composeXPostText("  خبر  ", null)).toBe("خبر");
    expect(composeXPostText("", "https://sabq.org/a")).toBe("https://sabq.org/a");
  });

  it("280 بالضبط قياسي، و281 صالح لكنه Premium (overStandard)", () => {
    const exact = "ا".repeat(X_MAX_WEIGHTED_LENGTH);
    expect(validateXPostText(exact).valid).toBe(true);
    expect(validateXPostText(exact).overStandard).toBe(false);
    const over = validateXPostText(exact + "ا");
    expect(over.valid).toBe(true);
    expect(over.overStandard).toBe(true);
  });

  it("تجاوز حد Premium ‏25k مرفوض فعلياً", () => {
    expect(validateXPostText("ا".repeat(X_MAX_PREMIUM_WEIGHTED_LENGTH)).valid).toBe(true);
    expect(validateXPostText("ا".repeat(X_MAX_PREMIUM_WEIGHTED_LENGTH + 1)).valid).toBe(false);
  });

  it("مع الرابط: 256 حرفاً يبلغ 280 بالضبط، و257 يتخطى العتبة القياسية فقط", () => {
    const link = "https://sabq.org/article/some-slug";
    const okText = "ا".repeat(256);
    const overText = "ا".repeat(257);
    expect(validateXPostText(okText, link).valid).toBe(true);
    expect(validateXPostText(okText, link).weightedLength).toBe(280);
    expect(validateXPostText(okText, link).overStandard).toBe(false);
    expect(validateXPostText(overText, link).valid).toBe(true);
    expect(validateXPostText(overText, link).overStandard).toBe(true);
  });

  it("النص الفارغ غير صالح ويُعلَّم empty", () => {
    const v = validateXPostText("   ");
    expect(v.empty).toBe(true);
    expect(v.valid).toBe(false);
  });

  it("remaining يعكس المتبقي بدقة (نص مختلط عربي/إنجليزي)", () => {
    const v = validateXPostText("خبر hello");
    expect(v.weightedLength).toBe(9);
    expect(v.remaining).toBe(X_MAX_WEIGHTED_LENGTH - 9);
  });
});

describe("stripMarkdownEmphasis — X لا يعرض Markdown", () => {
  it("يزيل ** و__ حول العبارة ويترك النص", () => {
    expect(stripMarkdownEmphasis("على اللهجتين **النجدية والحجازية**، بعد")).toBe(
      "على اللهجتين النجدية والحجازية، بعد",
    );
    expect(stripMarkdownEmphasis("__عاجل__ خبر")).toBe("عاجل خبر");
  });

  it("لا يمس الروابط والوسوم والنجمة المفردة", () => {
    const text = "#وسم_سعودي 5 * 3 https://sabq.org/a__b?utm_source=x";
    expect(stripMarkdownEmphasis(text)).toBe(text);
  });

  it("لا يمس __ داخل وسم أو رابط عربي", () => {
    for (const text of ["#وسم__سعودي__جديد", "https://sabq.org/خبر__عاجل__الآن", "https://sabq.org/**x**"]) {
      expect(stripMarkdownEmphasis(text)).toBe(text);
    }
    expect(stripMarkdownEmphasis("خبر __عاجل__ الآن")).toBe("خبر عاجل الآن");
  });
});

describe("xLengthReport — تقرير Bot Desk بعد تعديل النص", () => {
  it("يحسب النص + سطر جديد + الرابط (23) كما يركّبه الناشر", () => {
    expect(xLengthReport("نص", "https://sabq.org/article/h218asr")).toEqual({
      xWeightedLength: 2 + 1 + X_URL_WEIGHT,
      xLimit: X_MAX_WEIGHTED_LENGTH,
      overLimit: false,
    });
    expect(xLengthReport("نص", null).xWeightedLength).toBe(2);
  });

  it("CJK بوزن 2، والعربي 1، و overLimit بعد 280", () => {
    expect(xLengthReport("中文").xWeightedLength).toBe(4);
    expect(xLengthReport("ا".repeat(280)).overLimit).toBe(false);
    expect(xLengthReport("ا".repeat(281)).overLimit).toBe(true);
    expect(xLengthReport("ا".repeat(256), "https://sabq.org/a").xWeightedLength).toBe(280);
    expect(xLengthReport("ا".repeat(257), "https://sabq.org/a").overLimit).toBe(true);
  });

  it("منشور حقيقي (2e19d7c4، بعد تعديل أبو محمد): 261 حرفاً + سطر + رابط = 285", () => {
    const text =
      "يتساءل الكاتب إبراهيم الروساء في مقالته عمّا إذا كانت الحوارات على منصات التواصل تحمل نقاشاً موضوعياً يعكس قيمنا أم ضجيجاً تصنعه الخوارزميات.\n" +
      "يستشهد الكاتب في مقالته بالتغريدة المكسيكية التي تحولت إلى كشاف ثقافي وجسراً إنسانياً وقوة ناعمة عابرة للقارات.\n" +
      "@alrwsa";
    expect([...text].length).toBe(261);
    expect(xLengthReport(text, "https://sabq.org/article/h218asr")).toEqual({
      xWeightedLength: 285,
      xLimit: 280,
      overLimit: true,
    });
  });
});
