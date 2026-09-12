import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearConversionQueue, enqueueConversion, flushConversionQueue } from "../../client/src/lib/analytics-conversion-queue";
import { ensureAnalyticsReady, isAnalyticsAllowed } from "../../client/src/lib/analytics-privacy";

vi.mock("../../client/src/lib/analytics-privacy", () => ({ ensureAnalyticsReady: vi.fn(), isAnalyticsAllowed: vi.fn() }));
const key = "sabq:analytics-conversions";
const nonce = "01234567-89ab-cdef-0123-456789abcdef";
const store = new Map<string, string>();
const storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
};
beforeEach(() => {
  vi.stubGlobal("sessionStorage", storage);
  clearConversionQueue();
  vi.mocked(isAnalyticsAllowed).mockReturnValue(true);
  vi.mocked(ensureAnalyticsReady).mockReturnValue(true);
});
afterEach(() => { clearConversionQueue(); store.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("analytics conversion queue", () => {
  it("deduplicates OAuth callbacks and delivers only once", () => {
    enqueueConversion("login", "google", nonce);
    enqueueConversion("login", "google", nonce);
    const send = vi.fn();
    expect(flushConversionQueue(send)).toBe(true);
    expect(send).toHaveBeenCalledExactlyOnceWith("login", "google");
    flushConversionQueue(send);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("retains conversions until a public route and ready analytics", () => {
    enqueueConversion("sign_up", "email", nonce);
    const send = vi.fn();
    vi.mocked(isAnalyticsAllowed).mockReturnValue(false);
    expect(flushConversionQueue(send)).toBe(false);
    vi.mocked(isAnalyticsAllowed).mockReturnValue(true);
    vi.mocked(ensureAnalyticsReady).mockReturnValue(false);
    expect(flushConversionQueue(send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
    vi.mocked(ensureAnalyticsReady).mockReturnValue(true);
    flushConversionQueue(send);
    expect(send).toHaveBeenCalledExactlyOnceWith("sign_up", "email");
  });

  it("expires old conversions and rejects malformed or future storage", () => {
    const valid = { event: "login", method: "apple", nonce, createdAt: Date.now() };
    store.set(key, JSON.stringify([
      { ...valid, createdAt: Date.now() - 300_001 },
      { ...valid, createdAt: Date.now() + 120_000 },
      { ...valid, method: "untrusted" },
      { ...valid, event: "purchase" }, null,
    ]));
    const send = vi.fn();
    flushConversionQueue(send);
    expect(send).not.toHaveBeenCalled();
    expect(store.get(key)).toBe("[]");
  });

  it("does not resend stale storage after a failed clear write", () => {
    enqueueConversion("login", "google", nonce);
    vi.stubGlobal("sessionStorage", { getItem: storage.getItem, setItem() { throw new Error("quota"); } });
    const send = vi.fn();
    flushConversionQueue(send);
    flushConversionQueue(send);
    expect(send).toHaveBeenCalledExactlyOnceWith("login", "google");
  });

  it("works in memory when browser storage is blocked and clears on logout", () => {
    vi.stubGlobal("sessionStorage", { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } });
    enqueueConversion("login", "phone", nonce);
    const send = vi.fn();
    flushConversionQueue(send);
    expect(send).toHaveBeenCalledExactlyOnceWith("login", "phone");
    enqueueConversion("sign_up", "phone", nonce);
    clearConversionQueue();
    flushConversionQueue(send);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
