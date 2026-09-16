import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryCache, StaleWhileRevalidateCache, withSWR, withCache, swrCache } from "../../server/memoryCache";

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

  it("keeps a hot old key and evicts the least-recently-used live key", () => {
    vi.useFakeTimers();
    const swr = new StaleWhileRevalidateCache(3);
    swr.set("old-but-hot", 1, 60_000, 60_000);
    vi.advanceTimersByTime(10);
    swr.set("least-recent", 2, 60_000, 60_000);
    vi.advanceTimersByTime(10);
    swr.set("newer", 3, 60_000, 60_000);
    vi.advanceTimersByTime(10);

    expect(swr.get("old-but-hot").data).toBe(1);
    vi.advanceTimersByTime(10);
    swr.set("newest", 4, 60_000, 60_000);

    expect(swr.get("old-but-hot").data).toBe(1);
    expect(swr.get("least-recent").data).toBeNull();
    expect(swr.get("newest").data).toBe(4);
  });
});

// single-flight: المتنافسون على نفس المفتاح يتشاركون وعد الجلب الجاري بدل
// الاستقصاء 6 ثوانٍ ثم بدء جلب مكرر. المفاتيح فريدة لكل اختبار لأن withSWR
// يعمل على الـsingleton المشترك swrCache.
let sfCounter = 0;
const sfKey = () => `test:single-flight:${++sfCounter}`;

describe("withSWR — single-flight", () => {
  it("concurrent callers on a cold key share one fetcher execution", async () => {
    const key = sfKey();
    let calls = 0;
    let resolveFetch!: (v: string) => void;
    const fetcher = () => {
      calls++;
      return new Promise<string>((res) => {
        resolveFetch = res;
      });
    };
    const p1 = withSWR(key, 60_000, 60_000, fetcher);
    const p2 = withSWR(key, 60_000, 60_000, fetcher);
    const p3 = withSWR(key, 60_000, 60_000, fetcher);
    expect(calls).toBe(1);
    resolveFetch("value");
    await expect(p1).resolves.toBe("value");
    await expect(p2).resolves.toBe("value");
    await expect(p3).resolves.toBe("value");
    expect(calls).toBe(1);
  });

  it("waiters share the in-flight promise with no 6s polling cap", async () => {
    vi.useFakeTimers();
    const key = sfKey();
    let calls = 0;
    const fetcher = () => {
      calls++;
      // fetch أبطأ من سقف الاستقصاء القديم (6 ثوانٍ) — سابقًا كان المنتظر
      // يستسلم ويبدأ جلبًا مكررًا؛ الآن ينتظر نفس الوعد مهما طال.
      return new Promise<string>((res) => setTimeout(() => res("slow"), 10_000));
    };
    const p1 = withSWR(key, 60_000, 60_000, fetcher);
    const p2 = withSWR(key, 60_000, 60_000, fetcher);
    await vi.advanceTimersByTimeAsync(10_500);
    await expect(p1).resolves.toBe("slow");
    await expect(p2).resolves.toBe("slow");
    expect(calls).toBe(1);
  });

  it("a rejected fetch rejects all awaiting callers without poisoning the cache", async () => {
    const key = sfKey();
    let calls = 0;
    const err = new Error("boom");
    const fetcher = () => {
      calls++;
      return Promise.reject<string>(err);
    };
    const p1 = withSWR(key, 60_000, 60_000, fetcher);
    const p2 = withSWR(key, 60_000, 60_000, fetcher);
    await expect(p1).rejects.toBe(err);
    await expect(p2).rejects.toBe(err);
    expect(calls).toBe(1);
    // لا بيانات محفوظة ولا وعد عالق — والمحاولة التالية تعيد الجلب فعليًا
    expect(swrCache.get(key).data).toBeNull();
    expect(swrCache.getInflight(key)).toBeNull();
    await expect(withSWR(key, 60_000, 60_000, async () => "ok")).resolves.toBe("ok");
  });

  it("serves stale immediately and runs exactly one background refresh", async () => {
    const key = sfKey();
    swrCache.set(key, "stale", 1, 60_000); // ttl 1ms → يصبح stale فورًا تقريبًا
    await new Promise((r) => setTimeout(r, 5));
    let calls = 0;
    let resolveFetch!: (v: string) => void;
    const fetcher = () => {
      calls++;
      return new Promise<string>((res) => {
        resolveFetch = res;
      });
    };
    await expect(withSWR(key, 60_000, 60_000, fetcher)).resolves.toBe("stale");
    await expect(withSWR(key, 60_000, 60_000, fetcher)).resolves.toBe("stale");
    expect(calls).toBe(1); // المتصل الثاني لم يبدأ تحديثًا خلفيًا مكررًا
    resolveFetch("fresh");
    await swrCache.getInflight<string>(key);
    await expect(withSWR(key, 60_000, 60_000, fetcher)).resolves.toBe("fresh");
    expect(calls).toBe(1);
  });

  it("forceFresh callers share the in-flight refresh instead of duplicating it", async () => {
    const key = sfKey();
    swrCache.set(key, "cached", 60_000, 60_000);
    let calls = 0;
    let resolveFetch!: (v: string) => void;
    const fetcher = () => {
      calls++;
      return new Promise<string>((res) => {
        resolveFetch = res;
      });
    };
    const p1 = withSWR(key, 60_000, 60_000, fetcher, true);
    const p2 = withSWR(key, 60_000, 60_000, fetcher, true);
    expect(calls).toBe(1);
    resolveFetch("forced");
    await expect(p1).resolves.toBe("forced");
    await expect(p2).resolves.toBe("forced");
    expect(calls).toBe(1);
  });
});

// حادثة VARA 2026-07-31: جلب علّق بلا اكتمال (استعلام DB بلا مهلة) فبقي وعده
// في خريطة inflight للأبد، وكل طلب جديد انضم إليه — تعليق أبدي لمفاتيح
// spl:today/spl:live:all حتى إعادة النشر. هذه الاختبارات تثبّت الحاجزين:
// سقف انتظار المستدعي (20 ثانية افتراضيًا) وإسقاط الوعد المسموم (45 ثانية).
describe("withSWR — poisoned in-flight recovery", () => {
  it("a caller never waits past the deadline on a hung fetch", async () => {
    vi.useFakeTimers();
    const key = sfKey();
    const fetcher = () => new Promise<string>(() => {}); // لا يكتمل أبدًا
    const p = withSWR(key, 60_000, 60_000, fetcher);
    const rejection = expect(p).rejects.toThrow(/fetch wait exceeded/);
    await vi.advanceTimersByTimeAsync(20_100);
    await rejection;
  });

  it("a hung fetch poisons the key only until the max age — then a new fetch starts", async () => {
    vi.useFakeTimers();
    const key = sfKey();
    let calls = 0;
    const fetcher = () => {
      calls++;
      if (calls === 1) return new Promise<string>(() => {}); // الجلب الأول يعلّق
      return Promise.resolve("recovered");
    };
    const p1 = withSWR(key, 60_000, 60_000, fetcher);
    p1.catch(() => {});
    // منضم أثناء حياة الوعد يتشاركه — لا جلب مكرر
    const p2 = withSWR(key, 60_000, 60_000, fetcher);
    p2.catch(() => {});
    expect(calls).toBe(1);
    // بعد تجاوز العمر الأقصى يُسقَط الوعد المسموم ويبدأ الطالب جلبًا جديدًا
    await vi.advanceTimersByTimeAsync(46_000);
    await expect(withSWR(key, 60_000, 60_000, fetcher)).resolves.toBe("recovered");
    expect(calls).toBe(2);
  });

  it("a stuck background refresh stops blocking future refreshes after the max age", async () => {
    vi.useFakeTimers();
    const key = sfKey();
    swrCache.set(key, "stale", 1, 600_000); // يصبح stale فورًا، وصالحًا طويلًا
    await vi.advanceTimersByTimeAsync(5);
    let calls = 0;
    const fetcher = () => {
      calls++;
      if (calls === 1) return new Promise<string>(() => {}); // التحديث الأول يعلّق
      return Promise.resolve("fresh");
    };
    await expect(withSWR(key, 1, 600_000, fetcher)).resolves.toBe("stale");
    expect(calls).toBe(1); // انطلق تحديث خلفي واحد… وعلّق
    await expect(withSWR(key, 1, 600_000, fetcher)).resolves.toBe("stale");
    expect(calls).toBe(1); // العلم الحي يمنع تحديثًا مكررًا
    await vi.advanceTimersByTimeAsync(46_000);
    await expect(withSWR(key, 1, 600_000, fetcher)).resolves.toBe("stale");
    expect(calls).toBe(2); // العلم المعمّر سقط — تحديث جديد انطلق فعلًا
  });
});

describe("withCache — poisoned in-flight recovery", () => {
  it("hung fetch: waiter rejects at the deadline and the key self-heals after max age", async () => {
    vi.useFakeTimers();
    const key = "test:withcache:poisoned";
    let calls = 0;
    const fetcher = () => {
      calls++;
      if (calls === 1) return new Promise<string>(() => {}); // الجلب الأول يعلّق
      return Promise.resolve("recovered");
    };
    const p1 = withCache(key, 60_000, fetcher);
    const rejection = expect(p1).rejects.toThrow(/fetch wait exceeded/);
    await vi.advanceTimersByTimeAsync(20_100);
    await rejection;
    // قبل بلوغ العمر الأقصى: المنضم الجديد ما زال على الوعد الأول
    const p2 = withCache(key, 60_000, fetcher);
    p2.catch(() => {});
    expect(calls).toBe(1);
    // بعد العمر الأقصى: الوعد المسموم يُسقَط ويبدأ جلب جديد ينجح
    await vi.advanceTimersByTimeAsync(26_000);
    await expect(withCache(key, 60_000, fetcher)).resolves.toBe("recovered");
    expect(calls).toBe(2);
  });
});
