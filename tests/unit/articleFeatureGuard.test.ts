import { describe, expect, it } from "vitest";
import { canFeatureArticles, resolveFeatureField } from "@shared/articleFeatureGuard";
import { denyPermissionsForRoles } from "@shared/rbac-constants";

const reporterPerms = ["articles.create", "articles.edit_own"];

describe("articleFeatureGuard", () => {
  it("rejects a reporter trying to feature a new article with 403 FEATURE_FORBIDDEN", () => {
    const r = resolveFeatureField({ title: "خبر", isFeatured: true }, reporterPerms, false);
    expect(r).toMatchObject({ ok: false, httpStatus: 403, code: "FEATURE_FORBIDDEN" });
  });

  it("rejects a reporter trying to un-feature an article an editor featured", () => {
    expect(resolveFeatureField({ isFeatured: false }, reporterPerms, true).ok).toBe(false);
  });

  it("lets a reporter's ordinary save through when the value is unchanged, dropping the field", () => {
    expect(resolveFeatureField({ title: "خبر", isFeatured: false }, reporterPerms, false)).toEqual({ ok: true, body: { title: "خبر" } });
    expect(resolveFeatureField({ title: "خبر", isFeatured: true }, reporterPerms, true)).toEqual({ ok: true, body: { title: "خبر" } });
  });

  it("denies even when the DB grants articles.feature to a reporter (deny map wins)", () => {
    const perms = denyPermissionsForRoles(["reporter"], ["articles.create", "articles.feature", "articles.news_type"]);
    expect(canFeatureArticles(perms)).toBe(false);
    expect(resolveFeatureField({ isFeatured: true }, perms, false).ok).toBe(false);
  });

  it("keeps isFeatured for editors and superusers", () => {
    expect(resolveFeatureField({ isFeatured: true }, ["articles.feature"], false)).toEqual({ ok: true, body: { isFeatured: true } });
    expect(resolveFeatureField({ isFeatured: false }, ["*"], true)).toEqual({ ok: true, body: { isFeatured: false } });
  });

  it("leaves bodies without isFeatured untouched and fails closed on missing permissions", () => {
    const body = { title: "x" };
    expect(resolveFeatureField(body, [], false)).toEqual({ ok: true, body });
    expect(canFeatureArticles(undefined)).toBe(false);
    expect(resolveFeatureField({ isFeatured: true }, null, false).ok).toBe(false);
  });
});
