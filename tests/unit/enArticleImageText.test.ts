import { describe, expect, it } from "vitest";
import {
  buildEnHeroImageSeoFields,
  EN_IMAGE_ALT_MAX,
  EN_IMAGE_CAPTION_MAX,
  getEnHeroImageText,
} from "@shared/enArticleImageText";

describe("getEnHeroImageText", () => {
  it("returns the stored caption and alt text", () => {
    expect(
      getEnHeroImageText({ imageCaption: " Riyadh skyline at dusk ", imageAltText: "Riyadh skyline" }, "Headline"),
    ).toEqual({ caption: "Riyadh skyline at dusk", alt: "Riyadh skyline" });
  });

  it("falls back for alt: caption first, then headline", () => {
    expect(getEnHeroImageText({ imageCaption: "The minister at the forum" }, "Headline").alt).toBe(
      "The minister at the forum",
    );
    expect(getEnHeroImageText({}, "Headline")).toEqual({ caption: null, alt: "Headline" });
  });

  it("tolerates missing or malformed seo", () => {
    expect(getEnHeroImageText(null, "Headline")).toEqual({ caption: null, alt: "Headline" });
    expect(getEnHeroImageText({ imageCaption: 5, imageAltText: ["x"] }, null)).toEqual({ caption: null, alt: "" });
  });

  it("caps an over-long alt derived from the caption", () => {
    const long = "a".repeat(EN_IMAGE_CAPTION_MAX);
    expect(getEnHeroImageText({ imageCaption: long }, "Headline").alt).toHaveLength(EN_IMAGE_ALT_MAX);
  });
});

describe("buildEnHeroImageSeoFields", () => {
  it("drops empty values so an emptied field clears the stored one", () => {
    expect(buildEnHeroImageSeoFields({ imageCaption: "   ", imageAltText: "" })).toEqual({});
  });

  it("trims, collapses whitespace and caps length", () => {
    const out = buildEnHeroImageSeoFields({
      imageCaption: `  A\n caption  ${"x".repeat(400)}`,
      imageAltText: " alt ",
    });
    expect(out.imageAltText).toBe("alt");
    expect(out.imageCaption?.startsWith("A caption x")).toBe(true);
    expect(out.imageCaption).toHaveLength(EN_IMAGE_CAPTION_MAX);
  });
});
