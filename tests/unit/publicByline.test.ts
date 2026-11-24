import { describe, expect, it } from "vitest";
import {
  normalizePublicBio,
  pickPublicStaffType,
  reporterProfileCachePatterns,
} from "../../shared/publicByline";

describe("pickPublicStaffType", () => {
  it("prefers opinion author over reporter", () => {
    expect(pickPublicStaffType(["reporter", "opinion_author"])).toBe("opinion_author");
    expect(pickPublicStaffType(["reporter"])).toBe("reporter");
  });
  it("returns null for editors and admins (no public page is created)", () => {
    expect(pickPublicStaffType(["editor", "admin"])).toBeNull();
    expect(pickPublicStaffType([])).toBeNull();
  });
});

describe("normalizePublicBio", () => {
  it("trims and treats blank as empty", () => {
    expect(normalizePublicBio("  كاتب ومحلل  ")).toBe("كاتب ومحلل");
    expect(normalizePublicBio("   \n ")).toBeNull();
    expect(normalizePublicBio(null)).toBeNull();
    expect(normalizePublicBio(42)).toBeNull();
  });
  it("normalizes Windows line breaks", () => {
    expect(normalizePublicBio("سطر\r\nسطر")).toBe("سطر\nسطر");
  });
});

describe("reporterProfileCachePatterns", () => {
  const key = (lang: string, token: string) => `reporter:profile:v3:${lang}:${token}:90`;

  it("matches every language and window for the slug and the user id only", () => {
    const regexes = reporterProfileCachePatterns(["ali-hazmi", "user-1", null]).map((p) => new RegExp(p));
    const hit = (k: string) => regexes.some((r) => r.test(k));
    expect(hit(key("ar", "ali-hazmi"))).toBe(true);
    expect(hit(key("en", "ali-hazmi"))).toBe(true);
    expect(hit(key("ar", "user-1"))).toBe(true);
    expect(hit(key("ar", "ali-hazmi-2"))).toBe(false);
    expect(hit(key("ar", "other"))).toBe(false);
  });

  it("escapes regex characters in tokens and drops duplicates", () => {
    const patterns = reporterProfileCachePatterns(["a.b", "a.b"]);
    expect(patterns).toHaveLength(1);
    expect(new RegExp(patterns[0]).test(key("ar", "axb"))).toBe(false);
    expect(new RegExp(patterns[0]).test(key("ar", "a.b"))).toBe(true);
  });
});
