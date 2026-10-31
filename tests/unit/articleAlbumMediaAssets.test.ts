import { describe, expect, it } from "vitest";
import { withAlbumMediaAssets } from "../../server/services/articleReadOverlay";

describe("withAlbumMediaAssets", () => {
  it("adds album images after existing media assets, skipping duplicates and the hero", () => {
    const out = withAlbumMediaAssets({
      imageUrl: "hero.jpg",
      albumImages: ["hero.jpg", "a.jpg", "b.jpg", "a.jpg", ""],
      mediaAssets: [{ url: "b.jpg", altText: "x", displayOrder: 2 }],
    });
    expect(out.mediaAssets).toEqual([
      { url: "b.jpg", altText: "x", displayOrder: 2 },
      { url: "a.jpg", altText: "", displayOrder: 3 },
    ]);
  });

  it("creates mediaAssets when the article has none", () => {
    const out = withAlbumMediaAssets({ imageUrl: null, albumImages: ["a.jpg"] }) as { mediaAssets?: unknown };
    expect(out.mediaAssets).toEqual([{ url: "a.jpg", altText: "", displayOrder: 1 }]);
  });

  it("returns the same object when there is no album", () => {
    const article = { albumImages: [], mediaAssets: [] };
    expect(withAlbumMediaAssets(article)).toBe(article);
  });
});
