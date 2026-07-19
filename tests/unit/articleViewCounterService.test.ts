import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("articleViewCounterService", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("../../server/db");
  });

  it("combines repeated article increments into one batched update", async () => {
    const query = vi.fn().mockResolvedValue({});
    vi.doMock("../../server/db", () => ({ pool: { query } }));

    const counter = await import("../../server/services/articleViewCounterService");
    counter.bufferArticleViewIncrement("article-a", 5);
    counter.bufferArticleViewIncrement("article-a", 7);
    counter.bufferArticleViewIncrement("article-b", 3);

    await counter.flushArticleViewCounters();

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("UPDATE articles AS a");
    expect(query.mock.calls[0][1]).toEqual(["article-a", 12, "article-b", 3]);
  });

  it("re-buffers increments when a flush fails", async () => {
    const query = vi.fn()
      .mockRejectedValueOnce(new Error("temporary database failure"))
      .mockResolvedValueOnce({});
    vi.doMock("../../server/db", () => ({ pool: { query } }));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const counter = await import("../../server/services/articleViewCounterService");
    counter.bufferArticleViewIncrement("article-a", 9);

    await counter.flushArticleViewCounters();
    await counter.flushArticleViewCounters();

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][1]).toEqual(["article-a", 9]);
  });
});
