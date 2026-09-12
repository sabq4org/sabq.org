import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { articles } from "@shared/schema";
import { matchesArticleVersion, nextArticleVersion, articleLockAllowsWriter } from "../../server/services/articleWriteVersion";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const url = process.env.SESSION_REVOCATION_TEST_URL;
if (url && !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local database only");
describe.skipIf(!url)("atomic article version", () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = new Pool({ connectionString: url, options: "-c search_path=version_audit" });
    await pool.query("CREATE SCHEMA version_audit");
    await pool.query("CREATE TABLE article_edit_locks(article_id varchar, user_id varchar, expires_at timestamp)");
    await pool.query("CREATE TABLE articles (id varchar PRIMARY KEY, title text, updated_at timestamp NOT NULL)");
    await pool.query("INSERT INTO articles VALUES ('a', 'original', '2026-09-04T12:00:00.123456')");
  });
  afterAll(async () => { if (pool) { await pool.query("DROP SCHEMA version_audit CASCADE"); await pool.end(); } });
  it("accepts exactly one concurrent save and refuses stale replay", async () => {
    const db = drizzle(pool);
    const save = (title: string) => db.update(articles).set({ title, updatedAt: nextArticleVersion })
      .where(and(eq(articles.id, "a"), matchesArticleVersion(new Date("2026-09-04T12:00:00.123Z"))))
      .returning({ title: articles.title });
    const results = await Promise.all([save("first"), save("second")]);
    expect(results.flat()).toHaveLength(1);
    expect(await save("stale")).toHaveLength(0);
  });
  it("refuses another editor's active lock at the write boundary", async () => {
    await pool.query("INSERT INTO article_edit_locks VALUES ('a', 'owner', (now() at time zone 'UTC') + interval '5 minutes')");
    const db = drizzle(pool);
    const save = (user: string) => db.update(articles).set({ title: user })
      .where(and(eq(articles.id, "a"), articleLockAllowsWriter(user))).returning({ title: articles.title });
    expect(await save("other")).toHaveLength(0);
    expect(await save("owner")).toHaveLength(1);
  });
});
