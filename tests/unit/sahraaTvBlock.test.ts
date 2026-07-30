import { describe, expect, it } from "vitest";
import {
  DEFAULT_SAHRAA_DESCRIPTION,
  DEFAULT_SAHRAA_TITLE,
  DEFAULT_SAHRAA_X_POST_URL,
  SAHRAA_MEDIA_PATH,
  extractTweetId,
  isValidXPostUrl,
  mergeSahraaTvBlockConfig,
  normalizeXPostUrl,
  parseSahraaTvBlockConfig,
  pickBestMp4Url,
  toPublicSahraaTvBlock,
} from "../../server/services/sahraaTvBlockUtils";

describe("SAHRAA_MEDIA_PATH", () => {
  it("points at the same-origin media proxy", () => {
    expect(SAHRAA_MEDIA_PATH).toBe("/api/sahraa-tv-block/media");
  });
});

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

describe("extractTweetId", () => {
  it("reads id from /video/1 links", () => {
    expect(
      extractTweetId("https://x.com/Sahraachannel/status/2082154114893361183/video/1"),
    ).toBe("2082154114893361183");
  });
});

describe("pickBestMp4Url", () => {
  it("prefers ~720p and ignores m3u8", () => {
    const url = pickBestMp4Url([
      { url: "https://v.example/a.m3u8", content_type: "application/x-mpegURL", bitrate: 0 },
      { url: "https://v.example/270.mp4", content_type: "video/mp4", bitrate: 256_000 },
      { url: "https://v.example/720.mp4", content_type: "video/mp4", bitrate: 2_176_000 },
      { url: "https://v.example/1080.mp4", content_type: "video/mp4", bitrate: 10_368_000 },
    ]);
    expect(url).toBe("https://v.example/720.mp4");
  });
});

describe("isValidXPostUrl", () => {
  it("returns true only for status posts", () => {
    expect(isValidXPostUrl("https://x.com/a/status/12345")).toBe(true);
    expect(isValidXPostUrl("https://x.com/home")).toBe(false);
  });
});

describe("parseSahraaTvBlockConfig", () => {
  it("applies launch defaults (Sahraa video visible after resolve)", () => {
    expect(parseSahraaTvBlockConfig(null)).toEqual({
      isActive: true,
      title: DEFAULT_SAHRAA_TITLE,
      description: DEFAULT_SAHRAA_DESCRIPTION,
      xPostUrl: DEFAULT_SAHRAA_X_POST_URL,
      videoUrl: "",
      posterUrl: "",
      updatedAt: null,
    });
  });

  it("reads stored values and trims", () => {
    const parsed = parseSahraaTvBlockConfig({
      isActive: true,
      title: "  حلقة اليوم  ",
      description: "  وصف  ",
      xPostUrl: " https://x.com/a/status/1234567890 ",
      videoUrl: " https://video.twimg.com/x.mp4 ",
      posterUrl: " https://pbs.twimg.com/x.jpg ",
      updatedAt: "2026-07-30T10:00:00.000Z",
    });
    expect(parsed.isActive).toBe(true);
    expect(parsed.title).toBe("حلقة اليوم");
    expect(parsed.description).toBe("وصف");
    expect(parsed.xPostUrl).toBe("https://x.com/a/status/1234567890");
    expect(parsed.videoUrl).toBe("https://video.twimg.com/x.mp4");
    expect(parsed.posterUrl).toBe("https://pbs.twimg.com/x.jpg");
    expect(parsed.updatedAt).toBe("2026-07-30T10:00:00.000Z");
  });
});

describe("toPublicSahraaTvBlock", () => {
  it("hides when inactive or missing videoUrl — never exposes tweet chrome", () => {
    expect(
      toPublicSahraaTvBlock({
        isActive: false,
        title: "قناة الصحراء",
        description: "x",
        xPostUrl: "https://x.com/a/status/1234567890",
        videoUrl: "https://video.twimg.com/x.mp4",
        posterUrl: "",
        updatedAt: null,
      }).isVisible,
    ).toBe(false);
    expect(
      toPublicSahraaTvBlock({
        isActive: true,
        title: "قناة الصحراء",
        description: "x",
        xPostUrl: "https://x.com/a/status/1234567890",
        videoUrl: "",
        posterUrl: "",
        updatedAt: null,
      }).isVisible,
    ).toBe(false);
  });

  it("exposes video + description only", () => {
    const pub = toPublicSahraaTvBlock({
      isActive: true,
      title: "قناة الصحراء",
      description: "وصف اليوم",
      xPostUrl: "https://x.com/AlSahraa/status/1234567890123456789",
      videoUrl: "https://video.twimg.com/clip.mp4",
      posterUrl: "https://pbs.twimg.com/thumb.jpg",
      updatedAt: "2026-07-30T10:00:00.000Z",
    });
    expect(pub).toEqual({
      isVisible: true,
      title: "قناة الصحراء",
      description: "وصف اليوم",
      videoUrl: "https://video.twimg.com/clip.mp4",
      posterUrl: "https://pbs.twimg.com/thumb.jpg",
      updatedAt: "2026-07-30T10:00:00.000Z",
    });
    expect(pub).not.toHaveProperty("xPostUrl");
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

  it("clears cached video when x url changes", () => {
    const merged = mergeSahraaTvBlockConfig(
      {
        isActive: true,
        title: "قناة الصحراء",
        description: "وصف",
        xPostUrl: "https://x.com/a/status/1111111111",
        videoUrl: "https://video.twimg.com/old.mp4",
        posterUrl: "https://pbs.twimg.com/old.jpg",
        updatedAt: null,
      },
      { xPostUrl: "https://x.com/a/status/2222222222" },
      "2026-07-30T12:00:00.000Z",
    );
    expect(merged.videoUrl).toBe("");
    expect(merged.posterUrl).toBe("");
  });
});
