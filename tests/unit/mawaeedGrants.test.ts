import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../../migrations/20260927_mawaeed_runtime_grants.sql", import.meta.url), "utf8");

describe("mawaeed runtime grants", () => {
  it("grants sabq_runtime the privileges the service actually uses", () => {
    expect(sql).toContain("GRANT SELECT, UPDATE ON TABLE public.mawaeed_series TO sabq_runtime;");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE ON TABLE public.mawaeed_occurrences TO sabq_runtime;");
    expect(sql).toContain("GRANT SELECT, INSERT ON TABLE public.mawaeed_changes TO sabq_runtime;");
    expect(sql).not.toMatch(/TO PUBLIC/i);
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE FROM)\b/i);
  });
});
