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
    const query = vi.fn().mockResolvedValue({
      rows: [
        { id: "article-a", article_exists: true, updated: true },
        { id: "article-b", article_exists: true, updated: true },
      ],
    });
    vi.doMock("../../server/db", () => ({ pool: { query } }));

    const counter = await import("../../server/services/articleViewCounterService");
    counter.bufferArticleViewIncrement("article-a", 5);
    counter.bufferArticleViewIncrement("article-a", 7);
    counter.bufferArticleViewIncrement("article-b", 3);

    await counter.flushArticleViewCounters();

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("FOR UPDATE OF a SKIP LOCKED");
    expect(query.mock.calls[0][1]).toEqual(["article-a", 12, "article-b", 3]);
  });

  it("retries only rows skipped because they are locked", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [
          { id: "article-a", article_exists: true, updated: false },
          { id: "article-b", article_exists: true, updated: true },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "article-a", article_exists: true, updated: true }],
      });
    vi.doMock("../../server/db", () => ({ pool: { query } }));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const counter = await import("../../server/services/articleViewCounterService");
    counter.bufferArticleViewIncrement("article-a", 5);
    counter.bufferArticleViewIncrement("article-b", 7);

    await counter.flushArticleViewCounters();
    await counter.flushArticleViewCounters();

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][1]).toEqual(["article-a", 5]);
  });

  it("does not retry counters for articles that no longer exist", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: "deleted-article", article_exists: false, updated: false }],
    });
    vi.doMock("../../server/db", () => ({ pool: { query } }));

    const counter = await import("../../server/services/articleViewCounterService");
    counter.bufferArticleViewIncrement("deleted-article", 4);

    await counter.flushArticleViewCounters();
    await counter.flushArticleViewCounters();

    expect(query).toHaveBeenCalledTimes(1);
  });

  it("re-buffers increments when a flush fails", async () => {
    const query = vi.fn()
      .mockRejectedValueOnce(new Error("temporary database failure"))
      .mockResolvedValueOnce({
        rows: [{ id: "article-a", article_exists: true, updated: true }],
      });
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
