import { ThinkingLevel } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GEMINI_FLASH_FALLBACK_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  minimalThinkingConfig,
  withGeminiFlashFallback,
} from "../../server/ai/geminiModels";
import { DEFAULT_FEATURES, DEFAULT_MODELS } from "../../server/ai/gateway/defaults";

describe("geminiModels", () => {
  it("defaults off the deprecated gemini-2.5-flash", () => {
    expect(DEFAULT_GEMINI_FLASH_MODEL).toBe("gemini-3.8-flash");
    expect(DEFAULT_GEMINI_FLASH_FALLBACK_MODEL).not.toBe("gemini-2.5-flash");
  });

  it("maps thinking config per model generation", () => {
    expect(minimalThinkingConfig("gemini-2.5-flash-lite")).toEqual({ thinkingBudget: 0 });
    expect(minimalThinkingConfig("gemini-3.8-flash")).toEqual({ thinkingLevel: ThinkingLevel.LOW });
  });

  it("returns primary result without touching fallback", async () => {
    const call = vi.fn(async (m: string) => `ok:${m}`);
    const out = await withGeminiFlashFallback("t", call, { primary: "a", fallback: "b" });
    expect(out).toEqual({ result: "ok:a", model: "a" });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("retries exactly once on the fallback model", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const call = vi.fn(async (m: string) => {
      if (m === "a") throw new Error("404 model not found");
      return `ok:${m}`;
    });
    const out = await withGeminiFlashFallback("t", call, { primary: "a", fallback: "b" });
    expect(out).toEqual({ result: "ok:b", model: "b" });
    expect(call.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
  });

  it("propagates the fallback error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const call = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(withGeminiFlashFallback("t", call, { primary: "a", fallback: "b" })).rejects.toThrow("boom");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("gateway chains no longer reference gemini-2.5-flash and the new model is in the catalog", () => {
    for (const f of DEFAULT_FEATURES) {
      const refs = [f.primary, ...f.fallbackChain];
      expect(refs.some((r) => r.modelId === "gemini-2.5-flash")).toBe(false);
    }
    expect(DEFAULT_MODELS.some((m) => m.modelId === DEFAULT_GEMINI_FLASH_MODEL)).toBe(true);
  });
});
