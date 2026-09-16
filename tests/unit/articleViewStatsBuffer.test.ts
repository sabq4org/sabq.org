import { describe, expect, it } from "vitest";
import { ArticleViewStatsBuffer } from "../../server/services/articleViewStatsBuffer";

describe("ArticleViewStatsBuffer", () => {
  it("aggregates repeated views by article and IP", () => {
    const buffer = new ArticleViewStatsBuffer();
    buffer.add("article-1", "hash-1", null);
    buffer.add("article-1", "hash-1", "user-1");
    buffer.add("article-1", "hash-1", null, 3);

    expect(buffer.size).toBe(1);
    expect(buffer.drain()).toEqual([
      {
        articleId: "article-1",
        ipHash: "hash-1",
        userId: "user-1",
        count: 5,
      },
    ]);
    expect(buffer.size).toBe(0);
  });

  it("merges a deferred chunk with views that arrived during the flush", () => {
    const buffer = new ArticleViewStatsBuffer();
    buffer.add("article-1", "hash-1", null, 2);
    const deferred = buffer.drain();

    buffer.add("article-1", "hash-1", "user-1", 1);
    for (const row of deferred) {
      buffer.add(row.articleId, row.ipHash, row.userId, row.count);
    }

    expect(buffer.drain()).toEqual([
      {
        articleId: "article-1",
        ipHash: "hash-1",
        userId: "user-1",
        count: 3,
      },
    ]);
  });
});
