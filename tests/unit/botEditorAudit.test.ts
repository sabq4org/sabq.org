import { describe, expect, it, vi } from "vitest";
vi.mock("../../server/db", () => ({ db: {} }));
import { botEditorChanges, recordBotEditorAudit } from "../../server/services/botEditorAudit";

describe("bot editor audit", () => {
  it("captures the previous editorial values, excluding changing counters", () => {
    expect(botEditorChanges({ title: "old", views: 1 }, { title: "new", views: 2 })).toEqual({
      changedFields: ["title"], previousValues: { title: "old" },
    });
  });
  it.each(["ar", "en"] as const)("records both event and revision for %s", async (language) => {
    const values = vi.fn().mockResolvedValue(undefined);
    const tx = { insert: vi.fn(() => ({ values })) };
    await recordBotEditorAudit(tx as never, { language, articleId: "id", actorId: null, operation: "edit", originalSource: "agency", before: { title: "old" }, after: { title: "new" }, updateReason: "تصحيح" });
    expect(values).toHaveBeenCalledTimes(2);
    expect(values.mock.calls[0][0]).toMatchObject({ metadata: { actorName: "نشر سبق", originalSource: "agency", updateReason: "تصحيح" } });
    expect(values.mock.calls[1][0]).toMatchObject({ editorName: "نشر سبق", previousValues: { title: "old" }, updateReason: "تصحيح" });
  });
  it("records event type and English manual provenance accurately", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const tx = { insert: vi.fn(() => ({ values })) };
    await recordBotEditorAudit(tx as never, { language: "en", articleId: "id", actorId: null, operation: "published", originalSource: null, before: {}, after: {} });
    expect(values.mock.calls[0][0]).toMatchObject({ eventType: "published", metadata: { originalSource: "manual", actorName: "نشر سبق" } });
    expect(values.mock.calls[1][0]).toMatchObject({ originalSource: "manual" });
  });
  it("captures authors, source, image descriptions and tags", () => {
    expect(botEditorChanges({ authorId: "a", imageCaption: "old", tagIds: ["1"], sourceUrl: null },
      { authorId: "b", imageCaption: "new", tagIds: ["2"], sourceUrl: "https://example.org" }).changedFields)
      .toEqual(expect.arrayContaining(["authorId", "sourceUrl", "imageCaption", "tagIds"]));
  });
  it("records the prior reviewer verdict", () => {
    expect(botEditorChanges({ reviewerVerdict: { verdict: "major" } }, { reviewerVerdict: { verdict: "ok" } })).toEqual({
      changedFields: ["reviewerVerdict"], previousValues: { reviewerVerdict: { verdict: "major" } },
    });
  });
  it.each([["archive", "archived"], ["unpublish", "unpublished"], ["restore", "restored"]])("records %s event as %s", async (operation, eventType) => {
    const values = vi.fn().mockResolvedValue(undefined);
    await recordBotEditorAudit({ insert: () => ({ values }) } as never, { language: "ar", articleId: "id", actorId: null, operation, originalSource: "bot", before: {}, after: {} });
    expect(values.mock.calls[0][0].eventType).toBe(eventType);
  });
  it("captures previous rich caption", () => {
    expect(botEditorChanges({ imageCaptionHtml: "<p>old</p>" }, { imageCaptionHtml: "<p>new</p>" }).previousValues).toEqual({ imageCaptionHtml: "<p>old</p>" });
  });
  it("propagates audit failure so the enclosing transaction rolls back", async () => {
    const tx = { insert: () => ({ values: () => Promise.reject(new Error("audit failed")) }) };
    await expect(recordBotEditorAudit(tx as never, { language: "ar", articleId: "id", actorId: null, operation: "edit", originalSource: null, before: {}, after: {} })).rejects.toThrow("audit failed");
  });
});
