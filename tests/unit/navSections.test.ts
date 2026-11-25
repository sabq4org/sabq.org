import { describe, expect, it } from "vitest";
import { navConfig } from "@/nav/nav.config";
import {
  filterNavTree,
  organizeStaffNavigation,
  STAFF_NAV_PRIORITY_IDS,
  STAFF_NAV_SECTION_DEFINITIONS,
} from "@/nav/useNav";
import type { NavItem } from "@/nav/types";

/** عناصر قوائم المساهمين القصيرة (لا تمر على التجميع) */
const COMPACT_ONLY_IDS = new Set([
  "reporter_section",
  "reporter_my_articles",
  "reporter_new_article",
  "reporter_new_opinion",
  "reporter_my_services",
  "reporter_inquiries",
  "opinion_author_new_article",
  "opinion_author_guide",
  "opinion_author_my_services",
  "opinion_author_files",
  "opinion_author_voice",
  "opinion_author_feedback",
  "my_angle",
  "writer_inquiries",
  "publisher_section",
  "publisher_overview",
  "publisher_articles",
  "publisher_new_article",
  "publisher_credits",
  "publisher_guide",
]);

function leaves(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => (item.children?.length ? leaves(item.children) : item.path ? [item] : []));
}

const placedIds = new Set<string>([
  ...STAFF_NAV_PRIORITY_IDS,
  ...STAFF_NAV_SECTION_DEFINITIONS.flatMap((s) => s.subsections.flatMap((sub) => sub.itemIds)),
]);

const ALL_FLAGS = { aiDeepAnalysis: true, smartThemes: true, audioSummaries: true };

function staffTree(role: Parameters<typeof filterNavTree>[1], perms: string[], roles: string[]) {
  return organizeStaffNavigation(filterNavTree(navConfig, role, ALL_FLAGS, perms, roles), role);
}

describe("توزيع القائمة الجانبية حسب المجال", () => {
  it("every staff nav item has a section (no «المزيد»)", () => {
    const unplaced = leaves(navConfig)
      .filter((item) => !COMPACT_ONLY_IDS.has(item.id))
      .filter((item) => !placedIds.has(item.id))
      .map((item) => `${item.id} (${item.labelAr})`);
    expect(unplaced).toEqual([]);
  });

  it("section ids point only at real nav items", () => {
    const known = new Set(leaves(navConfig).map((item) => item.id));
    const unknown = [...placedIds].filter((id) => !known.has(id));
    expect(unknown).toEqual([]);
  });

  it("system admin gets no «المزيد» group and all pages stay reachable", () => {
    const tree = staffTree("admin", ["*"], ["system_admin", "admin"]);
    expect(tree.map((item) => item.id)).not.toContain("workspace_more");
    const before = new Set(leaves(filterNavTree(navConfig, "admin", ALL_FLAGS, ["*"], ["system_admin", "admin"])).map((i) => i.path));
    const after = new Set(leaves(tree).map((i) => i.path));
    expect([...before].filter((p) => !after.has(p))).toEqual([]);
  });

  it("keeps the editor's first editorial items in the same order", () => {
    const tree = staffTree("admin", ["*"], ["admin"]);
    const editorial = tree.find((item) => item.id === "workspace_editorial");
    const ids = editorial?.children?.map((c) => c.id) ?? [];
    const order = ["articles", "breaking_ticker", "gulf_events", "world_days", "media_library"].map((id) => ids.indexOf(id));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("puts opinion writer pages together and meetings at the top", () => {
    const tree = staffTree("admin", ["*"], ["admin"]);
    const opinion = tree.find((item) => item.id === "workspace_opinion");
    expect(opinion?.children?.map((c) => c.id)).toEqual(
      expect.arrayContaining(["opinion_writers", "opinion_writer_files", "opinion_tickets", "muqtarab"]),
    );
    expect(tree.map((item) => item.id)).toContain("meetings");
  });

  it("shows a one-item group as a direct link", () => {
    const tree = staffTree("editor", ["categories.view", "articles.view", "media.view"], ["editor"]);
    expect(tree.map((item) => item.id)).toContain("categories");
    expect(tree.map((item) => item.id)).not.toContain("workspace_site");
  });

  it("labels subsections only when a group has more than one", () => {
    const tree = staffTree("admin", ["*"], ["admin"]);
    const editorial = tree.find((item) => item.id === "workspace_editorial");
    expect(editorial?.children?.find((c) => c.id === "social_publishing")?.sectionLabel).toBe("التوزيع");
    const analytics = tree.find((item) => item.id === "workspace_analytics");
    expect(analytics?.children?.every((c) => !c.sectionLabel)).toBe(true);
  });
});
