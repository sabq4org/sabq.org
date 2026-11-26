import { describe, expect, it } from "vitest";
import { canFeatureArticles, dropUnauthorizedFeature } from "@shared/articleFeatureGuard";
import { denyPermissionsForRoles } from "@shared/rbac-constants";

describe("articleFeatureGuard", () => {
  it("drops isFeatured for a reporter, keeping the other fields", () => {
    const body = { title: "خبر", isFeatured: true, isReading: true };
    expect(dropUnauthorizedFeature(body, ["articles.create", "articles.edit_own"])).toEqual({ title: "خبر", isReading: true });
  });

  it("drops isFeatured even when the DB grants articles.feature to a reporter (deny map wins)", () => {
    const perms = denyPermissionsForRoles(["reporter"], ["articles.create", "articles.feature", "articles.news_type"]);
    expect(canFeatureArticles(perms)).toBe(false);
    expect(dropUnauthorizedFeature({ isFeatured: true }, perms)).toEqual({});
  });

  it("keeps isFeatured (true or false) for editors and superusers", () => {
    expect(dropUnauthorizedFeature({ isFeatured: true }, ["articles.feature"])).toEqual({ isFeatured: true });
    expect(dropUnauthorizedFeature({ isFeatured: false }, ["*"])).toEqual({ isFeatured: false });
  });

  it("leaves bodies without isFeatured untouched and fails closed on missing permissions", () => {
    const body = { title: "x" };
    expect(dropUnauthorizedFeature(body, [])).toBe(body);
    expect(canFeatureArticles(undefined)).toBe(false);
    expect(dropUnauthorizedFeature({ isFeatured: true }, null)).toEqual({});
  });
});
