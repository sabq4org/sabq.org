import { describe, expect, it } from "vitest";
import { cleanOpinionAuthorBio } from "@/components/public/OpinionCard";

describe("cleanOpinionAuthorBio", () => {
  it("falls back when the bio is missing or empty", () => {
    expect(cleanOpinionAuthorBio(null)).toBe("كاتب رأي");
    expect(cleanOpinionAuthorBio("   \n ")).toBe("كاتب رأي");
  });

  it("does not cut the bio at a one-letter title abbreviation", () => {
    expect(cleanOpinionAuthorBio("د. أستاذ مشارك في الإعلام. عضو هيئة التدريس")).toBe(
      "د. أستاذ مشارك في الإعلام",
    );
  });

  it("falls back when only a title letter remains", () => {
    expect(cleanOpinionAuthorBio("د")).toBe("كاتب رأي");
    expect(cleanOpinionAuthorBio("د.")).toBe("كاتب رأي");
  });

  it("drops the writer's name when the bio repeats it", () => {
    expect(
      cleanOpinionAuthorBio(
        "أحمد عبد الرحمن العرفج كاتب سعودي ساخر",
        "أحمد عبد الرحمن العرفج",
      ),
    ).toBe("كاتب سعودي ساخر");
    expect(cleanOpinionAuthorBio("سارة علي، باحثة اجتماعية", "سارة علي")).toBe("باحثة اجتماعية");
  });

  it("keeps the first sentence, strips links, and caps the length", () => {
    expect(cleanOpinionAuthorBio("https://x.com/a\nمحام ومستشار قانوني. له مؤلفات")).toBe(
      "محام ومستشار قانوني",
    );
    const long = "كاتب ".repeat(30).trim();
    const result = cleanOpinionAuthorBio(long);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(66);
  });
});
