import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../../migrations/20260927_mawaeed_runtime_grants.sql", import.meta.url), "utf8");

describe("mawaeed runtime grants", () => {
  it("grants sabq_runtime full DML only when the role exists", () => {
    expect(sql).toMatch(/IF EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime'\)/);
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE");
    expect(sql).toContain("public.mawaeed_series");
    expect(sql).toContain("public.mawaeed_occurrences");
    expect(sql).toContain("public.mawaeed_changes");
    expect(sql).toContain("TO sabq_runtime;");
    const grantAt = sql.indexOf("GRANT SELECT, INSERT, UPDATE, DELETE");
    const guardAt = sql.indexOf("pg_roles");
    expect(guardAt).toBeGreaterThan(-1);
    expect(grantAt).toBeGreaterThan(guardAt);
    expect(sql).not.toMatch(/TO PUBLIC/i);
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE FROM)\b/i);
  });
});
