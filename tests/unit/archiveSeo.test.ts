import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), where: vi.fn() }));
vi.mock("../../server/db", () => ({ db: {
  execute: mocks.execute,
  select: () => ({ from: () => ({ where: mocks.where }) }),
} }));
import { AR_SITEMAP_BUCKETS, archiveSitemapBucketCondition, legacyPathVariants, resolveLegacyArticlePath, resolveArchiveCanonical, isCanonicalArchiveArticle } from "../../server/services/archiveSeo";

describe("archive canonical and legacy redirects", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps all finer sitemap partitions reachable through the existing index", () => {
    const dialect = new PgDialect();
    expect(AR_SITEMAP_BUCKETS).toBe(500);
    for (let bucket = 1; bucket <= AR_SITEMAP_BUCKETS; bucket++) {
      const q = dialect.sqlToQuery(archiveSitemapBucketCondition(bucket));
      expect(q.sql).toContain('% 50 = $1');
      expect(q.sql).toContain('% 500 = $2');
      expect(q.params).toEqual([(bucket - 1) % 50, bucket - 1]);
    }
    for (const bucket of [0, -1, 501, 1.5, NaN]) {
      expect(() => archiveSitemapBucketCondition(bucket)).toThrow(RangeError);
    }
  });

  it("recognizes imported sections without capturing current features or translated articles", () => {
    expect(legacyPathVariants("/regions/j3vneig16j/")).toEqual(["/regions/j3vneig16j", "/j3vneig16j"]);
    expect(legacyPathVariants("/saudia/community/old")).toEqual(["/saudia/community/old", "/community/old", "/old"]);
    for (const path of ["/en/article/old", "/ur/article/old", "/article/old", "/gulf/old", "/opinion/old", "/regions"]) {
      expect(legacyPathVariants(path)).toEqual([]);
    }
  });

  it("prefers the exact imported mapping regardless of database row order", async () => {
    mocks.where.mockResolvedValue([
      { oldPath: "/old", newPath: "/article/alias" },
      { oldPath: "/regions/old", newPath: "/article/original" },
    ]);
    expect(await resolveLegacyArticlePath("/regions/old")).toBe("/article/original");
  });

  it("does not turn malformed or external mappings into redirects", async () => {
    for (const newPath of ["//evil.example", "https://evil.example", "/login", "/article/a?next=b"]) {
      mocks.where.mockResolvedValue([{ oldPath: "/regions/old", newPath }]);
      expect(await resolveLegacyArticlePath("/regions/old")).toBeNull();
    }
    expect(await resolveLegacyArticlePath("/en/article/old")).toBeNull();
  });

  it("returns no redirect for an independent article, and escapes a canonical slug", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ slug: "خبر قديم" }] });
    expect(await resolveArchiveCanonical("independent")).toBeNull();
    expect(await resolveArchiveCanonical("copy")).toBe(`/article/${encodeURIComponent("خبر قديم")}`);
  });

  it("keeps untrusted slugs parameterized and uses full content, not only legacy IDs", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    const slug = "x' OR 1=1 --";
    await resolveArchiveCanonical(slug);
    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]);
    expect(query.sql).not.toContain(slug);
    expect(query.params).toEqual([slug, slug]);
    expect(query.sql).toContain("original.content = source.content");
    expect(query.sql).toContain("original.published_at = source.published_at");
    const sitemap = new PgDialect().sqlToQuery(isCanonicalArchiveArticle()).sql;
    expect(sitemap).toContain('archive_original.content = "articles"."content"');
    expect(sitemap).toContain("archive_original.status = 'published'");
    // These barriers prevent the planner from combining two indexes per row
    // or decompressing article bodies before ruling out unrelated candidates.
    expect(sitemap).toContain("OFFSET 0");
    expect(sitemap).toContain("WHERE CASE WHEN archive_original.status");
    expect(sitemap).toContain("THEN archive_original.content <> ''");
    expect(sitemap).toContain('"articles"."legacy_slug" IS NULL OR "articles"."legacy_slug" = \'\' THEN true');
  });
});
