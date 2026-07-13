import { describe, expect, it } from "vitest";
import {
  buildCloudflareUrl,
  generateResponsiveSrcSet,
} from "../../client/src/lib/cdnImage";

const R2_IMAGE =
  "https://media.sabq.org/news/2026/07/123e4567-e89b-12d3-a456-426614174000/w1600.webp";

describe("R2 news image delivery", () => {
  it.each([
    [320, "w480.webp"],
    [640, "w960.webp"],
    [1200, "w1600.webp"],
    [1920, "w1600.webp"],
  ])("selects the nearest generated variant for width %s", (width, expectedVariant) => {
    const result = buildCloudflareUrl(R2_IMAGE, { width });

    expect(result).toContain(`media.sabq.org/news/2026/07/`);
    expect(result).toContain(expectedVariant);
    expect(result).not.toContain("sabq.org/cdn-cgi/image");
  });

  it("builds a three-size srcset without changing the R2 hostname", () => {
    const result = generateResponsiveSrcSet(R2_IMAGE);

    expect(result).toContain("w480.webp 480w");
    expect(result).toContain("w960.webp 960w");
    expect(result).toContain("w1600.webp 1600w");
    expect(result.match(/media\.sabq\.org/g)).toHaveLength(3);
  });

  it("does not request variants larger than a small source image", () => {
    const smallImage = R2_IMAGE.replace("w1600.webp", "w800.webp");
    const result = generateResponsiveSrcSet(smallImage);

    expect(result).toContain("w480.webp 480w");
    expect(result).toContain("w800.webp 800w");
    expect(result).not.toContain("w960.webp");
    expect(result).not.toContain("w1600.webp");
    expect(buildCloudflareUrl(smallImage, { width: 960 })).toContain("w800.webp");
  });

  it("keeps an R2 original URL unchanged when no generated variant exists", () => {
    const original = R2_IMAGE.replace("w1600.webp", "original.gif");
    expect(buildCloudflareUrl(original, { width: 480 })).toBe(original);
    expect(generateResponsiveSrcSet(original)).toBe("");
  });
});
