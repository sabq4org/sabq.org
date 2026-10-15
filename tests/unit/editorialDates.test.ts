import { describe, expect, it } from "vitest";
import {
  getEditorialModifiedAt,
  getPublicEditorialModifiedAt,
  hasMeaningfulEditorialChange,
  markEditorialModification,
} from "../../server/utils/editorialDates";

describe("editorial dates", () => {
  it("ignores persistence and workflow-only writes", () => {
    expect(hasMeaningfulEditorialChange({ status: "published", displayOrder: 42 })).toBe(false);
    expect(markEditorialModification({ status: "approved" }, { status: "published" })).toBeUndefined();
  });

  it("does not stamp a full save when editorial values are unchanged", () => {
    const existing = { title: "عنوان", content: "المتن", seo: { metaTitle: "عنوان" } };
    expect(hasMeaningfulEditorialChange(existing, existing)).toBe(false);
  });

  it("records a meaningful correction while preserving metadata", () => {
    const at = new Date("2026-09-08T01:00:00.000Z");
    const result = markEditorialModification(
      { status: "approved", version: 2 },
      { content: "تصحيح جوهري" },
      at,
    );
    expect(result).toEqual({
      status: "approved",
      version: 2,
      editorialModifiedAt: at.toISOString(),
    });
    expect(getEditorialModifiedAt(result)).toBe(at.toISOString());
  });

  it("rejects malformed stored dates", () => {
    expect(getEditorialModifiedAt({ editorialModifiedAt: "yesterday" })).toBeNull();
    expect(getEditorialModifiedAt(null)).toBeNull();
  });

  it("does not expose a stale or pre-publication correction date", () => {
    expect(getPublicEditorialModifiedAt("2026-09-08T02:00:00.000Z", {
      editorialModifiedAt: "2026-09-08T01:00:00.000Z",
    })).toBeNull();
    expect(getPublicEditorialModifiedAt("2026-09-08T00:00:00.000Z", {
      editorialModifiedAt: "2026-09-08T01:00:00.000Z",
    })).toBe("2026-09-08T01:00:00.000Z");
  });
});
