import { describe, it, expect } from "vitest";
import { isNoindexPath } from "../../server/utils/noindexPaths";

// isNoindexPath is the single source of truth behind two enforcement layers:
// the smart-cache middleware and the dev guard in server/index.ts that THROWS
// if a noindex route ever ships a public Cache-Control. A false negative here
// means a private dashboard page cached on the CDN (the poisoning class of
// bug this repo has already been burned by).
describe("isNoindexPath — exact matches", () => {
  it.each(["/search", "/en/search", "/ur/search", "/login", "/profile", "/bookmarks"])(
    "%s is noindex",
    (p) => expect(isNoindexPath(p)).toBe(true),
  );

  it("normalizes the trailing-slash variant of exact routes", () => {
    expect(isNoindexPath("/search/")).toBe(true);
    expect(isNoindexPath("/profile/")).toBe(true);
  });

  it("root and empty string are not noindex", () => {
    expect(isNoindexPath("/")).toBe(false);
    expect(isNoindexPath("")).toBe(false);
  });
});

describe("isNoindexPath — prefixes", () => {
  it.each([
    "/dashboard",
    "/dashboard/",
    "/dashboard/articles/edit/123",
    "/admin/users",
    "/en/dashboard/x",
    "/ur/dashboard",
    "/payment/success",
    "/ifox/anything",
    "/gulf-cup/majlis",
    "/gulf-cup/majlis/123",
    "/settings",
    "/settings/",
    "/settings/security",
    "/settings/notifications",
    "/en/settings/account",
  ])("%s is noindex", (p) => expect(isNoindexPath(p)).toBe(true));

  it("does NOT match prefix lookalikes (boundary check)", () => {
    expect(isNoindexPath("/dashboardx")).toBe(false);
    expect(isNoindexPath("/administrator-news")).toBe(false);
    expect(isNoindexPath("/payments-explained")).toBe(false);
    expect(isNoindexPath("/settingsx")).toBe(false);
  });
});

describe("isNoindexPath — account-center redirects stay private", () => {
  it.each([
    "/notification-settings",
    "/recommendation-settings",
    "/preferences",
    "/loyalty",
  ])("%s is noindex", (p) => expect(isNoindexPath(p)).toBe(true));
});

describe("isNoindexPath — public surfaces stay public", () => {
  it.each([
    "/article/some-slug",
    "/en/article/some-slug",
    "/category/sports",
    "/omq/123",
    "/world-days",
  ])("%s is indexable", (p) => expect(isNoindexPath(p)).toBe(false));

  it("matching is case-sensitive (documents current behavior)", () => {
    // URLs are matched as-is; uppercase variants fall through to public
    // defaults. If this ever becomes a real crawler problem, normalize case
    // in the caller — this test just pins today's contract.
    expect(isNoindexPath("/SEARCH")).toBe(false);
  });
});
