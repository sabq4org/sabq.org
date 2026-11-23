import { describe, expect, it } from "vitest";
import { draftDiffersFromArticle } from "../../client/src/lib/articleDraft";
import { draftCompareIgnoredKeys } from "../../client/src/lib/articleAutosave";
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
  it("skips server-autosaved fields only when the browser copy is older than the server", () => {
    const server = { title: "عنوان الخادم", slug: "server-slug", albumImages: [], updatedAt: "2026-10-17T12:03:23.000Z" };
    const older = { title: "عنوان قديم", slug: "", albumImages: [], savedAt: "2026-10-17T12:03:20.000Z" };
    expect(draftDiffersFromArticle(older, server, draftCompareIgnoredKeys(older.savedAt, server.updatedAt))).toBe(false);
    const albumOnly = { ...older, albumImages: ["/a.jpg"] };
    expect(draftDiffersFromArticle(albumOnly, server, draftCompareIgnoredKeys(albumOnly.savedAt, server.updatedAt))).toBe(true);
    const newer = { ...older, savedAt: "2026-10-17T12:04:00.000Z" };
    expect(draftDiffersFromArticle(newer, server, draftCompareIgnoredKeys(newer.savedAt, server.updatedAt))).toBe(true);
  });

  it("يقارن موعد الجدولة بساعة الرياض، ويرحّل مسودة قديمة حُفظت بساعة الجهاز", () => {
    const server = { status: "scheduled", publishType: "scheduled", scheduledAt: "2026-11-23T19:00:00.000Z" };
    const base = { publishType: "scheduled", isFeatured: false, isReading: false, hideFromHomepage: false, isVideoTemplate: false };
    expect(draftDiffersFromArticle({ ...base, scheduledAt: "2026-11-23T22:00", scheduledAtZone: "Asia/Riyadh" }, server)).toBe(false);
    const d = new Date("2026-11-23T19:00:00.000Z");
    const pad = (n: number) => String(n).padStart(2, "0");
    const deviceWall = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    expect(draftDiffersFromArticle({ ...base, scheduledAt: deviceWall }, server)).toBe(false);
    expect(draftDiffersFromArticle({ ...base, scheduledAt: "2026-11-23T23:00", scheduledAtZone: "Asia/Riyadh" }, server)).toBe(true);
  });
});
