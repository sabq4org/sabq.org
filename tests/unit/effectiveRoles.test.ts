import { describe, expect, it } from "vitest";
import {
  hasSupervisoryStaffRole,
  isContributorRoleOnly,
  isReaderLikeRole,
  isRoleExcluded,
  isStaffRole,
  mergeRoleSignals,
  normalizeRoleKey,
  pickPrimaryRoleRecord,
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
  it("returns the highest-priority role regardless of DB row order", () => {
    expect(primaryRoleKey(["reporter", "editor"])).toBe("editor");
    expect(primaryRoleKey(["editor", "reporter"])).toBe("editor");
    expect(primaryRoleKey(["reporter", "admin"])).toBe("admin");
    expect(primaryRoleKey(["opinion_author", "content_manager"])).toBe("content_manager");
    expect(primaryRoleKey(["reporter"])).toBe("reporter");
    expect(primaryRoleKey([])).toBe("reader");
  });

  it("preserves unknown custom RBAC roles when no known staff role is higher", () => {
    expect(primaryRoleKey(["reader", "custom_desk"])).toBe("custom_desk");
    expect(primaryRoleKey(["custom_desk", "editor"])).toBe("editor");
  });
});

describe("pickPrimaryRoleRecord", () => {
  it("selects the highest-priority role record for badge display", () => {
    const reporterRec = { id: "r1", name: "reporter", nameAr: "مراسل" };
    const editorRec = { id: "r2", name: "editor", nameAr: "محرر" };
    expect(pickPrimaryRoleRecord([reporterRec, editorRec])).toBe(editorRec);
    expect(pickPrimaryRoleRecord([editorRec, reporterRec])).toBe(editorRec);
    expect(pickPrimaryRoleRecord([reporterRec])).toBe(reporterRec);
  });
});

describe("isContributorRoleOnly & hasSupervisoryStaffRole", () => {
  it("identifies reporter-only users as contributor-only", () => {
    expect(isContributorRoleOnly({ role: "reporter", roles: ["reporter"] }, "reporter")).toBe(true);
    expect(isContributorRoleOnly(["reporter"], "reporter")).toBe(true);
    expect(hasSupervisoryStaffRole({ role: "reporter", roles: ["reporter"] })).toBe(false);
  });

  it("does NOT treat an editor with a secondary reporter role as reporter-only", () => {
    expect(
      isContributorRoleOnly({ role: "editor", roles: ["editor", "reporter"] }, "reporter"),
    ).toBe(false);
    expect(
      isContributorRoleOnly(
        { role: "editor", roles: [{ name: "reporter" }, { name: "editor" }] },
        "reporter",
      ),
    ).toBe(false);
    expect(hasSupervisoryStaffRole({ role: "editor", roles: ["reporter", "editor"] })).toBe(true);
  });

  it("does NOT treat an admin with opinion_author as opinion_author-only", () => {
    expect(
      isContributorRoleOnly({ role: "admin", roles: ["admin", "opinion_author"] }, "opinion_author"),
    ).toBe(false);
    expect(
      isContributorRoleOnly({ role: "opinion_author", roles: ["opinion_author"] }, "opinion_author"),
    ).toBe(true);
  });
});

describe("isRoleExcluded (nav & ProtectedRoute excludeRoles helper)", () => {
  it("excludes a reporter-only user when excludeRoles contains reporter", () => {
    expect(isRoleExcluded(["reporter"], ["opinion_author", "reporter"])).toBe(true);
    expect(
      isRoleExcluded({ role: "reporter", roles: ["reporter"] }, ["reporter"]),
    ).toBe(true);
  });

  it("does NOT exclude an editor+reporter user from sections that exclude reporter", () => {
    expect(
      isRoleExcluded(["editor", "reporter"], ["opinion_author", "angle_writer", "publisher", "reporter"]),
    ).toBe(false);
    expect(
      isRoleExcluded({ role: "editor", roles: ["reporter", "editor"] }, ["reporter"]),
    ).toBe(false);
  });

  it("still honors explicit exclusions of supervisory roles (e.g. my_angle excludes editor/admin)", () => {
    expect(
      isRoleExcluded(["editor", "angle_writer"], ["admin", "system_admin", "editor"]),
    ).toBe(true);
    expect(
      isRoleExcluded(["content_manager", "reporter"], ["content_manager"]),
    ).toBe(true);
  });
});
