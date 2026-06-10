import { describe, it, expect } from "vitest";
import {
  transliterateToEnglish,
  generateEnglishSlug,
  normalizeTopicSlug,
} from "../../server/utils/slugTransliterator";

// Slug output feeds englishSlug, which is what slugRedirect 301s every
// visitor (and crawler) to. Wrong transliteration = 404s + lost SEO signal.
describe("transliterateToEnglish", () => {
  it("returns '' for empty input", () => {
    expect(transliterateToEnglish("")).toBe("");
  });

  it("maps plain Arabic letters", () => {
    expect(transliterateToEnglish("سبق")).toBe("sbq");
    expect(transliterateToEnglish("محمد")).toBe("mhmd");
  });

  it("taa marbuta: 'a' at word end, 'h' mid-word", () => {
    expect(transliterateToEnglish("مدينة")).toBe("mdyna");
    expect(transliterateToEnglish("مدينة كبيرة")).toBe("mdyna kbyra");
  });

  it("strips diacritics (fatha/damma/kasra/shadda) before mapping", () => {
    expect(transliterateToEnglish("مُحَمَّد")).toBe("mhmd");
  });

  it("drops bare hamza and maps hamza carriers", () => {
    expect(transliterateToEnglish("سماء")).toBe("sma"); // ء → ''
    expect(transliterateToEnglish("مسؤول")).toBe("mswwl"); // ؤ → w
  });

  it("passes Latin/digits through and lowercases the result; spaces are preserved", () => {
    // NOTE: this function does NOT hyphenate — callers are responsible for
    // slug-safe joining. The test pins that contract.
    expect(transliterateToEnglish("خبر iPhone 15")).toBe("khbr iphone 15");
  });
});

describe("generateEnglishSlug", () => {
  it("returns 7 lowercase alphanumeric chars (TopicsManagement validates /^[a-z0-9-]+$/)", () => {
    const slug = generateEnglishSlug("ignored input");
    expect(slug).toMatch(/^[a-z0-9]{7}$/);
  });

  it("is random — consecutive calls differ", () => {
    expect(generateEnglishSlug()).not.toBe(generateEnglishSlug());
  });
});

describe("normalizeTopicSlug", () => {
  it("trims, lowercases, hyphenates whitespace, strips invalid chars", () => {
    expect(normalizeTopicSlug(" Hello World! ")).toBe("hello-world");
    expect(normalizeTopicSlug("a_b.c")).toBe("abc");
  });

  it("collapses hyphen runs and trims edge hyphens", () => {
    expect(normalizeTopicSlug("a--b---c")).toBe("a-b-c");
    expect(normalizeTopicSlug("-abc-")).toBe("abc");
  });

  it("preserves Arabic letters (topic slugs may be Arabic)", () => {
    expect(normalizeTopicSlug("موضوع جديد")).toBe("موضوع-جديد");
  });
});
