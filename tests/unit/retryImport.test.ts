import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The lazy-chunk recovery pipeline (client/src/lib/retryImport.ts +
// deployRecovery.ts) runs in the browser; stub the handful of globals it
// touches so the node test environment can exercise the full failure paths.

const RELOAD_FLAG = "sabq:deploy-reload-at";

function stubBrowserGlobals() {
  const store = new Map<string, string>();
  const listeners = new Map<string, (event: unknown) => void>();
  const location = {
    href: "https://sabq.org/",
    replace: vi.fn(),
    reload: vi.fn(),
  };
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  vi.stubGlobal("window", {
    location,
    addEventListener: (name: string, fn: (event: unknown) => void) => {
      listeners.set(name, fn);
    },
    history: { state: null, replaceState: vi.fn() },
  });
  return { store, listeners, location };
}

let globals: ReturnType<typeof stubBrowserGlobals>;

beforeEach(() => {
  vi.resetModules();
  globals = stubBrowserGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isChunkErrorMessage", () => {
  it("matches the WebKit bracket-form poison (no dot in the message)", async () => {
    const { isChunkErrorMessage } = await import("@/lib/retryImport");
    // Minified lazyNamed evaluating a swallowed (undefined) module namespace —
    // the message that previously slipped through because it contains no ".".
    expect(
      isChunkErrorMessage("undefined is not an object (evaluating '(await t())[n]')"),
    ).toBe(true);
  });

  it("still matches the dot-form named-export poison", async () => {
    const { isChunkErrorMessage } = await import("@/lib/retryImport");
    expect(
      isChunkErrorMessage("undefined is not an object (evaluating 'f._result.default')"),
    ).toBe(true);
  });

  it("matches classic dynamic-import failures and the Arabic fallback", async () => {
    const { isChunkErrorMessage } = await import("@/lib/retryImport");
    expect(isChunkErrorMessage("Failed to fetch dynamically imported module")).toBe(true);
    expect(isChunkErrorMessage("Importing a module script failed.")).toBe(true);
    expect(isChunkErrorMessage("تعذر تحميل الصفحة. يرجى مسح ذاكرة المتصفح")).toBe(true);
  });

  it("does not match unrelated errors", async () => {
    const { isChunkErrorMessage } = await import("@/lib/retryImport");
    expect(isChunkErrorMessage("Network request failed")).toBe(false);
    expect(isChunkErrorMessage(undefined)).toBe(false);
  });
});

describe("retryImport", () => {
  it("resolves a healthy module untouched", async () => {
    const { retryImport } = await import("@/lib/retryImport");
    const mod = { default: () => null };
    await expect(retryImport(async () => mod, 1, 1)).resolves.toBe(mod);
  });

  it("normalizes an undefined module namespace (swallowed vite:preloadError) into a retryable chunk error", async () => {
    const { retryImport } = await import("@/lib/retryImport");
    const mod = { default: () => null };
    let calls = 0;
    const importFn = async () => {
      calls += 1;
      // First attempt: Vite preload resolved `undefined` because some listener
      // called preventDefault() on vite:preloadError. Second attempt succeeds.
      return calls === 1 ? (undefined as unknown as typeof mod) : mod;
    };
    await expect(retryImport(importFn, 2, 1)).resolves.toBe(mod);
    expect(calls).toBe(2);
  });

  it("retries the bracket-form WebKit TypeError instead of failing fast", async () => {
    const { retryImport } = await import("@/lib/retryImport");
    const mod = { default: () => null };
    let calls = 0;
    const importFn = async () => {
      calls += 1;
      if (calls === 1) {
        throw new TypeError("undefined is not an object (evaluating '(await t())[n]')");
      }
      return mod;
    };
    await expect(retryImport(importFn, 2, 1)).resolves.toBe(mod);
    expect(calls).toBe(2);
  });

  it("rejects with the Arabic chunk message when retries are spent and the reload cooldown is active", async () => {
    // A recovery reload already happened moments ago → cooldown blocks another.
    globals.store.set(RELOAD_FLAG, String(Date.now()));
    const { retryImport } = await import("@/lib/retryImport");
    const importFn = async () => {
      throw new Error("Failed to fetch dynamically imported module");
    };
    await expect(retryImport(importFn, 1, 1)).rejects.toThrow("تعذر تحميل الصفحة");
    expect(globals.location.replace).not.toHaveBeenCalled();
  });

  it("rejects non-chunk errors immediately without retrying", async () => {
    const { retryImport } = await import("@/lib/retryImport");
    let calls = 0;
    const importFn = async () => {
      calls += 1;
      throw new Error("totally unrelated application bug");
    };
    await expect(retryImport(importFn, 2, 1)).rejects.toThrow("unrelated");
    expect(calls).toBe(1);
  });
});

describe("deployRecovery vite:preloadError listener", () => {
  it("prevents default (swallows the error) only when it actually reloads", async () => {
    const { installDeployRecovery } = await import("@/lib/deployRecovery");
    installDeployRecovery();
    const listener = globals.listeners.get("vite:preloadError")!;
    expect(listener).toBeDefined();

    // Fresh cooldown → reload fires → error swallowed so the reload races no one.
    const firstEvent = { preventDefault: vi.fn() };
    listener(firstEvent);
    expect(globals.location.replace).toHaveBeenCalledTimes(1);
    expect(firstEvent.preventDefault).toHaveBeenCalledTimes(1);

    // Within the cooldown → no reload → the error MUST propagate (no
    // preventDefault), otherwise Vite resolves the failed import with
    // `undefined` and poisons every lazy chunk for the next 30s.
    const secondEvent = { preventDefault: vi.fn() };
    listener(secondEvent);
    expect(globals.location.replace).toHaveBeenCalledTimes(1);
    expect(secondEvent.preventDefault).not.toHaveBeenCalled();
  });
});
