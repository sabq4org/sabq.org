import { describe, expect, it } from "vitest";
import {
  isOrphanMediaAsset,
  listEditableAttachments,
  mediaAssetUrl,
} from "../../client/src/components/article-editor/mediaAssetHelpers";

describe("mediaAssetHelpers", () => {
  it("reads url from mediaFile or top-level url", () => {
    expect(mediaAssetUrl({ mediaFile: { url: "https://a/x.jpg" } })).toBe("https://a/x.jpg");
    expect(mediaAssetUrl({ url: "https://b/y.jpg" })).toBe("https://b/y.jpg");
    expect(mediaAssetUrl({ mediaFile: { url: "  " }, url: null })).toBeNull();
  });

  it("flags orphans without a usable url", () => {
    expect(isOrphanMediaAsset({ id: "1", mediaFile: null })).toBe(true);
    expect(isOrphanMediaAsset({ id: "2", mediaFile: { url: "https://a/x.jpg" } })).toBe(false);
  });

  it("lists all assets including orphans, sorted by displayOrder", () => {
    const list = listEditableAttachments([
      { id: "b", displayOrder: 2, mediaFile: null },
      { id: "a", displayOrder: 0, mediaFile: { url: "https://a/x.jpg" } },
      { id: "c", displayOrder: 1 },
    ]);
    expect(list.map((a) => a.id)).toEqual(["a", "c", "b"]);
  });
});
