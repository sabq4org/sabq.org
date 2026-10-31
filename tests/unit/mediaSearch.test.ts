import { describe, it, expect } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { normalizeSearchText, escapeLike, tokenizeSearch, buildMediaSearch, MAX_SEARCH_TOKENS } from "../../server/mediaSearch";

const dialect = new PgDialect();

describe("normalizeSearchText", () => {
  it("strips tashkeel/tatweel and unifies letters", () => {
    expect(normalizeSearchText("مُحَمَّـــد")).toBe("محمد");
    expect(normalizeSearchText("أإآٱ")).toBe("اااا");
    expect(normalizeSearchText("مدرسة")).toBe("مدرسه");
    expect(normalizeSearchText("مستشفى")).toBe("مستشفي");
    expect(normalizeSearchText("RIYADH")).toBe("riyadh");
  });
});

describe("escapeLike / tokenizeSearch", () => {
  it("escapes wildcards", () => {
    expect(escapeLike("50%_a\\b")).toBe("50\\%\\_a\\\\b");
  });
  it("splits, drops empties and caps", () => {
    expect(tokenizeSearch("  ولي   العهد ")).toEqual(["ولي", "العهد"]);
    expect(tokenizeSearch("a b c d e f g h")).toHaveLength(MAX_SEARCH_TOKENS);
  });
});

describe("buildMediaSearch", () => {
  it("returns null for blank input", () => {
    expect(buildMediaSearch("   ")).toBeNull();
  });
  it("ANDs tokens across all fields with normalised, escaped params", () => {
    const r = buildMediaSearch("الأمير 100%")!;
    const q = dialect.sqlToQuery(r.where);
    for (const col of ["title", "alt_text", "caption", "description", "file_name", "array_to_string"]) {
      expect(q.sql).toContain(col);
    }
    expect(q.sql).toContain(" and ");
    expect(q.params).toContain("%الامير%");
    expect(q.params).toContain("%100\\%%");
  });
  it("adds phrase bonus only for multi-token queries", () => {
    const one = dialect.sqlToQuery(buildMediaSearch("ولي")!.score);
    const two = dialect.sqlToQuery(buildMediaSearch("ولي العهد")!.score);
    expect(one.params).not.toContain("%ولي العهد%");
    expect(two.params).toContain("%ولي العهد%");
  });
});
