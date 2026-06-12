import { describe, expect, it } from "vitest";
import {
  matchAlertRules,
  parseAnalysisPayload,
  parseDraftPayload,
} from "../../server/services/radar/parsing";
import type { RadarAlertRule } from "@shared/schema";

describe("parseAnalysisPayload", () => {
  it("parses the wrapped {items: []} contract", () => {
    const raw = JSON.stringify({
      items: [
        {
          id: "a1",
          newsValue: 85,
          isBreaking: true,
          translatedTitle: "عنوان مترجم",
          translatedSummary: "ملخص",
          categorySlug: "world",
          breakdown: { breaking: 90, saudiRelevance: 40, reason: "حدث كبير" },
        },
      ],
    });
    const result = parseAnalysisPayload(raw);
    expect(result).toHaveLength(1);
    expect(result[0].newsValue).toBe(85);
    expect(result[0].isBreaking).toBe(true);
    expect(result[0].breakdown.reason).toBe("حدث كبير");
  });

  it("accepts a bare array and strips markdown code fences", () => {
    const raw = '```json\n[{"id": "x", "newsValue": 50, "translatedTitle": "ع", "translatedSummary": "م"}]\n```';
    const result = parseAnalysisPayload(raw);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("x");
  });

  it("clamps newsValue into 0..100 and drops entries without id", () => {
    const raw = JSON.stringify({
      items: [
        { id: "hi", newsValue: 250, translatedTitle: "ع", translatedSummary: "م" },
        { id: "lo", newsValue: -10, translatedTitle: "ع", translatedSummary: "م" },
        { newsValue: 70, translatedTitle: "بلا معرف", translatedSummary: "م" },
      ],
    });
    const result = parseAnalysisPayload(raw);
    expect(result).toHaveLength(2);
    expect(result[0].newsValue).toBe(100);
    expect(result[1].newsValue).toBe(0);
  });

  it("throws when payload is not an array shape", () => {
    expect(() => parseAnalysisPayload('{"message": "no items"}')).toThrow();
  });
});

describe("parseDraftPayload", () => {
  it("parses a full draft and caps tags at 10", () => {
    const raw = JSON.stringify({
      title: "عنوان",
      content: "<p>متن</p>",
      tags: Array.from({ length: 15 }, (_, i) => `وسم${i}`),
      seoTitle: "عنوان سيو",
      categorySlug: "sports",
    });
    const draft = parseDraftPayload(raw);
    expect(draft.title).toBe("عنوان");
    expect(draft.tags).toHaveLength(10);
    expect(draft.categorySlug).toBe("sports");
  });

  it("throws when title or content is missing", () => {
    expect(() => parseDraftPayload('{"title": "بلا متن"}')).toThrow();
    expect(() => parseDraftPayload('{"content": "<p>بلا عنوان</p>"}')).toThrow();
  });
});

describe("matchAlertRules", () => {
  const rule = (overrides: Partial<RadarAlertRule>): RadarAlertRule =>
    ({
      id: "r1",
      label: "المونديال",
      keywords: ["World Cup", "المنتخب السعودي"],
      minNewsValue: 0,
      markBreaking: true,
      notifyTelegram: true,
      isActive: true,
      createdAt: new Date(),
      ...overrides,
    }) as RadarAlertRule;

  const item = {
    originalTitle: "Saudi Arabia stuns Argentina at the WORLD CUP opener",
    originalExcerpt: null,
    translatedTitle: "المنتخب السعودي يفاجئ الأرجنتين في افتتاح المونديال",
    translatedSummary: null,
    newsValue: 90,
  };

  it("matches case-insensitively across original and translated text", () => {
    const matches = matchAlertRules(item, [rule({})]);
    expect(matches).toHaveLength(1);
    expect(matches[0].keywords).toContain("World Cup");
    expect(matches[0].keywords).toContain("المنتخب السعودي");
  });

  it("respects minNewsValue threshold", () => {
    expect(matchAlertRules({ ...item, newsValue: 30 }, [rule({ minNewsValue: 50 })])).toHaveLength(0);
    expect(matchAlertRules({ ...item, newsValue: 50 }, [rule({ minNewsValue: 50 })])).toHaveLength(1);
  });

  it("skips inactive rules and unmatched keywords", () => {
    expect(matchAlertRules(item, [rule({ isActive: false })])).toHaveLength(0);
    expect(matchAlertRules(item, [rule({ keywords: ["Bundesliga"] })])).toHaveLength(0);
  });
});
