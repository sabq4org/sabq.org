import { describe, it, expect } from "vitest";
import {
  parseYouTubeId,
  parseDailymotionId,
  resolveVideoUrl,
} from "../../server/services/videoResolverService";
import {
  extractTweetId,
  normalizeXPostUrl,
} from "../../server/services/sahraaTvBlockUtils";

describe("videoResolverService & X Post parsing", () => {
  it("extracts tweet ID from various X / Twitter URL formats", () => {
    // 1. Exact user URL with /video/1
    const url1 = "https://x.com/Zatca_sa/status/2088211617947189381/video/1";
    expect(extractTweetId(url1)).toBe("2088211617947189381");

    // 2. Standard x.com status URL
    const url2 = "https://x.com/Zatca_sa/status/2088211617947189381";
    expect(extractTweetId(url2)).toBe("2088211617947189381");

    // 3. Twitter.com status URL
    const url3 = "https://twitter.com/Zatca_sa/status/2088211617947189381";
    expect(extractTweetId(url3)).toBe("2088211617947189381");

    // 4. URL without https://
    const url4 = "x.com/Zatca_sa/status/2088211617947189381/video/1";
    expect(extractTweetId(url4)).toBe("2088211617947189381");

    // 5. URL with /i/status/
    const url5 = "https://x.com/i/status/2088211617947189381";
    expect(extractTweetId(url5)).toBe("2088211617947189381");
  });

  it("normalizes X post URLs correctly", () => {
    const url = "https://x.com/Zatca_sa/status/2088211617947189381/video/1";
    expect(normalizeXPostUrl(url)).toBe(
      "https://twitter.com/Zatca_sa/status/2088211617947189381"
    );
  });

  it("extracts YouTube video IDs correctly", () => {
    expect(parseYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://example.com/not-youtube")).toBeNull();
  });

  it("extracts Dailymotion video IDs correctly", () => {
    expect(parseDailymotionId("https://www.dailymotion.com/video/x8xyz12")).toBe("x8xyz12");
    expect(parseDailymotionId("https://dai.ly/x8xyz12")).toBe("x8xyz12");
    expect(parseDailymotionId("https://example.com/not-dm")).toBeNull();
  });

  it("resolves YouTube and Dailymotion URL info correctly", async () => {
    const yt = await resolveVideoUrl("https://youtu.be/dQw4w9WgXcQ");
    expect(yt.platform).toBe("youtube");
    expect(yt.videoId).toBe("dQw4w9WgXcQ");
    expect(yt.thumbnailUrl).toContain("maxresdefault.jpg");

    const dm = await resolveVideoUrl("https://dai.ly/x8xyz12");
    expect(dm.platform).toBe("dailymotion");
    expect(dm.videoId).toBe("x8xyz12");
  });
});
