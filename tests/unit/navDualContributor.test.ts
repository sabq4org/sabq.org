import { describe, expect, it } from "vitest";
import { navConfig } from "@/nav/nav.config";
import { filterNavTree } from "@/nav/useNav";
import type { NavItem } from "@/nav/types";

function ids(items: NavItem[]): string[] {
  return items.flatMap((item) => [item.id, ...ids(item.children ?? [])]);
}

describe("«مقال رأي جديد» لصاحب الدورين في القائمة", () => {
  it("shows the opinion entry beside «خبر جديد» for reporter + opinion_author", () => {
    const visible = ids(filterNavTree(navConfig, "reporter", {}, [], ["opinion_author", "reporter"]));
    expect(visible).toContain("reporter_new_article");
    expect(visible).toContain("reporter_new_opinion");
  });

  it("hides it from a reporter-only account", () => {
    const visible = ids(filterNavTree(navConfig, "reporter", {}, [], ["reporter"]));
    expect(visible).toContain("reporter_new_article");
    expect(visible).not.toContain("reporter_new_opinion");
  });

  it("hides it from an admin who also holds both contributor roles", () => {
    const visible = ids(filterNavTree(navConfig, "admin", {}, ["*"], ["admin", "opinion_author", "reporter"]));
    expect(visible).not.toContain("reporter_new_opinion");
  });
});
