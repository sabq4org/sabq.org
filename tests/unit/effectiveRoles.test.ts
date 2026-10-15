import { describe, expect, it } from "vitest";
import {
  isReaderLikeRole,
  isStaffRole,
  mergeRoleSignals,
  normalizeRoleKey,
  primaryRoleKey,
} from "@shared/effectiveRoles";

describe("normalizeRoleKey", () => {
  it("lowercases and collapses spaces/hyphens", () => {
    expect(normalizeRoleKey(" Opinion Author ")).toBe("opinion_author");
    expect(normalizeRoleKey("system-admin")).toBe("system_admin");
  });

  it("returns empty string for nullish values", () => {
    expect(normalizeRoleKey(null)).toBe("");
    expect(normalizeRoleKey(undefined)).toBe("");
  });
});

describe("isReaderLikeRole / isStaffRole", () => {
  it("treats empty and reader aliases as reader-like", () => {
    expect(isReaderLikeRole(null)).toBe(true);
    expect(isReaderLikeRole("reader")).toBe(true);
    expect(isReaderLikeRole("subscriber")).toBe(true);
  });

  it("recognizes correspondent aliases as staff", () => {
    expect(isStaffRole("reporter")).toBe(true);
    expect(isStaffRole("correspondent")).toBe(true);
    expect(isStaffRole("opinion_author")).toBe(true);
    expect(isStaffRole("reader")).toBe(false);
  });
});

describe("mergeRoleSignals", () => {
  it("prefers a staff RBAC role over a leftover reader assignment", () => {
    expect(mergeRoleSignals(["reader", "reporter"], "reader")).toEqual(["reporter"]);
  });

  it("surfaces users.role when RBAC only has reader", () => {
    expect(mergeRoleSignals(["reader"], "reporter")).toEqual(["reporter"]);
  });

  it("keeps a lone reader role", () => {
    expect(mergeRoleSignals(["reader"], "reader")).toEqual(["reader"]);
    expect(mergeRoleSignals([], null)).toEqual(["reader"]);
  });

  it("deduplicates and ignores blanks", () => {
    expect(mergeRoleSignals(["reporter", "reporter", ""], "reporter")).toEqual(["reporter"]);
  });

  it("keeps multiple staff roles in first-seen order", () => {
    expect(mergeRoleSignals(["editor", "reporter"], "reader")).toEqual(["editor", "reporter"]);
  });
});

describe("primaryRoleKey", () => {
  it("returns the first merged role or reader", () => {
    expect(primaryRoleKey(["reporter", "editor"])).toBe("reporter");
    expect(primaryRoleKey([])).toBe("reader");
  });
});
