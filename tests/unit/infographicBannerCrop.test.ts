import { describe, expect, it } from "vitest";
import {
  BANNER_MAX_WIDTH,
  bannerOutputPlan,
  initialBannerRect,
} from "../../client/src/lib/infographicBannerCrop";

describe("initialBannerRect", () => {
  it("starts a tall infographic at the top, full width, 16:9", () => {
    expect(initialBannerRect(1080, 3240)).toEqual({ x: 0, y: 0, width: 1080, height: 607.5 });
  });

  it("centres horizontally when the image is wider than 16:9", () => {
    const r = initialBannerRect(2000, 900);
    expect(r.height).toBe(900);
    expect(r.width).toBe(1600);
    expect(r.x).toBe(200);
  });

  it("returns an empty rect for an image with no size", () => {
    expect(initialBannerRect(0, 100).width).toBe(0);
  });
});

describe("bannerOutputPlan", () => {
  it("keeps the source size when it is under the max width", () => {
    const plan = bannerOutputPlan({ x: 0, y: 1000, width: 1080, height: 607.5 }, 1080, 3240);
    expect(plan).toEqual({
      source: { x: 0, y: 1000, width: 1080, height: 607.5 },
      outWidth: 1080,
      outHeight: 608,
    });
  });

  it("caps the output width and keeps 16:9", () => {
    const plan = bannerOutputPlan({ x: 0, y: 0, width: 3000, height: 1687.5 }, 3000, 9000);
    expect(plan?.outWidth).toBe(BANNER_MAX_WIDTH);
    expect(plan?.outHeight).toBe(900);
  });

  it("clamps a frame that runs past the bottom edge", () => {
    const plan = bannerOutputPlan({ x: 0, y: 3000, width: 1080, height: 607.5 }, 1080, 3240);
    expect(plan?.source.height).toBe(240);
  });

  it("returns null for an empty frame", () => {
    expect(bannerOutputPlan({ x: 0, y: 3240, width: 1080, height: 600 }, 1080, 3240)).toBeNull();
  });
});
