import { describe, it, expect } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { desc } from "drizzle-orm";
import { mediaFiles } from "../../shared/schema";
import { normalizeSearchText, escapeLike, tokenizeSearch, buildMediaSearch, mediaListSortFields, MAX_SEARCH_TOKENS } from "../../server/mediaSearch";

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

  it.each(["وزير الخارجية", "وزارة الصحة", "مستشفى", "أإآٱةى"])("keeps database letter translation aligned for %s", (term) => {
    const q = dialect.sqlToQuery(buildMediaSearch(term)!.where);
    const translation = q.sql.match(/, '([^']+)', '([^']+)'\)\)/);
    expect(translation).not.toBeNull();
    const [, from, to] = translation!;
    const translated = [...term].map((ch) => {
      const index = from.indexOf(ch);
      return index < 0 ? ch : (to[index] ?? "");
    }).join("");
    expect(translated).toBe(normalizeSearchText(term));
  });
});

describe("media list subquery sorting", () => {
  it.each([
    ["وزير الخارجية", false],
    ["فيصل بن فرحان", false],
    ["وزير الخارجية", true],
    ["", true],
    ["", false],
  ])("builds the outer page for search=%s mostUsed=%s", (term, mostUsed) => {
    const db = drizzle.mock();
    const search = buildMediaSearch(term);
    const dedup = db.selectDistinctOn([mediaFiles.url], {
      id: mediaFiles.id,
      url: mediaFiles.url,
      createdAt: mediaFiles.createdAt,
      ...mediaListSortFields(search, mostUsed),
    }).from(mediaFiles).where(search?.where)
      .orderBy(mediaFiles.url, desc(mediaFiles.createdAt), desc(mediaFiles.id)).as("dedup");
    // Accessing the computed fields through the real Drizzle subquery proxy
    // reproduces the production exception when either alias is missing.
    const page = db.select({ id: dedup.id }).from(dedup).orderBy(
      ...(search && !mostUsed ? [desc(dedup.score)] : []),
      mostUsed ? desc(dedup.usage) : desc(dedup.createdAt),
      desc(dedup.id),
    ).limit(20).offset(0).toSQL();
    expect(page.sql).toContain('select distinct on');
    if (mostUsed) expect(page.sql).toContain('order by "usage" desc');
    else if (search) expect(page.sql).toContain('order by "score" desc');
    else expect(page.sql).toContain('order by "dedup"."created_at" desc');
  });
});
