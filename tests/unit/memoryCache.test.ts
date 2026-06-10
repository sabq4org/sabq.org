import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryCache, StaleWhileRevalidateCache } from "../../server/memoryCache";

// Audit M1.1: both caches were unbounded Maps — a flood of unique keys
// inside one TTL window could OOM the pod. These tests pin the cap contract:
// size never exceeds maxEntries, expired entries are evicted before live
// ones, and among live entries the oldest go first.

afterEach(() => {
  vi.useRealTimers();
});

describe("MemoryCache — size cap", () => {
  it("never grows past maxEntries", () => {
    const cache = new MemoryCache(10);
    for (let i = 0; i < 100; i++) cache.set(`k${i}`, i, 60_000);
    expect(cache.size()).toBeLessThanOrEqual(10);
    cache.destroy();
  });

  it("overwriting an existing key does not trigger eviction", () => {
    const cache = new MemoryCache(3);
    cache.set("a", 1, 60_000);
    cache.set("b", 2, 60_000);
    cache.set("c", 3, 60_000);
    cache.set("a", 99, 60_000); // same key — still 3 entries, no eviction
    expect(cache.size()).toBe(3);
    expect(cache.get("a")).toBe(99);
    expect(cache.get("b")).toBe(2);
    cache.destroy();
  });

  it("evicts expired entries before touching live ones", () => {
    vi.useFakeTimers();
    const cache = new MemoryCache(3);
    cache.set("expired", "x", 1_000);
    vi.advanceTimersByTime(2_000); // "expired" is now past its TTL
    cache.set("live1", 1, 60_000);
    cache.set("live2", 2, 60_000);
    cache.set("live3", 3, 60_000); // cap hit → expired entry goes, live stay
    expect(cache.get("live1")).toBe(1);
    expect(cache.get("live2")).toBe(2);
    expect(cache.get("live3")).toBe(3);
    cache.destroy();
  });

  it("evicts the oldest live entries when nothing is expired", () => {
    vi.useFakeTimers();
    const cache = new MemoryCache(3);
    cache.set("oldest", 1, 60_000);
    vi.advanceTimersByTime(10);
    cache.set("mid", 2, 60_000);
    vi.advanceTimersByTime(10);
    cache.set("newer", 3, 60_000);
    vi.advanceTimersByTime(10);
    cache.set("newest", 4, 60_000); // cap hit → "oldest" must be the victim
    expect(cache.get("oldest")).toBeNull();
    expect(cache.get("newest")).toBe(4);
    expect(cache.size()).toBeLessThanOrEqual(3);
    cache.destroy();
  });

  it("get() still expires entries by TTL", () => {
    vi.useFakeTimers();
    const cache = new MemoryCache(10);
    cache.set("k", "v", 1_000);
    expect(cache.get("k")).toBe("v");
    vi.advanceTimersByTime(1_001);
    expect(cache.get("k")).toBeNull();
    cache.destroy();
  });
});

describe("StaleWhileRevalidateCache — size cap", () => {
  it("never grows past maxEntries (it has no periodic sweep at all)", () => {
    const swr = new StaleWhileRevalidateCache(10);
    for (let i = 0; i < 100; i++) swr.set(`k${i}`, i, 60_000, 60_000);
    let alive = 0;
    for (let i = 0; i < 100; i++) {
      if (swr.get(`k${i}`).data !== null) alive++;
    }
    expect(alive).toBeLessThanOrEqual(10);
  });

  it("prefers fully-expired entries (past ttl+swr window) as victims", () => {
    vi.useFakeTimers();
    const swr = new StaleWhileRevalidateCache(3);
    swr.set("dead", "x", 500, 500); // fully expired after 1s
    vi.advanceTimersByTime(2_000);
    swr.set("live1", 1, 60_000);
    swr.set("live2", 2, 60_000);
    swr.set("live3", 3, 60_000); // cap hit → "dead" evicted, live kept
    expect(swr.get("live1").data).toBe(1);
    expect(swr.get("live2").data).toBe(2);
    expect(swr.get("live3").data).toBe(3);
  });

  it("keeps serving stale-but-revalidatable data (SWR semantics intact)", () => {
    vi.useFakeTimers();
    const swr = new StaleWhileRevalidateCache(10);
    swr.set("k", "v", 1_000, 10_000);
    vi.advanceTimersByTime(2_000); // past ttl, inside swr window
    const r = swr.get<string>("k");
    expect(r.data).toBe("v");
    expect(r.isStale).toBe(true);
    expect(r.shouldRefresh).toBe(true);
  });
});
