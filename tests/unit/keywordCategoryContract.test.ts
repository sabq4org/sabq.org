import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../../server/db", () => ({ db: { execute }, executeWithStatementTimeout: (query: unknown) => execute(query) }));
import { getArticlesByKeyword } from "../../server/services/keywordService";

const dialect = new PgDialect();
const article = { id: "news-1", title: "خبر رياضي", categoryName: "رياضة", categorySlug: "sports", category: { id: "sports", nameAr: "رياضة", slug: "sports", color: "#2ECC71" } };

describe("keyword article category contract", () => {
  beforeEach(() => execute.mockReset());

  it.each([0, 1, 2])("includes categories when articles are found by lookup %i", async (fallbacks) => {
    for (let i = 0; i < fallbacks; i++) execute.mockResolvedValueOnce({ rows: [] });
    execute.mockResolvedValueOnce({ rows: [article] });
    execute.mockResolvedValueOnce({ rows: [{ id: "topic-1" }] });

    expect(await getArticlesByKeyword("نيوم")).toEqual({
      articles: [article], muqtarabTopics: [{ id: "topic-1" }],
    });
    const queries = execute.mock.calls.slice(0, fallbacks + 1).map(([query]) => dialect.sqlToQuery(query));
    for (const query of queries) {
      expect(query.sql).toMatch(/LEFT JOIN categories c ON c.id = a.category_id/);
      expect(query.sql).toContain('c.name_ar AS "categoryName"');
      expect(query.sql).toContain('c.slug AS "categorySlug"');
      expect(query.sql).toContain("CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(");
      expect(query.sql).toContain("'id', c.id, 'nameAr', c.name_ar, 'slug', c.slug, 'color', c.color");
      expect(query.sql).toContain(") END AS category");
      expect(query.sql).toContain("a.status = 'published'");
      expect(query.sql).toContain("ORDER BY a.published_at DESC");
      expect(query.sql).toContain("LIMIT 20");
      expect(query.params).toContain("نيوم");
    }
  });

  it("preserves articles without a category and the existing payload wrapper", async () => {
    const uncategorized = { ...article, categoryName: null, categorySlug: null, category: null };
    execute.mockResolvedValueOnce([uncategorized]).mockResolvedValueOnce([]);
    expect(await getArticlesByKeyword("وسم")).toEqual({ articles: [uncategorized], muqtarabTopics: [] });
  });

  it("returns empty arrays when none of the lookups match", async () => {
    execute.mockResolvedValue({ rows: [] });
    expect(await getArticlesByKeyword("غير موجود")).toEqual({ articles: [], muqtarabTopics: [] });
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it("propagates database failures instead of reporting empty results", async () => {
    execute.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(getArticlesByKeyword("نيوم")).rejects.toThrow("database unavailable");
  });
});
