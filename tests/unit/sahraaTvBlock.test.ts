import { describe, expect, it } from "vitest";
import {
  DEFAULT_SAHRAA_DESCRIPTION,
  DEFAULT_SAHRAA_TITLE,
  DEFAULT_SAHRAA_X_POST_URL,
  isValidXPostUrl,
  mergeSahraaTvBlockConfig,
  normalizeXPostUrl,
  parseSahraaTvBlockConfig,
  toPublicSahraaTvBlock,
} from "../../server/services/sahraaTvBlockUtils";

describe("normalizeXPostUrl", () => {
  it("accepts x.com status URLs and normalizes to twitter.com", () => {
    expect(normalizeXPostUrl("https://x.com/AlSahraa/status/1234567890123456789")).toBe(
      "https://twitter.com/AlSahraa/status/1234567890123456789",
    );
  });

  it("accepts /video/1 deep links from X", () => {
    expect(
      normalizeXPostUrl(
        "https://x.com/Sahraachannel/status/2082154114893361183/video/1",
      ),
    ).toBe("https://twitter.com/Sahraachannel/status/2082154114893361183");
  });

  it("accepts twitter.com and strips query/hash", () => {
    expect(
      normalizeXPostUrl(
        "https://twitter.com/AlSahraa/status/1234567890123456789?s=20&t=abc#foo",
      ),
    ).toBe("https://twitter.com/AlSahraa/status/1234567890123456789");
  });

  it("accepts URLs without protocol", () => {
    expect(normalizeXPostUrl("x.com/user_name/status/99999")).toBe(
      "https://twitter.com/user_name/status/99999",
    );
  });

  it("rejects non-status URLs", () => {
    expect(normalizeXPostUrl("https://x.com/AlSahraa")).toBeNull();
    expect(normalizeXPostUrl("https://example.com/status/123")).toBeNull();
    expect(normalizeXPostUrl("")).toBeNull();
    expect(normalizeXPostUrl(null)).toBeNull();
  });
});

describe("isValidXPostUrl", () => {
  it("returns true only for status posts", () => {
    expect(isValidXPostUrl("https://x.com/a/status/12345")).toBe(true);
    expect(isValidXPostUrl("https://x.com/home")).toBe(false);
  });
});

describe("parseSahraaTvBlockConfig", () => {
  it("applies launch defaults (Sahraa video visible)", () => {
    expect(parseSahraaTvBlockConfig(null)).toEqual({
      isActive: true,
      title: DEFAULT_SAHRAA_TITLE,
      description: DEFAULT_SAHRAA_DESCRIPTION,
      xPostUrl: DEFAULT_SAHRAA_X_POST_URL,
      updatedAt: null,
    });
  });

  it("reads stored values and trims", () => {
    const parsed = parseSahraaTvBlockConfig({
      isActive: true,
      title: "  حلقة اليوم  ",
      description: "  وصف  ",
      xPostUrl: " https://x.com/a/status/1234567890 ",
      updatedAt: "2026-07-30T10:00:00.000Z",
    });
    expect(parsed.isActive).toBe(true);
    expect(parsed.title).toBe("حلقة اليوم");
    expect(parsed.description).toBe("وصف");
    expect(parsed.xPostUrl).toBe("https://x.com/a/status/1234567890");
    expect(parsed.updatedAt).toBe("2026-07-30T10:00:00.000Z");
  });
});

describe("toPublicSahraaTvBlock", () => {
  it("hides when inactive or invalid url", () => {
    expect(
      toPublicSahraaTvBlock({
        isActive: false,
        title: "قناة الصحراء",
        description: "x",
        xPostUrl: "https://x.com/a/status/1234567890",
        updatedAt: null,
      }).isVisible,
    ).toBe(false);
    expect(
      toPublicSahraaTvBlock({
        isActive: true,
        title: "قناة الصحراء",
        description: "x",
        xPostUrl: "",
        updatedAt: null,
      }).isVisible,
    ).toBe(false);
  });

  it("exposes normalized url when active", () => {
    const pub = toPublicSahraaTvBlock({
      isActive: true,
      title: "قناة الصحراء",
      description: "وصف اليوم",
      xPostUrl: "https://x.com/AlSahraa/status/1234567890123456789",
      updatedAt: "2026-07-30T10:00:00.000Z",
    });
    expect(pub).toEqual({
      isVisible: true,
      title: "قناة الصحراء",
      description: "وصف اليوم",
      xPostUrl: "https://twitter.com/AlSahraa/status/1234567890123456789",
      updatedAt: "2026-07-30T10:00:00.000Z",
    });
  });
});

describe("mergeSahraaTvBlockConfig", () => {
  it("rejects invalid urls", () => {
    expect(() =>
      mergeSahraaTvBlockConfig(parseSahraaTvBlockConfig(null), {
        xPostUrl: "https://x.com/home",
      }),
    ).toThrow("INVALID_X_POST_URL");
  });
});
