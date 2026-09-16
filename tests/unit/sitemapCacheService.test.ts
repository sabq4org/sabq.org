import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("sitemapCacheService", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("../../server/redis");
  });

  it("does not retain generated XML in process memory", async () => {
    const build = vi.fn()
      .mockResolvedValueOnce("<xml>first</xml>")
      .mockResolvedValueOnce("<xml>second</xml>");
    vi.doMock("../../server/redis", () => ({ getRedisClient: () => null }));

    const cache = await import("../../server/services/sitemapCacheService");

    await expect(cache.getOrBuildSitemapXml("ar_1", 60_000, build)).resolves.toBe("<xml>first</xml>");
    await expect(cache.getOrBuildSitemapXml("ar_1", 60_000, build)).resolves.toBe("<xml>second</xml>");
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("reads Redis on every completed request instead of using an L1 Map", async () => {
    const get = vi.fn().mockResolvedValue("<xml>redis</xml>");
    const set = vi.fn();
    const build = vi.fn();
    vi.doMock("../../server/redis", () => ({
      getRedisClient: () => ({ get, set }),
    }));

    const cache = await import("../../server/services/sitemapCacheService");

    await cache.getOrBuildSitemapXml("ar_2", 60_000, build);
    await cache.getOrBuildSitemapXml("ar_2", 60_000, build);

    expect(get).toHaveBeenCalledTimes(2);
    expect(build).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("coalesces concurrent misses for the same sitemap key", async () => {
    let releaseBuild!: (value: string) => void;
    const build = vi.fn(() => new Promise<string>((resolve) => {
      releaseBuild = resolve;
    }));
    const get = vi.fn().mockResolvedValue(null);
    const set = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../../server/redis", () => ({
      getRedisClient: () => ({ get, set }),
    }));

    const cache = await import("../../server/services/sitemapCacheService");
    const first = cache.getOrBuildSitemapXml("ar_3", 60_000, build);
    const second = cache.getOrBuildSitemapXml("ar_3", 60_000, build);

    await vi.waitFor(() => expect(build).toHaveBeenCalledTimes(1));
    releaseBuild("<xml>shared</xml>");

    await expect(Promise.all([first, second])).resolves.toEqual([
      "<xml>shared</xml>",
      "<xml>shared</xml>",
    ]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it("clears single-flight state after a failed build", async () => {
    const build = vi.fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce("<xml>recovered</xml>");
    vi.doMock("../../server/redis", () => ({ getRedisClient: () => null }));

    const cache = await import("../../server/services/sitemapCacheService");

    await expect(cache.getOrBuildSitemapXml("ar_4", 60_000, build)).rejects.toThrow("database unavailable");
    await expect(cache.getOrBuildSitemapXml("ar_4", 60_000, build)).resolves.toBe("<xml>recovered</xml>");
    expect(build).toHaveBeenCalledTimes(2);
  });
});
