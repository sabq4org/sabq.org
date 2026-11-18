import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ read: vi.fn(), edit: vi.fn(), gen: vi.fn(), save: vi.fn(), audit: vi.fn(), smart: vi.fn(), editable: vi.fn(), upload: vi.fn() }));
vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/services/botEditorReads", () => ({ readBotArticle: m.read }));
vi.mock("../../server/services/botEditorWrites", () => ({ editBotArticle: m.edit, assertBotEditorEditable: m.editable }));
vi.mock("../../server/services/imageModelRouter", () => ({ generateWithSmartRouter: m.gen }));
vi.mock("../../server/services/newsImageStorageService", () => ({ newsImageStorageService: { upload: m.upload } }));
vi.mock("../../server/services/mediaGenerationService", () => ({ saveGeneratedImage: m.save }));
vi.mock("../../server/services/botEditorOperationsAudit", () => ({ recordBotEditorOperation: m.audit }));
vi.mock("../../server/openai", () => ({ generateSmartContent: m.smart, withRetry: (fn: () => unknown) => fn() }));
vi.mock("../../server/services/botDraftsService", async (original) => ({ ...(await original<typeof import("../../server/services/botDraftsService")>()), resolveBotAuthorId: async () => "actor" }));
import { generateBotCover, generateBotImage, regenerateEditorExtras } from "../../server/services/botEditorMedia";

describe("privileged bot editor media", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.read.mockResolvedValue({ title: "News headline", content: "a".repeat(150), updatedAt: "2026-11-18T00:00:00.000Z" });
    m.gen.mockResolvedValue({ success: true, imageData: "base64", modelUsed: "model" });
    m.upload.mockResolvedValue({ success: true, deliveryUrl: "https://cdn.sabq.org/image.png" });
    m.editable.mockResolvedValue(undefined);
    m.save.mockResolvedValue({ id: "asset", url: "https://cdn.sabq.org/image.png", proxyUrl: "/api/media/proxy/asset" });
    m.audit.mockResolvedValue(undefined);
    m.edit.mockResolvedValue({ id: "news" });
    m.smart.mockResolvedValue({ mainTitle: "Alternate", subTitle: "Subtitle", smartSummary: "Summary", keywords: ["news"], seo: { metaTitle: "SEO", metaDescription: "Description" } });
  });
  it("audits and returns a stored, usable image", async () => {
    const result = await generateBotImage("ar", { prompt: "A headline" });
    expect(result.deliveryUrl).toBe("https://cdn.sabq.org/image.png");
    expect(m.audit.mock.calls.map(c => c[0].outcome)).toEqual(["started", "succeeded"]);
  });
  it("rejects an unsafe provider URL and audits failure", async () => {
    m.upload.mockResolvedValue({ success: true, deliveryUrl: "http://127.0.0.1/private" });
    await expect(generateBotImage("en", { prompt: "A headline" })).rejects.toMatchObject({ code: "generation_failed" });
    expect(m.save).not.toHaveBeenCalled();
    expect(m.audit.mock.calls.map(c => c[0].outcome)).toEqual(["started", "failed"]);
  });
  it("uses the read version to guard cover changes", async () => {
    await generateBotCover("ar", "news", {});
    expect(m.edit).toHaveBeenCalledWith("ar", "news", expect.objectContaining({ isAiGeneratedImage: true }), { expectedUpdatedAt: new Date("2026-11-18T00:00:00.000Z") });
  });
  it("saves requested extras and guards against concurrent edits", async () => {
    await regenerateEditorExtras("en", "news", { fields: ["subtitle", "alternativeTitle", "seoDescription"] });
    expect(m.edit).toHaveBeenCalledWith("en", "news", { subtitle: "Subtitle", alternativeTitle: "Alternate", seoDescription: "Description" }, { expectedUpdatedAt: new Date("2026-11-18T00:00:00.000Z") });
  });
  it("refuses locked articles before generating", async () => {
    m.editable.mockRejectedValue({ code: "locked_by_editor" });
    await expect(generateBotCover("ar", "news", {})).rejects.toMatchObject({ code: "locked_by_editor" });
    expect(m.gen).not.toHaveBeenCalled();
  });
  it("marks an English cover as AI generated", async () => {
    await generateBotCover("en", "news", {});
    expect(m.edit).toHaveBeenCalledWith("en", "news", expect.objectContaining({ isAiGeneratedImage: true }), expect.any(Object));
  });
  it("rejects relative storage results rather than returning a broken URL", async () => {
    m.upload.mockResolvedValue({ success: true, deliveryUrl: "/api/public-media/image.png" });
    await expect(generateBotImage("ar", { prompt: "A headline" })).rejects.toMatchObject({ code: "generation_failed" });
    expect(m.save).not.toHaveBeenCalled();
  });
  it("propagates a concurrent edit conflict after generation", async () => {
    m.edit.mockRejectedValue({ code: "draft_changed" });
    await expect(generateBotCover("ar", "news", {})).rejects.toMatchObject({ code: "draft_changed" });
    expect(m.edit.mock.calls[0][3]).toEqual({ expectedUpdatedAt: new Date("2026-11-18T00:00:00.000Z") });
  });
  it("rejects partial output without any write", async () => {
    m.smart.mockResolvedValue({ mainTitle: "Title", subTitle: "", smartSummary: "Summary", keywords: [], seo: { metaTitle: "", metaDescription: "" } });
    await expect(regenerateEditorExtras("en", "news", {})).rejects.toMatchObject({ code: "generation_failed" });
    expect(m.edit).not.toHaveBeenCalled();
  });
  it("rejects Arabic generation for English edition", async () => {
    m.smart.mockResolvedValue({ mainTitle: "عنوان عربي", subTitle: "", smartSummary: "", keywords: [], seo: {} });
    await expect(regenerateEditorExtras("en", "news", { fields: ["alternativeTitle"] })).rejects.toMatchObject({ code: "generation_failed" });
    expect(m.edit).not.toHaveBeenCalled();
  });
  it("rejects unknown fields before generation", async () => {
    await expect(regenerateEditorExtras("ar", "news", { fields: ["unknown"] })).rejects.toMatchObject({ code: "validation_error" });
    expect(m.smart).not.toHaveBeenCalled();
  });
});
