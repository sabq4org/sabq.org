import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SERIES_CATALOG, SEEDED_CONTENT_UPDATED_AT } from "@shared/mawaeed/model";
import { parseSeedCsv } from "@shared/mawaeed/seed";

type Token = { kind: "str"; value: string } | { kind: "null" } | { kind: "bool"; value: boolean } | { kind: "num"; value: number };

/** يقرأ سلاسل SQL والقيم العارية بنفس ترتيب ظهورها في جملة INSERT. */
function tokens(statement: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < statement.length) {
    const char = statement[i];
    if (char === "'") {
      let value = "";
      i += 1;
      while (i < statement.length) {
        if (statement[i] === "'" && statement[i + 1] === "'") {
          value += "'";
          i += 2;
          continue;
        }
        if (statement[i] === "'") {
          i += 1;
          break;
        }
        value += statement[i];
        i += 1;
      }
      out.push({ kind: "str", value });
      continue;
    }
    if (statement.startsWith("NULL", i) && !/[A-Za-z0-9_]/.test(statement[i + 4] ?? "")) {
      out.push({ kind: "null" });
      i += 4;
      continue;
    }
    if (statement.startsWith("true", i) && !/[A-Za-z0-9_]/.test(statement[i + 4] ?? "")) {
      out.push({ kind: "bool", value: true });
      i += 4;
      continue;
    }
    if (statement.startsWith("false", i) && !/[A-Za-z0-9_]/.test(statement[i + 5] ?? "")) {
      out.push({ kind: "bool", value: false });
      i += 5;
      continue;
    }
    if (/[0-9]/.test(char)) {
      const match = /^\d+/.exec(statement.slice(i));
      if (match) {
        out.push({ kind: "num", value: Number(match[0]) });
        i += match[0].length;
        continue;
      }
    }
    i += 1;
  }
  return out;
}

function str(token: Token | undefined): string {
  if (!token || token.kind !== "str") throw new Error("expected SQL string");
  return token.value;
}

describe("mawaeed seed SQL", () => {
  const sql = readFileSync("migrations/20260927_mawaeed_seed.sql", "utf8");
  const rows = parseSeedCsv(readFileSync("data/mawaeed/2026-09-27-mawaeed-dates.csv", "utf8"));
  const statements = sql
    .replace(/^--.*$/gm, "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("INSERT"));

  it("inserts the five series and 38 occurrences idempotently", () => {
    const series = statements.filter((part) => part.includes("INSERT INTO mawaeed_series"));
    const occurrences = statements.filter((part) => part.includes("INSERT INTO mawaeed_occurrences"));
    expect(series).toHaveLength(SERIES_CATALOG.length);
    expect(occurrences).toHaveLength(38);
    expect(rows).toHaveLength(38);
    expect(series.every((part) => part.includes("ON CONFLICT (slug) DO NOTHING"))).toBe(true);
    expect(occurrences.every((part) => part.includes("ON CONFLICT (seed_key) DO NOTHING"))).toBe(true);
    expect(sql).not.toMatch(/ON CONFLICT \([^)]+\) DO UPDATE/);
  });

  it("matches the script's series stamp and occurrence fields", () => {
    const series = statements.filter((part) => part.includes("INSERT INTO mawaeed_series"));
    series.forEach((statement, index) => {
      const copy = SERIES_CATALOG[index];
      const values = tokens(statement);
      expect(str(values[0])).toBe(copy.slug);
      expect(str(values[1])).toBe(copy.kind);
      expect(str(values[2])).toBe(copy.titleAr);
      expect(str(values[3])).toBe(copy.summaryAr);
      expect(values[4]).toEqual({ kind: "num", value: copy.sortOrder });
      expect(values[5]).toEqual({ kind: "bool", value: true });
      expect(str(values[6])).toBe(SEEDED_CONTENT_UPDATED_AT);
    });

    const occurrences = statements.filter((part) => part.includes("INSERT INTO mawaeed_occurrences"));
    const keys = occurrences.map((statement) => str(tokens(statement)[1]));
    expect(new Set(keys).size).toBe(38);
    occurrences.forEach((statement, index) => {
      const row = rows[index];
      const values = tokens(statement);
      expect(statement).toContain(`(SELECT id FROM mawaeed_series WHERE slug = '${row.section}')`);
      expect(str(values[0])).toBe(row.section);
      expect(str(values[1])).toBe(row.seedKey);
      expect(str(values[2])).toBe(row.eventNameAr);
      expect(str(values[3])).toBe(row.dateGregorian);
      expect(values[4]).toEqual({ kind: "null" });
      expect(str(values[5])).toBe(row.officialSourceUrl);
      expect(str(values[6])).toBe(row.officialSourceName);
      expect(str(values[7])).toBe(row.certainty);
      expect(str(values[8])).toBe("scheduled");
      expect(values[9]).toEqual({ kind: "bool", value: row.published });
      expect(str(values[10])).toBe(row.regionGroup);
      expect(values[11]).toEqual({ kind: "null" });
      expect(values[12]).toEqual({ kind: "null" });
      expect(str(values[13])).toBe(row.ruleOrNote);
      expect(values[14]).toEqual({ kind: "num", value: index });
    });

    const parsed = occurrences.map((statement) => tokens(statement));
    expect(parsed.filter((values) => values[9]?.kind === "bool" && values[9].value && str(values[7]) === "expected")).toHaveLength(12);
    expect(parsed.filter((values) => values[9]?.kind === "bool" && !values[9].value)).toHaveLength(7);
    expect(parsed.filter((values) => values[9]?.kind === "bool" && values[9].value && str(values[7]) === "confirmed")).toHaveLength(19);
  });
});
