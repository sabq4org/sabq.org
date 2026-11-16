import { describe, expect, it } from "vitest";
import { insertEnArticleSchema } from "@shared/schema";
import { coerceEnArticleDates } from "@shared/enArticleDates";
import { isPublicEnCategoryStatus } from "@shared/enCategoryStatus";

describe("English article PATCH dates", () => {
  const body = { scheduledAt: "2026-11-17T09:00:00.000Z", status: "scheduled", publishType: "scheduled" };

  it("raw ISO strings are what the schema rejected (the bug)", () => {
    expect(insertEnArticleSchema.partial().safeParse(body).success).toBe(false);
  });

  it("is accepted once dates are coerced before validation", () => {
    const parsed = insertEnArticleSchema.partial().safeParse(coerceEnArticleDates(body));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.scheduledAt).toEqual(new Date(body.scheduledAt));
  });

  it("leaves null and missing dates alone", () => {
    expect(coerceEnArticleDates({ scheduledAt: null, title: "x" })).toEqual({ scheduledAt: null, title: "x" });
  });
});

describe("English category visibility", () => {
  it("treats the en_categories default 'active' as public", () => {
    expect(isPublicEnCategoryStatus("active")).toBe(true);
    expect(isPublicEnCategoryStatus("visible")).toBe(true);
    expect(isPublicEnCategoryStatus("hidden")).toBe(false);
    expect(isPublicEnCategoryStatus(undefined)).toBe(false);
  });
});
