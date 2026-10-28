import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ARTICLE_TEXT_SCALE_PREF,
  articleTextScaleLabel,
  normalizeArticleTextScale,
  readArticleTextScale,
  writeArticleTextScale,
} from "../../client/src/lib/articleTextScale";

function stubStorage(initial: Record<string, string> = {}, blocked = false) {
  const data = { ...initial };
  const storage = {
    getItem: (k: string) => {
      if (blocked) throw new Error("blocked");
      return k in data ? data[k] : null;
    },
    setItem: (k: string, v: string) => {
      if (blocked) throw new Error("blocked");
      data[k] = v;
    },
  };
  vi.stubGlobal("window", { localStorage: storage });
  return data;
}

afterEach(() => vi.unstubAllGlobals());

describe("article text scale", () => {
  it("accepts only the slider steps and falls back to normal size", () => {
    expect(normalizeArticleTextScale("1.2")).toBe(1.2);
    expect(normalizeArticleTextScale(0.9)).toBe(0.9);
    expect(normalizeArticleTextScale("3")).toBe(1);
    expect(normalizeArticleTextScale(null)).toBe(1);
    expect(articleTextScaleLabel(1)).toBe("عادي");
  });

  it("remembers the reader's choice on the device", () => {
    const data = stubStorage();
    writeArticleTextScale(1.3);
    expect(data[ARTICLE_TEXT_SCALE_PREF]).toBe("1.3");
    expect(readArticleTextScale()).toBe(1.3);
  });

  it("keeps working when storage is blocked", () => {
    stubStorage({}, true);
    expect(() => writeArticleTextScale(1.1)).not.toThrow();
    expect(readArticleTextScale()).toBe(1);
  });
});
