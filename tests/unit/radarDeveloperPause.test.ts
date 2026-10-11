import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ enabled: true }));
const search = vi.hoisted(() => ({ searchWeb: vi.fn() }));
const ai = vi.hoisted(() => ({ generateWithFallback: vi.fn() }));

vi.mock("../../server/services/radar/runtime", () => ({
  assertRadarEnabled: vi.fn(async () => {
    if (!state.enabled) throw Object.assign(new Error("RADAR_DISABLED"), { code: "RADAR_DISABLED", reason: "paused" });
  }),
  isRadarDisabledError: (error: unknown) => Boolean(error && typeof error === "object" && (error as any).code === "RADAR_DISABLED"),
}));
vi.mock("../../server/services/webSearchService", () => ({
  isWebSearchConfigured: vi.fn(() => true),
  searchWeb: search.searchWeb,
}));
vi.mock("../../server/services/radar/aiChain", () => ({ generateWithFallback: ai.generateWithFallback }));
vi.mock("../../server/services/radar/repo", () => ({
  approvedCategories: vi.fn(async () => [{ slug: "world", nameAr: "العالم" }]),
  getSource: vi.fn(async () => ({ name: "Source", categorySlug: "world" })),
  updateItem: vi.fn(async (_id: string, patch: any) => ({ id: "item-1", ...patch })),
}));

import { developItem } from "../../server/services/radar/developer";

const item: any = {
  id: "item-1",
  sourceId: "source-1",
  link: "https://example.com/story",
  originalLanguage: "en",
  originalTitle: "First title",
  originalExcerpt: "Original excerpt",
  translatedTitle: "عنوان أول",
  translatedSummary: "ملخص أول",
};

const draftResponse = {
  content: JSON.stringify({
    title: "عنوان الخبر",
    subheadline: "عنوان فرعي",
    content: "<p>نص الخبر</p>",
    excerpt: "مقتطف",
    summary: "موجز",
    tags: [],
    seoTitle: "عنوان الخبر",
    seoDescription: "وصف الخبر",
    seoKeywords: [],
    categorySlug: "world",
    editorNotes: ["note"],
    sources: [],
  }),
  provider: "openai",
  model: "test",
};

describe("Radar developer search pause boundary", () => {
  beforeEach(() => {
    state.enabled = true;
    search.searchWeb.mockReset();
    ai.generateWithFallback.mockReset();
    ai.generateWithFallback.mockResolvedValue(draftResponse);
  });

  it("stops before the next search query when pause arrives after a result", async () => {
    search.searchWeb.mockImplementationOnce(async () => {
      state.enabled = false;
      return [{ title: "Result 1", url: "https://example.com/1", snippet: "Snippet" }];
    });

    await expect(developItem(item)).rejects.toMatchObject({ code: "RADAR_DISABLED" });
    expect(search.searchWeb).toHaveBeenCalledTimes(1);
    expect(ai.generateWithFallback).not.toHaveBeenCalled();
  });

  it("checks each query again after resume and deduplicates results", async () => {
    search.searchWeb
      .mockResolvedValueOnce([{ title: "Result 1", url: "https://example.com/1", snippet: "One" }])
      .mockResolvedValueOnce([
        { title: "Result 1 duplicate", url: "https://example.com/1", snippet: "Duplicate" },
        { title: "Result 2", url: "https://example.com/2", snippet: "Two" },
      ]);

    await expect(developItem(item)).resolves.toMatchObject({ id: "item-1", status: "ready" });
    expect(search.searchWeb).toHaveBeenCalledTimes(2);
    expect(ai.generateWithFallback).toHaveBeenCalledTimes(1);
    const prompt = ai.generateWithFallback.mock.calls[0][0] as string;
    expect(prompt).toContain("https://example.com/1");
    expect(prompt).toContain("https://example.com/2");
    expect(prompt.match(/https:\/\/example\.com\/1/g)).toHaveLength(1);
  });
});
