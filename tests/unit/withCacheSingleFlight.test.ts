import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));

import { memoryCache, withCache } from "../../server/memoryCache";

/** وعد يمكن حسمه يدويًا — يبقي الجلب "جاريًا" حتى نقرر. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("withCache single-flight", () => {
  beforeEach(() => {
    memoryCache.clear();
  });

  it("يدمج الطلبات المتزامنة على نفس المفتاح في جلب واحد", async () => {
    const gate = deferred<string>();
    const fetcher = vi.fn(() => gate.promise);

    // موجة خبر عاجل: 50 طلبًا متزامنًا على مفتاح بارد.
    const waves = Array.from({ length: 50 }, () =>
      withCache("article:detail:anonymous:breaking", 60_000, fetcher),
    );

    gate.resolve("payload");
    const results = await Promise.all(waves);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r === "payload")).toBe(true);
  });

  it("يخدم الطلبات اللاحقة من الكاش بلا جلب جديد", async () => {
    const fetcher = vi.fn(async () => "cached");

    await withCache("k:hit", 60_000, fetcher);
    await withCache("k:hit", 60_000, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("يبدأ جلبًا جديدًا بعد انتهاء الجلب السابق (لا يعلق المفتاح)", async () => {
    const fetcher = vi.fn(async () => "v");

    await withCache("k:sequential", 60_000, fetcher);
    memoryCache.delete("k:sequential");
    await withCache("k:sequential", 60_000, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("لا يخزّن نتيجة جلب أُبطل مفتاحه أثناء تنفيذه", async () => {
    const gate = deferred<string>();
    const fetcher = vi.fn(() => gate.promise);

    // الجلب بدأ قبل التعديل...
    const inflight = withCache("article:detail:anonymous:x", 60_000, fetcher);
    // ...ثم نشر المحرّر تعديلًا فأبطل المفتاح...
    memoryCache.invalidatePattern("^article:");
    // ...ثم وصلت النتيجة القديمة.
    gate.resolve("stale");

    await expect(inflight).resolves.toBe("stale");
    // المنتظر يستلمها، لكنها لا تُخزَّن — وإلا بقيت حيّة طوال TTL رغم التعديل.
    expect(memoryCache.get("article:detail:anonymous:x")).toBeNull();
  });

  it("الإبطال بالبادئة والمسح الكامل يمنعان التخزين كذلك", async () => {
    const byPrefix = deferred<string>();
    const byClear = deferred<string>();

    const p1 = withCache("pfx:a", 60_000, () => byPrefix.promise);
    memoryCache.invalidateByPrefix("pfx:");
    byPrefix.resolve("old");
    await p1;
    expect(memoryCache.get("pfx:a")).toBeNull();

    const p2 = withCache("any:b", 60_000, () => byClear.promise);
    memoryCache.clear();
    byClear.resolve("old");
    await p2;
    expect(memoryCache.get("any:b")).toBeNull();
  });

  it("الفشل يصل لكل المنتظرين ولا يلوّث الكاش", async () => {
    const gate = deferred<string>();
    const fetcher = vi.fn(() => gate.promise);

    const a = withCache("k:fail", 60_000, fetcher);
    const b = withCache("k:fail", 60_000, fetcher);
    gate.reject(new Error("db down"));

    await expect(a).rejects.toThrow("db down");
    await expect(b).rejects.toThrow("db down");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(memoryCache.get("k:fail")).toBeNull();

    // وبعد الفشل المفتاح متحرر: محاولة جديدة تُنفَّذ فعلًا.
    const ok = await withCache("k:fail", 60_000, async () => "recovered");
    expect(ok).toBe("recovered");
  });

  it("لا يخلط بين مفتاحين مختلفين", async () => {
    const f1 = vi.fn(async () => "one");
    const f2 = vi.fn(async () => "two");

    const [a, b] = await Promise.all([
      withCache("k:1", 60_000, f1),
      withCache("k:2", 60_000, f2),
    ]);

    expect(a).toBe("one");
    expect(b).toBe("two");
  });
});
