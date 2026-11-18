import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  smart: vi.fn(), nano: vi.fn(), resolveStyle: vi.fn(), upload: vi.fn(), save: vi.fn(), audit: vi.fn(), read: vi.fn(),
  title: vi.fn(), proofContent: vi.fn(), proofTitle: vi.fn(), compare: vi.fn(),
}));
vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/services/botDraftsService", async (original) => ({
  ...(await original<typeof import("../../server/services/botDraftsService")>()), resolveBotAuthorId: async () => "bot-author",
}));
vi.mock("../../server/services/imageModelRouter", () => ({ generateWithSmartRouter: m.smart }));
vi.mock("../../server/services/nanoBananaService", () => ({ generateImage: m.nano }));
vi.mock("../../server/services/imageStyleService", () => ({ resolveGenerationStyle: m.resolveStyle }));
vi.mock("../../server/services/newsImageStorageService", async (original) => ({
  ...(await original<typeof import("../../server/services/newsImageStorageService")>()),
  newsImageStorageService: { upload: m.upload },
}));
vi.mock("../../server/services/mediaGenerationService", () => ({ saveGeneratedImage: m.save }));
vi.mock("../../server/services/botEditorOperationsAudit", () => ({ recordBotEditorOperation: m.audit }));
vi.mock("../../server/services/botEditorReads", () => ({ readBotArticle: m.read }));
vi.mock("../../server/openai", () => ({ generateTitle: m.title, withRetry: (fn: () => unknown) => fn() }));
vi.mock("../../server/services/proofreadService", () => ({
  proofreadContent: m.proofContent, proofreadTitle: m.proofTitle,
  proofreadErrorResponse: () => ({ status: 502, body: { error: "x" } }),
}));
vi.mock("../../server/services/headlineCompareService", () => ({ compareHeadlines: m.compare }));

import { editBotImage, generateBotImage, isEditableSourceImageUrl } from "../../server/services/botEditorMedia";
import { compareBotHeadlines, proofreadBot, suggestBotTitles } from "../../server/services/botEditorAi";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const long = "نص طويل بما يكفي لاختبار التوليد الذكي للعناوين. ".repeat(3);

beforeEach(() => {
  vi.clearAllMocks();
  m.audit.mockResolvedValue(undefined);
  m.smart.mockResolvedValue({ success: true, imageData: png, modelUsed: "recraft-v3", detectedIntent: "photo" });
  m.upload.mockResolvedValue({ success: true, deliveryUrl: "https://media.sabq.org/x.png", thumbnailUrl: null });
  m.save.mockResolvedValue({ id: "media-1" });
});

describe("/images/generate intent, model and styleSlug", () => {
  it.each([["realistic", "photo"], ["illustration", "opinion_art"], ["explanatory", "infographic"]])("maps intent %s to the router task %s", async (intent, task) => {
    await generateBotImage("ar", { prompt: "صورة لاجتماع وزاري", intent });
    expect(m.smart).toHaveBeenCalledWith(expect.objectContaining({ intent: task, numImages: 1, aspectRatio: "16:9" }));
  });
  it("passes an allow-listed model and rejects unknown models, intents and extra keys", async () => {
    await generateBotImage("ar", { prompt: "صورة لاجتماع وزاري", model: "recraft-v3" });
    expect(m.smart).toHaveBeenCalledWith(expect.objectContaining({ model: "recraft-v3" }));
    for (const bad of [{ model: "dall-e-9" }, { intent: "cartoon" }, { styleSlug: "Bad Slug!" }, { sneaky: true }]) {
      await expect(generateBotImage("ar", { prompt: "صورة لاجتماع وزاري", ...bad })).rejects.toMatchObject({ httpStatus: 400, code: "validation_error" });
    }
  });
  it("composes the style prompt when styleSlug resolves and rejects an unknown slug", async () => {
    m.resolveStyle.mockResolvedValue({
      style: { slug: "realistic", name: "واقعي", stylePrompt: "photorealistic news photo", negativePrompt: "text", category: "photo" },
      variant: null, model: "gemini-nano-banana-2.1",
    });
    await generateBotImage("ar", { prompt: "اجتماع وزاري", styleSlug: "realistic", intent: "realistic" });
    const call = m.smart.mock.calls[0][0];
    expect(call.styleSlug).toBe("realistic");
    expect(call.model).toBe("gemini-nano-banana-2.1");
    expect(call.prompt).toContain("اجتماع وزاري");
    m.resolveStyle.mockResolvedValue({ style: { slug: "default" }, variant: null, model: "x" });
    await expect(generateBotImage("ar", { prompt: "اجتماع وزاري", styleSlug: "missing" })).rejects.toMatchObject({ httpStatus: 422 });
  });
  it("persists real bytes and audits success; a provider failure is audited and never returns a placeholder", async () => {
    const ok = await generateBotImage("ar", { prompt: "اجتماع وزاري", intent: "realistic" });
    expect(ok).toMatchObject({ deliveryUrl: "https://media.sabq.org/x.png", isAiGenerated: true, model: "recraft-v3" });
    expect(m.audit.mock.calls.map((c) => c[0].outcome)).toEqual(["started", "succeeded"]);
    m.audit.mockClear();
    m.smart.mockResolvedValue({ success: false });
    await expect(generateBotImage("ar", { prompt: "اجتماع وزاري" })).rejects.toMatchObject({ httpStatus: 502, code: "generation_failed" });
    expect(m.audit.mock.calls.map((c) => c[0].outcome)).toEqual(["started", "failed"]);
  });
});

describe("/images/edit", () => {
  it("only accepts Sabq-hosted source images (SSRF guard)", async () => {
    expect(isEditableSourceImageUrl("https://media.sabq.org/news/a.png")).toBe(true);
    expect(isEditableSourceImageUrl("http://media.sabq.org/a.png")).toBe(false);
    expect(isEditableSourceImageUrl("https://evil.example.com/a.png")).toBe(false);
    expect(isEditableSourceImageUrl("https://127.0.0.1/a.png")).toBe(false);
    for (const url of ["https://evil.example.com/a.png", "http://169.254.169.254/latest", "https://localhost/a.png"]) {
      await expect(editBotImage("ar", { sourceImageUrl: url, prompt: "أزل الخلفية" })).rejects.toMatchObject({ httpStatus: 422 });
    }
    expect(m.nano).not.toHaveBeenCalled();
  });
  it("fetches the source, sends it as a data: reference, stores the result", async () => {
    const bytes = Buffer.from(png, "base64");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, { status: 200, headers: { "content-type": "image/png" } })));
    m.nano.mockResolvedValue({ success: true, imageData: png, metadata: { model: "gemini-nano-banana-2.1" } });
    const result = await editBotImage("ar", { sourceImageUrl: "https://media.sabq.org/news/a.png", prompt: "أزل الخلفية" });
    expect(m.nano).toHaveBeenCalledWith(expect.objectContaining({ referenceImages: [expect.stringMatching(/^data:image\/png;base64,/)] }));
    expect(result).toMatchObject({ isAiGenerated: true, deliveryUrl: "https://media.sabq.org/x.png" });
    expect(m.audit.mock.calls.map((c) => c[0].outcome)).toEqual(["started", "succeeded"]);
    vi.unstubAllGlobals();
  });
  it("rejects a non-image response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } })));
    await expect(editBotImage("ar", { sourceImageUrl: "https://media.sabq.org/news/a.png", prompt: "أزل الخلفية" })).rejects.toMatchObject({ code: "invalid_image" });
    vi.unstubAllGlobals();
  });
});

describe("/ai/titles, /ai/proofread, /ai/compare-headlines", () => {
  it("titles: accepts content or articleId (one only), returns the model's list", async () => {
    m.title.mockResolvedValue(["عنوان أول", "عنوان ثان", "عنوان ثالث"]);
    expect(await suggestBotTitles("ar", { content: long })).toEqual({ titles: ["عنوان أول", "عنوان ثان", "عنوان ثالث"] });
    m.read.mockResolvedValue({ title: "قديم", content: `<p>${long}</p>` });
    await suggestBotTitles("ar", { articleId: "a1" });
    expect(m.read).toHaveBeenCalledWith("ar", "a1", { includeContent: "1" });
    for (const bad of [{}, { content: long, articleId: "a" }, { content: "قصير" }, { content: long, extra: 1 }]) {
      await expect(suggestBotTitles("ar", bad)).rejects.toMatchObject({ httpStatus: 400 });
    }
  });
  it("titles: a short stored body is 422 and a 429 from the provider maps to rate_limited", async () => {
    m.read.mockResolvedValue({ title: "t", content: "<p>قصير</p>" });
    await expect(suggestBotTitles("ar", { articleId: "a1" })).rejects.toMatchObject({ httpStatus: 422, code: "content_too_short" });
    m.title.mockRejectedValue(Object.assign(new Error("429 too many"), { status: 429 }));
    await expect(suggestBotTitles("ar", { content: long })).rejects.toMatchObject({ httpStatus: 429, code: "rate_limited" });
  });
  it("proofread: content, title or articleId, never writes", async () => {
    m.proofContent.mockResolvedValue({ corrected: "نص", changes: [] });
    m.proofTitle.mockResolvedValue({ corrected: "عنوان" });
    expect(await proofreadBot("ar", { content: long })).toEqual({ corrected: "نص", changes: [] });
    expect(await proofreadBot("ar", { title: "عنوان للتدقيق" })).toEqual({ corrected: "عنوان" });
    expect(m.proofContent).toHaveBeenCalledWith(long.trim(), "bot-author");
    await expect(proofreadBot("ar", { title: "عنوان للتدقيق", content: long })).rejects.toMatchObject({ httpStatus: 400 });
    m.proofContent.mockRejectedValue(new Error("boom"));
    await expect(proofreadBot("ar", { content: long })).rejects.toMatchObject({ httpStatus: 502 });
  });
  it("compare-headlines: wraps the shared service result", async () => {
    m.compare.mockResolvedValue([{ model: "a", title: "ب" }]);
    expect(await compareBotHeadlines("ar", { content: long, currentTitle: "الحالي" })).toEqual({ suggestions: [{ model: "a", title: "ب" }] });
    expect(m.compare).toHaveBeenCalledWith(long.trim(), "الحالي");
    await expect(compareBotHeadlines("ar", {})).rejects.toMatchObject({ httpStatus: 400 });
  });
});
