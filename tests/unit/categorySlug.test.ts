import { describe, expect, it } from "vitest";
import { findCategoryBySlugOrEnglishSlug } from "../../server/utils/categorySlug";

const cats = [
  { id: "1", slug: "saudi", englishSlug: "CWtMvGT" },
  { id: "2", slug: "sports", englishSlug: "VrlEcMg" },
  { id: "3", slug: "VrlEcMg-old", englishSlug: null },
];

describe("findCategoryBySlugOrEnglishSlug", () => {
  it("resolves the public englishSlug link used by the header and canonical", () => {
    expect(findCategoryBySlugOrEnglishSlug(cats, "VrlEcMg")?.id).toBe("2");
  });
  it("keeps the readable slug working", () => {
    expect(findCategoryBySlugOrEnglishSlug(cats, "saudi")?.id).toBe("1");
  });
  it("returns undefined for unknown values and ignores empty englishSlug", () => {
    expect(findCategoryBySlugOrEnglishSlug(cats, "nope")).toBeUndefined();
    expect(findCategoryBySlugOrEnglishSlug(cats, "")).toBeUndefined();
  });
});
