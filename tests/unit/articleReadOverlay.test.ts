import { describe, expect, it, vi } from "vitest";
import { createArticleReadOverlayCoalescer } from "../../server/services/articleReadOverlay";

describe("article burst neutral reads", () => {
  it("collapses 1000 overlapping reads, isolates response mutation, and reads fresh after completion", async () => {
    const read = createArticleReadOverlayCoalescer();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    const load = vi.fn(async () => {
      await gate;
      return { views: 10, mediaAssets: [{ url: "https://media.example/photo.webp", altText: "صورة", displayOrder: 0 }] };
    });
    const requests = Array.from({ length: 1000 }, () => read("breaking", load));
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    finish();
    const results = await Promise.all(requests);
    results[0].mediaAssets[0].altText = "per-request change";
    expect(results[1].mediaAssets[0].altText).toBe("صورة");
    expect(await read("breaking", async () => ({ views: 20, mediaAssets: [] })))
      .toEqual({ views: 20, mediaAssets: [] });
  });

  it("keeps article keys separate and recovers after a shared failure", async () => {
    const read = createArticleReadOverlayCoalescer();
    const failed = vi.fn(async () => { throw new Error("database unavailable"); });
    const results = await Promise.allSettled([read("a", failed), read("a", failed)]);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(failed).toHaveBeenCalledTimes(1);
    const [a, b] = await Promise.all([
      read("a", async () => ({ views: 1, mediaAssets: [] })),
      read("b", async () => ({ views: 2, mediaAssets: [] })),
    ]);
    expect([a.views, b.views]).toEqual([1, 2]);
  });

  it("bounds tracked keys without losing readers or evicting a hot flight", async () => {
    const read = createArticleReadOverlayCoalescer(1);
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    const load = vi.fn(async () => { await gate; return { views: 1, mediaAssets: [] }; });
    const a = read("a", load);
    const b = read("b", load);
    const again = read("a", load);
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(2);
    finish();
    expect(await Promise.all([a, b, again])).toHaveLength(3);
  });

  it("releases stalled reads at the deadline and ignores their late completion", async () => {
    vi.useFakeTimers();
    try {
      const read = createArticleReadOverlayCoalescer(256, 100);
      let finish!: (value: { views: number; mediaAssets: [] }) => void;
      const load = vi.fn(() => new Promise<{ views: number; mediaAssets: [] }>((resolve) => { finish = resolve; }));
      const failed = Promise.allSettled([read("a", load), read("a", load)]);
      await vi.advanceTimersByTimeAsync(100);
      expect((await failed).every((result) => result.status === "rejected")).toBe(true);
      expect(load).toHaveBeenCalledTimes(1);
      expect((await read("a", async () => ({ views: 2, mediaAssets: [] }))).views).toBe(2);
      finish({ views: 1, mediaAssets: [] });
      expect((await read("a", async () => ({ views: 3, mediaAssets: [] }))).views).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
