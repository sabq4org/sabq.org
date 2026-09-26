import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redisState = vi.hoisted(() => ({
  client: null as null | {
    get: (key: string) => Promise<string | null>;
    set: (key: string, val: string, opts?: unknown) => Promise<unknown>;
  },
}));

vi.mock("../../server/redis", () => ({
  getRedisClient: () => redisState.client,
}));

import {
  PUBLISHED_ARTICLE_COUNTS_TTL_MS,
  readPublishedArticleCounts,
  resetPublishedArticleCountsCacheForTests,
} from "../../server/services/publishedArticleCountsCache";

const counts = { totalPublished: 945213, todayPublished: 42 };

beforeEach(() => {
  redisState.client = null;
  resetPublishedArticleCountsCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("published article counts cache", () => {
  it("serves the in-process value until the 60s TTL expires", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-26T12:00:00.000Z"));
    const load = vi.fn()
      .mockResolvedValueOnce(counts)
      .mockResolvedValueOnce({ totalPublished: 945214, todayPublished: 43 });

    await expect(readPublishedArticleCounts(load)).resolves.toEqual(counts);
    vi.setSystemTime(new Date("2026-09-26T12:00:59.999Z"));
    await expect(readPublishedArticleCounts(load)).resolves.toEqual(counts);
    expect(load).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-09-26T12:01:00.000Z"));
    await expect(readPublishedArticleCounts(load)).resolves.toEqual({
      totalPublished: 945214,
      todayPublished: 43,
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(PUBLISHED_ARTICLE_COUNTS_TTL_MS).toBe(60_000);
  });

  it("coalesces concurrent misses into one load", async () => {
    let release!: (value: typeof counts) => void;
    const load = vi.fn(() => new Promise<typeof counts>((resolve) => {
      release = resolve;
    }));

    const pending = Array.from({ length: 20 }, () => readPublishedArticleCounts(load));
    expect(load).toHaveBeenCalledTimes(1);
    release(counts);

    await expect(Promise.all(pending)).resolves.toEqual(Array.from({ length: 20 }, () => counts));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("falls open to the database when Redis get or set fails", async () => {
    const get = vi.fn().mockRejectedValue(new Error("redis get failed"));
    const set = vi.fn().mockRejectedValue(new Error("redis set failed"));
    redisState.client = { get, set };
    const load = vi.fn().mockResolvedValue(counts);

    await expect(readPublishedArticleCounts(load)).resolves.toEqual(counts);
    expect(load).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);

    resetPublishedArticleCountsCacheForTests();
    get.mockImplementation(() => {
      throw new Error("redis get threw");
    });
    await expect(readPublishedArticleCounts(load)).resolves.toEqual(counts);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not cache a database failure", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(counts);

    await expect(readPublishedArticleCounts(load)).rejects.toThrow("database unavailable");
    await expect(readPublishedArticleCounts(load)).resolves.toEqual(counts);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
