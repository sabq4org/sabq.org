import { describe, it, expect } from "vitest";
// The Pages middleware is plain ESM; extra named exports are ignored by the
// Cloudflare runtime, so the helper is importable here without side effects.
// @ts-expect-error — untyped .js module (Cloudflare Pages Function)
import { localeAttrsForPath } from "../../functions/_middleware.js";

describe("localeAttrsForPath (Pages middleware)", () => {
  it("returns English LTR attrs for /en and its subpaths", () => {
    expect(localeAttrsForPath("/en")).toEqual({ lang: "en", dir: "ltr" });
    expect(localeAttrsForPath("/en/article/63fildw")).toEqual({ lang: "en", dir: "ltr" });
    expect(localeAttrsForPath("/en/category/world")).toEqual({ lang: "en", dir: "ltr" });
  });

  it("returns Urdu RTL attrs for /ur and its subpaths", () => {
    expect(localeAttrsForPath("/ur")).toEqual({ lang: "ur", dir: "rtl" });
    expect(localeAttrsForPath("/ur/article/abc")).toEqual({ lang: "ur", dir: "rtl" });
  });

  it("leaves Arabic and unrelated paths untouched (null)", () => {
    expect(localeAttrsForPath("/")).toBeNull();
    expect(localeAttrsForPath("/article/Sy0Y13x")).toBeNull();
    expect(localeAttrsForPath("/category/sports")).toBeNull();
    // boundary: "/english…" must NOT match the /en prefix
    expect(localeAttrsForPath("/english-news")).toBeNull();
    expect(localeAttrsForPath("/urdu-page")).toBeNull();
  });
});
