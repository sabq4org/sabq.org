import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../../migrations/20261015_social_post_bot_keys.sql", import.meta.url),
  "utf8",
);

function executableSql(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--.*$/gm, " ");
}

describe("social_post_bot_keys migration", () => {
  it("creates the table idempotently with the schema columns, defaults, and FK", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.social_post_bot_keys");
    expect(sql).toMatch(/id varchar PRIMARY KEY DEFAULT gen_random_uuid\(\) NOT NULL/);
    expect(sql).toContain("bot_name text NOT NULL");
    expect(sql).toContain("client_reference text NOT NULL");
    expect(sql).toContain("post_id varchar NOT NULL");
    expect(sql).toMatch(/created_at timestamp DEFAULT now\(\) NOT NULL/);
    expect(sql).toContain("CONSTRAINT social_post_bot_keys_post_id_social_posts_id_fk");
    expect(sql).toMatch(/REFERENCES public\.social_posts \(id\)/);
    expect(sql).toMatch(/ON DELETE cascade/i);
    expect(sql).not.toMatch(/\btimestamptz\b/i);
  });

  it("builds the unique indexes concurrently and outside a transaction", () => {
    expect(sql).toContain(
      "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS social_post_bot_keys_bot_ref_unique",
    );
    expect(sql).toMatch(/USING btree \(bot_name, client_reference\)/);
    expect(sql).toContain(
      "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS social_post_bot_keys_post_unique",
    );
    expect(sql).toMatch(/USING btree \(post_id\)/);
    const body = executableSql(sql);
    expect(body).not.toMatch(/^\s*BEGIN\s*;/m);
    expect(body).not.toMatch(/\bCOMMIT\s*;/);
    const concurrentlyAt = body.indexOf("CREATE UNIQUE INDEX CONCURRENTLY");
    const doAt = body.indexOf("DO $$");
    expect(concurrentlyAt).toBeGreaterThan(-1);
    expect(doAt).toBeGreaterThan(concurrentlyAt);
  });

  it("grants sabq_runtime select and insert only when the role exists", () => {
    expect(sql).toMatch(/IF EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'sabq_runtime'\)/);
    expect(sql).toContain("GRANT SELECT, INSERT ON TABLE public.social_post_bot_keys TO sabq_runtime;");
    expect(sql).toContain("has_table_privilege('sabq_runtime', 'public.social_post_bot_keys', 'SELECT')");
    expect(sql).toContain("has_table_privilege('sabq_runtime', 'public.social_post_bot_keys', 'INSERT')");
    const grantAt = sql.indexOf("GRANT SELECT, INSERT ON TABLE");
    const guardAt = sql.indexOf("pg_roles");
    expect(guardAt).toBeGreaterThan(-1);
    expect(grantAt).toBeGreaterThan(guardAt);
    expect(sql).not.toMatch(/TO PUBLIC/i);
    expect(sql).not.toMatch(/\bGRANT\s+DELETE\b/i);
    const body = executableSql(sql);
    expect(body).not.toMatch(/\b(DROP|TRUNCATE|ALTER)\b/i);
    expect(body).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(body).not.toMatch(/(?<!ON\s)\bUPDATE\b/i);
  });
});
