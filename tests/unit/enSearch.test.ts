import { describe, expect, it } from "vitest";
import {
  EN_SEARCH_MAX_PAGE,
  EN_SEARCH_MAX_QUERY,
  EN_SEARCH_MAX_WORDS,
  enSearchTerms,
  enSearchTotalPages,
  escapeLikePattern,
  normalizeEnSearchQuery,
  parseEnSearchPage,
} from "@shared/enSearch";

describe("normalizeEnSearchQuery", () => {
  it("trims and collapses whitespace and control characters", () => {
    expect(normalizeEnSearchQuery("  Saudi \n\t  Vision\u0000 2030  ")).toBe("Saudi Vision 2030");
  });

  it("rejects non-strings and queries shorter than two characters", () => {
    expect(normalizeEnSearchQuery(undefined)).toBeNull();
    expect(normalizeEnSearchQuery(["saudi"])).toBeNull();
    expect(normalizeEnSearchQuery("")).toBeNull();
    expect(normalizeEnSearchQuery("  a  ")).toBeNull();
    expect(normalizeEnSearchQuery("ai")).toBe("ai");
  });

  it("cuts long queries to the maximum length", () => {
    expect(normalizeEnSearchQuery("x".repeat(500))).toHaveLength(EN_SEARCH_MAX_QUERY);
  });
});

describe("parseEnSearchPage", () => {
  it("defaults invalid values to page 1 and caps deep pages", () => {
    expect(parseEnSearchPage(undefined)).toBe(1);
    expect(parseEnSearchPage("abc")).toBe(1);
    expect(parseEnSearchPage("0")).toBe(1);
    expect(parseEnSearchPage("-3")).toBe(1);
    expect(parseEnSearchPage("3")).toBe(3);
    expect(parseEnSearchPage("99999")).toBe(EN_SEARCH_MAX_PAGE);
  });
});

describe("enSearchTerms / escapeLikePattern / enSearchTotalPages", () => {
  it("lower-cases, de-duplicates, drops one-letter words and caps the word count", () => {
    expect(enSearchTerms("Saudi a SAUDI Vision")).toEqual(["saudi", "vision"]);
    const many = Array.from({ length: 20 }, (_, i) => `w${i}`).join(" ");
    expect(enSearchTerms(many)).toHaveLength(EN_SEARCH_MAX_WORDS);
  });

  it("escapes LIKE wildcards", () => {
    expect(escapeLikePattern("50%_off\\x")).toBe("50\\%\\_off\\\\x");
  });

  it("computes pages within the cap", () => {
    expect(enSearchTotalPages(0)).toBe(1);
    expect(enSearchTotalPages(21)).toBe(2);
    expect(enSearchTotalPages(1_000_000)).toBe(EN_SEARCH_MAX_PAGE);
  });
});
