import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("keywordService SEO fallback", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("../../server/db");
    vi.restoreAllMocks();
  });

  function loadService(responses: unknown[], fallback: ReturnType<typeof vi.fn>) {
    const execute = vi.fn(async () => responses.shift());
    vi.doMock("../../server/db", () => ({
      db: { execute },
      executeWithStatementTimeout: fallback,
    }));
    return import("../../server/services/keywordService").then((service) => ({
      service,
      execute,
    }));
  }

  it("keeps the indexed tag path free of the fallback transaction", async () => {
    const fallback = vi.fn();
    const { service, execute } = await loadService(
      [{ rows: [{ id: "tag-hit" }] }, { rows: [] }],
      fallback,
    );

    const result = await service.getArticlesByKeyword("economy");

    expect(result.articles).toEqual([{ id: "tag-hit" }]);
    expect(fallback).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("preserves case-insensitive fallback results and applies a 750ms server timeout", async () => {
    const fallback = vi.fn().mockResolvedValue({ rows: [{ id: "seo-hit" }] });
    const { service } = await loadService(
      [{ rows: [] }, { rows: [] }, { rows: [] }],
      fallback,
    );

    const result = await service.getArticlesByKeyword("Economy");

    expect(result.articles).toEqual([{ id: "seo-hit" }]);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(fallback.mock.calls[0][1]).toBe(750);
    expect(fallback.mock.calls[0][0]).toBeDefined();
  });

  it("degrades only a statement timeout to an empty article result", async () => {
    const fallback = vi.fn().mockRejectedValue({ code: "57014" });
    const { service } = await loadService(
      [{ rows: [] }, { rows: [] }, { rows: [] }],
      fallback,
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(service.getArticlesByKeyword("Economy")).resolves.toEqual({
      articles: [],
      muqtarabTopics: [],
    });
  });

  it("propagates non-timeout database errors", async () => {
    const fallback = vi.fn().mockRejectedValue({ code: "53300" });
    const { service } = await loadService(
      [{ rows: [] }, { rows: [] }, { rows: [] }],
      fallback,
    );

    await expect(service.getArticlesByKeyword("Economy")).rejects.toMatchObject({
      code: "53300",
    });
  });
});
