import { describe, expect, it } from "vitest";
import { draftDiffersFromArticle } from "../../client/src/lib/articleDraft";
describe("editor draft recovery", () => {
  it("offers recovery for deletions and metadata-only edits", () => {
    expect(draftDiffersFromArticle({ excerpt: "" }, { excerpt: "old" })).toBe(true);
    expect(draftDiffersFromArticle({ imageUrl: "" }, { imageUrl: "/old.jpg" })).toBe(true);
    expect(draftDiffersFromArticle({ metaTitle: "new" }, { seo: { metaTitle: "old" } })).toBe(true);
  });
  it("does not flag form defaults as unsaved changes", () => {
    expect(draftDiffersFromArticle({ publishType: "instant", scheduledAt: "", isFeatured: false,
      keywords: [], albumImages: [], metaTitle: "", newsType: "regular", savedAt: "ignored" },
    { status: "published", publishType: "scheduled", scheduledAt: "2026-09-01", newsType: "featured" })).toBe(false);
  });
});
