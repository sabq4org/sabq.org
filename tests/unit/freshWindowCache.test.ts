import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryCache } from "../../server/memoryCache";
import { FRESH_WINDOW_MS, readWithFreshWindow } from "../../server/utils/freshWindowCache";

// حادثة عاجل 2026-09-26: طلبات iOS «الطازجة» (Cache-Control: no-cache) كانت
// تتجاوز كاش الخادم كليًا فتُبنى الرئيسية لكل جهاز. هذه الاختبارات تثبت أن
// موجة الطلبات الطازجة المتزامنة تنفّذ جلبًا واحدًا، وأن النافذة محدودة.

let seq = 0;
const nextKey = () => `mobile:test-fresh-window:${++seq}`;

afterEach(() => {
  vi.useRealTimers();
});

describe("readWithFreshWindow", () => {
  it("coalesces a burst of fresh requests into one fetch", async () => {
    const key = nextKey();
    let resolve!: (v: { n: number }) => void;
    const fetcher = vi.fn(() => new Promise<{ n: number }>((r) => (resolve = r)));

    const burst = Array.from({ length: 500 }, () => readWithFreshWindow(key, 60_000, true, fetcher));
    resolve({ n: 1 });
    const results = await Promise.all(burst);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.n === 1)).toBe(true);
  });

  it("serves fresh requests from the window instead of refetching each time", async () => {
    const key = nextKey();
    const fetcher = vi.fn(async () => ({ n: fetcher.mock.calls.length }));

    await readWithFreshWindow(key, 60_000, true, fetcher);
    await readWithFreshWindow(key, 60_000, true, fetcher);
    await readWithFreshWindow(key, 60_000, true, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetches a fresh request once the window has passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const key = nextKey();
    const fetcher = vi.fn(async () => ({ n: fetcher.mock.calls.length }));

    const first = await readWithFreshWindow(key, 60_000, true, fetcher);
    vi.setSystemTime(Date.now() + FRESH_WINDOW_MS + 1);
    const second = await readWithFreshWindow(key, 60_000, true, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(second.n).toBeGreaterThan(first.n);
  });

  it("a fresh fetch also refreshes the normal cached copy", async () => {
    const key = nextKey();
    await readWithFreshWindow(key, 60_000, false, async () => ({ v: "old" }));
    await readWithFreshWindow(key, 60_000, true, async () => ({ v: "new" }));

    const normal = await readWithFreshWindow(key, 60_000, false, async () => ({ v: "unused" }));
    expect(normal.v).toBe("new");
  });

  it("publish invalidation of the base prefix also clears the fresh copy", async () => {
    const key = nextKey();
    const fetcher = vi.fn(async () => ({ n: fetcher.mock.calls.length }));

    await readWithFreshWindow(key, 60_000, true, fetcher);
    memoryCache.invalidatePatterns(["^mobile"]);
    await readWithFreshWindow(key, 60_000, true, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
