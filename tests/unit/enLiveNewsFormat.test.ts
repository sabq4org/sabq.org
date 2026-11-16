import { describe, expect, it } from "vitest";
import {
  buildEnLivePage,
  enLiveSummary,
  parseEnLiveCategory,
  parseEnLiveCursor,
  toEnLiveItem,
  type EnLiveRow,
} from "../../server/services/enLiveNewsFormat";

function row(over: Partial<EnLiveRow> = {}): EnLiveRow {
  return {
    id: "a1",
    title: "Title",
    slug: "slug-1",
    englishSlug: null,
    imageUrl: null,
    imageFocalPoint: null,
    publishedAt: new Date("2026-11-16T10:00:00.000Z"),
    updatedAt: new Date("2026-11-16T10:05:00.000Z"),
    newsType: "regular",
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    viewsCount: null,
    excerpt: null,
    content: "<p>Body text</p>",
    ...over,
  };
}

describe("toEnLiveItem", () => {
  it("maps to the shape EnglishMomentByMoment reads", () => {
    const item = toEnLiveItem(
      row({ englishSlug: "nice-slug", categoryId: "c1", categoryName: "Saudi", categoryColor: "#123", viewsCount: 7, newsType: "breaking" }),
      3,
    );
    expect(item).toMatchObject({
      id: "a1",
      slug: "slug-1",
      englishSlug: "nice-slug",
      isBreaking: true,
      categoryId: "c1",
      categoryName: "Saudi",
      categoryColor: "#123",
      viewsCount: 7,
      commentsCount: 3,
      publishedAt: "2026-11-16T10:00:00.000Z",
      summary: "Body text",
    });
  });

  it("falls back for missing category, views and dates", () => {
    const item = toEnLiveItem(row({ publishedAt: null, updatedAt: null }), 0);
    expect(item.categoryName).toBe("Uncategorized");
    expect(item.categoryId).toBe("");
    expect(item.viewsCount).toBe(0);
    expect(item.publishedAt).toBe("");
    expect(item.isBreaking).toBe(false);
  });
});

describe("enLiveSummary", () => {
  it("prefers the excerpt and strips tags", () => {
    expect(enLiveSummary("<b>Short</b> excerpt", "<p>content</p>")).toBe("Short excerpt");
  });

  it("truncates long content at 150 chars", () => {
    expect(enLiveSummary(null, `<p>${"x".repeat(400)}</p>`)).toBe(`${"x".repeat(150)}...`);
  });

  it("returns empty for no text", () => {
    expect(enLiveSummary(null, null)).toBe("");
  });
});

describe("buildEnLivePage", () => {
  it("sets nextCursor only when an extra row exists", () => {
    const rows = [
      row({ id: "a", publishedAt: new Date("2026-11-16T10:00:00Z") }),
      row({ id: "b", publishedAt: new Date("2026-11-16T09:00:00Z") }),
      row({ id: "c", publishedAt: new Date("2026-11-16T08:00:00Z") }),
    ];
    const page = buildEnLivePage(rows, 2, { b: 4 });
    expect(page.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(page.items[1].commentsCount).toBe(4);
    expect(page.nextCursor).toBe("2026-11-16T09:00:00.000Z");
    expect(buildEnLivePage(rows, 3, {}).nextCursor).toBeNull();
  });
});

describe("query parsing", () => {
  it("accepts ISO cursors and rejects junk", () => {
    expect(parseEnLiveCursor(undefined)).toEqual({ ok: true });
    expect(parseEnLiveCursor("2026-11-16T09:00:00.000Z")).toEqual({ ok: true, cursor: "2026-11-16T09:00:00.000Z" });
    expect(parseEnLiveCursor("'; drop table")).toEqual({ ok: false });
    expect(parseEnLiveCursor(["a", "b"])).toEqual({ ok: false });
  });

  it("accepts category ids, treats all as none, rejects junk", () => {
    expect(parseEnLiveCategory("all")).toEqual({ ok: true });
    expect(parseEnLiveCategory("cat-saudi")).toEqual({ ok: true, categoryId: "cat-saudi" });
    expect(parseEnLiveCategory("x y")).toEqual({ ok: false });
  });
});
