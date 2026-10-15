import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SportsComponentSnapshot } from "../../server/services/sportsComponentSnapshot";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-05T12:00:00Z")); });
afterEach(() => vi.useRealTimers());
const flush = async () => { await vi.advanceTimersByTimeAsync(0); };

describe("homepage sports fallback", () => {
  it("coalesces a cold burst and warm refresh, preserves the last good timestamp during failure, then recovers", async () => {
    const cache = new SportsComponentSnapshot<number>({ blockedForMs: () => 0 });
    let resolve!: (value: number) => void;
    const load = vi.fn(() => new Promise<number>(r => { resolve = r; }));
    const readers = Array.from({ length: 100 }, () => cache.get("today:ar", load));
    await flush(); expect(load).toHaveBeenCalledTimes(1);
    resolve(2); const first = await Promise.all(readers);
    expect(first.every(r => r.data === 2 && r.freshness.state === "fresh")).toBe(true);
    await vi.advanceTimersByTimeAsync(16_000);
    load.mockRejectedValue(new Error("429"));
    const stale = await cache.get("today:ar", load);
    expect(stale.freshness.state).toBe("stale");
    expect(stale.freshness.updatedAt).toBe(first[0].freshness.updatedAt);
    await flush();
    await Promise.all(Array.from({ length: 100 }, () => cache.get("today:ar", load)));
    expect(load).toHaveBeenCalledTimes(2);
    load.mockResolvedValue(3);
    await vi.advanceTimersByTimeAsync(15_001);
    expect((await cache.get("today:ar", load)).data).toBe(2);
    await flush();
    const recovered = await cache.get("today:ar", load);
    expect(recovered.data).toBe(3); expect(recovered.freshness.state).toBe("fresh");
  });

  it("respects provider cooldown even with a fresh snapshot and bounds stale data to ten minutes", async () => {
    let blocked = 0;
    const cache = new SportsComponentSnapshot<number>({ blockedForMs: () => blocked });
    const load = vi.fn().mockResolvedValue(1);
    await cache.get("kc:ar", load);
    blocked = 30_000;
    const fallback = await cache.get("kc:ar", load);
    expect(fallback.freshness).toMatchObject({ state: "stale", retryAfterSeconds: 30 });
    await vi.advanceTimersByTimeAsync(600_001);
    await expect(cache.get("kc:ar", load)).rejects.toMatchObject({ retryAfterSeconds: 30 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("ends cold waiting at three seconds without releasing the single-flight fetch", async () => {
    const cache = new SportsComponentSnapshot<number>({ blockedForMs: () => 0 });
    let resolve!: (value: number) => void;
    const load = vi.fn(() => new Promise<number>(r => { resolve = r; }));
    const first = expect(cache.get("cold", load)).rejects.toMatchObject({ retryAfterSeconds: 15 });
    await vi.advanceTimersByTimeAsync(3_001); await first;
    const second = cache.get("cold", load); await flush();
    expect(load).toHaveBeenCalledTimes(1);
    resolve(5); expect((await second).data).toBe(5);
  });

  it("backs off cold failures instead of starting a new provider call for each visitor", async () => {
    const load = vi.fn().mockRejectedValue(new Error("offline"));
    const cache = new SportsComponentSnapshot<number>({ blockedForMs: () => 0 });
    await expect(cache.get("cold", load)).rejects.toThrow();
    await Promise.all(Array.from({ length: 100 }, () => cache.get("cold", load).catch(() => null)));
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_001);
    await expect(cache.get("cold", load)).rejects.toThrow(); expect(load).toHaveBeenCalledTimes(2);
  });

  it("separates language and date keys and bounds cardinality without evicting running work", async () => {
    const cache = new SportsComponentSnapshot<string>({ blockedForMs: () => 0, maxKeys: 2 });
    expect((await cache.get("ar:today", async () => "عربي")).data).toBe("عربي");
    expect((await cache.get("en:today", async () => "English")).data).toBe("English");
    expect((await cache.get("ar:tomorrow", async () => "غدًا")).data).toBe("غدًا");
    const refetch = vi.fn().mockResolvedValue("جديد");
    await cache.get("ar:today", refetch); expect(refetch).toHaveBeenCalledTimes(1);
    const busy = new SportsComponentSnapshot<string>({ blockedForMs: () => 0, maxKeys: 1 });
    let finish!: (value: string) => void;
    const running = busy.get("a", () => new Promise(r => { finish = r; }));
    await flush();
    await expect(busy.get("b", refetch)).rejects.toThrow();
    finish("done"); await running;
  });
});
