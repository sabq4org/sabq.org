import { describe, expect, it } from "vitest";
import {
  filterFreshItems,
  matchAlertRules,
  parseAnalysisPayload,
  parseDraftPayload,
  parseFeedDate,
  resolveEnvPlaceholders,
  stripPublisherSuffix,
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

describe("parseFeedDate", () => {
  it("parses the Sky Sports BST format that V8 rejects natively", () => {
    const date = parseFeedDate("Wed, 10 Jun 2026 15:50:00 BST");
    expect(date).toBeDefined();
    // BST = UTC+1 → الساعة 14:50 بالتوقيت العالمي
    expect(date!.toISOString()).toBe("2026-06-10T14:50:00.000Z");
  });

  it("keeps native parsing for GMT/ISO formats", () => {
    expect(parseFeedDate("Fri, 12 Jun 2026 07:00:00 GMT")!.toISOString()).toBe(
      "2026-06-12T07:00:00.000Z"
    );
    expect(parseFeedDate("2026-06-12T05:06:53Z")!.toISOString()).toBe("2026-06-12T05:06:53.000Z");
  });

  it("returns undefined for garbage or empty input", () => {
    expect(parseFeedDate("")).toBeUndefined();
    expect(parseFeedDate(null)).toBeUndefined();
    expect(parseFeedDate("not a date XYZ")).toBeUndefined();
  });

  it("parses the GDELT compact seendate format", () => {
    expect(parseFeedDate("20260731T054500Z")!.toISOString()).toBe("2026-07-31T05:45:00.000Z");
  });
});

describe("resolveEnvPlaceholders", () => {
  it("substitutes {{ENV:VAR}} from the provided env", () => {
    expect(
      resolveEnvPlaceholders("https://api.example.com/v1?q=x&apiKey={{ENV:MY_KEY}}", {
        MY_KEY: "secret-123",
      })
    ).toBe("https://api.example.com/v1?q=x&apiKey=secret-123");
  });

  it("throws a named error when the variable is missing or empty", () => {
    expect(() => resolveEnvPlaceholders("https://x.com?k={{ENV:MISSING_KEY}}", {})).toThrow(
      "RADAR_ENV_MISSING:MISSING_KEY"
    );
    expect(() =>
      resolveEnvPlaceholders("https://x.com?k={{ENV:EMPTY_KEY}}", { EMPTY_KEY: "" })
    ).toThrow("RADAR_ENV_MISSING:EMPTY_KEY");
  });

  it("leaves URLs without placeholders untouched", () => {
    expect(resolveEnvPlaceholders("https://news.google.com/rss/search?q=Saudi", {})).toBe(
      "https://news.google.com/rss/search?q=Saudi"
    );
  });
});

describe("stripPublisherSuffix", () => {
  it("strips the Google News ' - Publisher' suffix when it matches", () => {
    expect(
      stripPublisherSuffix(
        "Three countries asked for US$1 million. Then Saudi Arabia stepped in - RNZ",
        "RNZ"
      )
    ).toBe("Three countries asked for US$1 million. Then Saudi Arabia stepped in");
  });

  it("matches the suffix case-insensitively", () => {
    expect(stripPublisherSuffix("Saudi GDP grows - the new york times", "The New York Times")).toBe(
      "Saudi GDP grows"
    );
  });

  it("keeps legitimate hyphens when the suffix is not the publisher", () => {
    expect(stripPublisherSuffix("US-Saudi relations - a new era", "RNZ")).toBe(
      "US-Saudi relations - a new era"
    );
  });

  it("returns the title untouched without a publisher or when stripping would empty it", () => {
    expect(stripPublisherSuffix("Saudi headline", undefined)).toBe("Saudi headline");
    expect(stripPublisherSuffix(" - RNZ", "RNZ")).toBe("- RNZ");
  });
});

describe("filterFreshItems", () => {
  const now = new Date("2026-06-12T12:00:00Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);

  it("drops items older than the freshness window", () => {
    const items = [
      { publishedAt: hoursAgo(2) },
      { publishedAt: hoursAgo(47) },
      { publishedAt: hoursAgo(49) },
      { publishedAt: hoursAgo(24 * 14) }, // أسبوعان — حالة Sky Sports
    ];
    const fresh = filterFreshItems(items, { isFirstFetch: false, maxAgeHours: 48, now });
    expect(fresh).toHaveLength(2);
  });

  it("drops undated items on first fetch but accepts them afterwards", () => {
    const items = [{ publishedAt: undefined }, { publishedAt: hoursAgo(1) }];
    expect(filterFreshItems(items, { isFirstFetch: true, maxAgeHours: 48, now })).toHaveLength(1);
    expect(filterFreshItems(items, { isFirstFetch: false, maxAgeHours: 48, now })).toHaveLength(2);
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
