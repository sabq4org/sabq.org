import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../server/objectStorage", () => ({ toCdnUrl: (url: string) => url }));
import { articles } from "../../shared/schema";
import { articleAdminSelect } from "../../server/selectHelpers";

const url = process.env.EDITORIAL_LIST_TEST_DATABASE_URL ?? process.env.SESSION_REVOCATION_TEST_URL;
const local = url && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname);
const schema = `test_bot_attribution_${randomUUID().replaceAll("-", "")}`;
let admin: pg.Pool;
let pool: pg.Pool;

(local ? describe : describe.skip)("admin bot attribution — actual PostgreSQL projection", () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 2 });
    await pool.query("CREATE TABLE articles (id text PRIMARY KEY, source text, source_metadata jsonb)");
    const metadata = { bot: "نشر سبق", publisherUserId: "personal-user", token: "secret-token", publisherTokenId: "private-token-id", originalMessage: "private message", notes: "private notes" };
    await pool.query("INSERT INTO articles VALUES ('personal', 'bot', $1), ('legacy', 'bot', $2), ('manual', 'manual', $1), ('missing', 'bot', NULL)", [JSON.stringify(metadata), JSON.stringify({ bot: "legacy-bot" })]);
  });
  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it("returns the real list projection with identity and bot name, without private metadata", async () => {
    const rows = await drizzle(pool).select({ id: articles.id, sourceMetadata: articleAdminSelect.sourceMetadata }).from(articles);
    const byId = Object.fromEntries(rows.map(row => [row.id, row.sourceMetadata]));
    expect(byId.personal).toEqual({ bot: "نشر سبق", publisherUserId: "personal-user" });
    expect(byId.legacy).toEqual({ bot: "legacy-bot", publisherUserId: null });
    expect(byId.manual).toBeNull();
    expect(byId.missing).toEqual({ bot: null, publisherUserId: null });
    expect(JSON.stringify(rows)).not.toMatch(/secret-token|private-token-id|private message|private notes/);
  });
});
