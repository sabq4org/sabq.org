import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { articles } from "@shared/schema";
vi.mock("../../server/db", () => ({ db: {} }));
import { adminPublishedPageSql } from "../../server/services/adminArticleList";

const dialect = new PgDialect();
const render = (scoped: boolean) =>
  dialect.sqlToQuery(adminPublishedPageSql(eq(articles.authorId, "u1"), 30, 0, scoped)).sql;

describe("adminPublishedPageSql", () => {
  it("uses the two-index candidate union for the full desk list", () => {
    const sql = render(false);
    expect(sql).toContain("WITH candidates");
    expect(sql).toContain("UNION");
  });

  it("reads an owner-scoped list directly, without the archive-wide candidate scans", () => {
    const sql = render(true);
    expect(sql).not.toContain("candidates");
    expect(sql).toContain('"articles"."author_id" = $');
    expect(sql).toContain("ORDER BY GREATEST(display_order");
  });
});
