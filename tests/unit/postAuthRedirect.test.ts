import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMajlisJoinIntent,
  consumePostAuthReturn,
  hasMajlisJoinIntent,
  normalizeMajlisInviteCode,
  peekPostAuthReturn,
  rememberMajlisJoinIntent,
  rememberPostAuthReturn,
  rememberPostAuthReturnIfAbsent,
  sanitizePostAuthReturn,
} from "../../client/src/lib/postAuthRedirect";

const ORIGIN = "https://sabq.org";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

beforeEach(() => {
  vi.stubGlobal("window", {
    location: { origin: ORIGIN },
    sessionStorage: memoryStorage(),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("sanitizePostAuthReturn", () => {
  it("keeps a same-origin path with query and hash", () => {
    expect(sanitizePostAuthReturn("/gulf-cup/majlis?code=ABC234#today", ORIGIN)).toBe(
      "/gulf-cup/majlis?code=ABC234#today",
    );
  });

  it("accepts a same-origin absolute URL", () => {
    expect(sanitizePostAuthReturn("https://sabq.org/gulf-cup/majlis/1", ORIGIN)).toBe("/gulf-cup/majlis/1");
  });

  it.each([
    "https://evil.example/gulf-cup/majlis",
    "//evil.example/path",
    "/\\evil.example/path",
    "/login",
    "/register?next=/gulf-cup/majlis",
  ])("rejects unsafe return target %s", (value) => {
    expect(sanitizePostAuthReturn(value, ORIGIN)).toBeNull();
  });
});

describe("normalizeMajlisInviteCode", () => {
  it("normalizes a valid code", () => expect(normalizeMajlisInviteCode(" ab23cd ")).toBe("AB23CD"));
  it.each(["", "ABC", "ABCDEFGHI", "AB-234"])("rejects %s", (value) => {
    expect(normalizeMajlisInviteCode(value)).toBeNull();
  });
});

describe("post-auth state", () => {
  it("stores and consumes a safe same-origin destination once", () => {
    expect(rememberPostAuthReturn("/gulf-cup/majlis?code=AB23CD")).toBe("/gulf-cup/majlis?code=AB23CD");
    expect(peekPostAuthReturn()).toBe("/gulf-cup/majlis?code=AB23CD");
    expect(consumePostAuthReturn("/fallback")).toBe("/gulf-cup/majlis?code=AB23CD");
    expect(consumePostAuthReturn("/fallback")).toBe("/fallback");
  });

  it("preserves an existing invite destination through an OAuth completion guard", () => {
    rememberPostAuthReturn("/gulf-cup/majlis?code=AB23CD");
    expect(rememberPostAuthReturnIfAbsent("/dashboard")).toBe(
      "/gulf-cup/majlis?code=AB23CD",
    );
    expect(consumePostAuthReturn()).toBe("/gulf-cup/majlis?code=AB23CD");
  });

  it("does not infer join consent from a code alone", () => {
    expect(hasMajlisJoinIntent("AB23CD")).toBe(false);
    expect(rememberMajlisJoinIntent("ab23cd")).toBe("AB23CD");
    expect(hasMajlisJoinIntent("AB23CD")).toBe(true);
    expect(hasMajlisJoinIntent("ZZ99ZZ")).toBe(false);
    clearMajlisJoinIntent();
    expect(hasMajlisJoinIntent("AB23CD")).toBe(false);
  });
});
