import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { articles } from "@shared/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nextArticleVersion } from "../../server/services/articleWriteVersion";

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/services/newsImageStorageService", () => ({ newsImageStorageService: {} }));
vi.mock("../../server/services/mobileSubmissionService", () => ({ isOwnSubmissionImageUrl: () => false }));

import { adminWriteGuard, resubmitWriteGuard } from "../../server/services/mobileArticleWriteService";

// شرط الكتابة النهائي على PostgreSQL حقيقي محلي فقط:
// MOBILE_WRITE_TEST_DATABASE_URL=postgres://user@localhost:5432/db npx vitest run tests/unit/mobileArticleWrite.integration.test.ts
const url = process.env.MOBILE_WRITE_TEST_DATABASE_URL;
if (url && !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local database only");

const OPENED_AT = new Date("2026-10-31T09:00:00.123Z");

describe.skipIf(!url)("mobile article write guards", () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = new Pool({ connectionString: url, options: "-c search_path=mobile_write_audit" });
    await pool.query("DROP SCHEMA IF EXISTS mobile_write_audit CASCADE");
    await pool.query("CREATE SCHEMA mobile_write_audit");
    await pool.query("CREATE TABLE article_edit_locks(article_id varchar, user_id varchar, user_name text, expires_at timestamp)");
    await pool.query(`CREATE TABLE articles (id varchar PRIMARY KEY, title text, status text, review_status text,
      updated_at timestamp NOT NULL)`);
  });
  beforeEach(async () => {
    await pool.query("DELETE FROM article_edit_locks");
    await pool.query("DELETE FROM articles");
    await pool.query(`INSERT INTO articles VALUES ('a', 'original', 'draft', 'needs_changes', '2026-10-31T09:00:00.123456')`);
  });
  afterAll(async () => {
    if (pool) {
      await pool.query("DROP SCHEMA mobile_write_audit CASCADE");
      await pool.end();
    }
  });

  const resubmit = (title: string, version = OPENED_AT, user = "rep") =>
    drizzle(pool).update(articles).set({ title, reviewStatus: "pending_review", updatedAt: nextArticleVersion } as any)
      .where(resubmitWriteGuard("a", user, version)).returning({ title: articles.title });

  it("does not overwrite an editor's publish that landed during the upload", async () => {
    await pool.query(`UPDATE articles SET status = 'published', review_status = 'approved', updated_at = updated_at + interval '1 second'`);
    expect(await resubmit("writer")).toHaveLength(0);
    const { rows } = await pool.query("SELECT title, status, review_status FROM articles");
    expect(rows[0]).toEqual({ title: "original", status: "published", review_status: "approved" });
  });

  it("refuses an approval that kept the version but changed the review state", async () => {
    await pool.query(`UPDATE articles SET review_status = 'approved'`);
    expect(await resubmit("writer")).toHaveLength(0);
  });

  it("accepts exactly one of two concurrent resubmits and refuses a stale replay", async () => {
    const results = await Promise.all([resubmit("first"), resubmit("second")]);
    expect(results.flat()).toHaveLength(1);
    expect(await resubmit("stale")).toHaveLength(0);
  });

  it("respects another editor's live lock", async () => {
    await pool.query(`INSERT INTO article_edit_locks VALUES ('a', 'editor', 'محرر', (now() at time zone 'UTC') + interval '5 minutes')`);
    expect(await resubmit("writer")).toHaveLength(0);
  });

  const adminSave = (title: string, version = OPENED_AT, admin = "admin") =>
    drizzle(pool).update(articles).set({ title, updatedAt: nextArticleVersion } as any)
      .where(adminWriteGuard("a", admin, version)).returning({ title: articles.title });

  it("refuses an admin form opened before a newer web correction", async () => {
    await pool.query(`UPDATE articles SET title = 'web fix', updated_at = updated_at + interval '2 seconds'`);
    expect(await adminSave("old phone form")).toHaveLength(0);
    const { rows } = await pool.query("SELECT title FROM articles");
    expect(rows[0].title).toBe("web fix");
  });

  it("lets the admin save the version they opened, once", async () => {
    expect(await adminSave("phone fix")).toHaveLength(1);
    expect(await adminSave("phone fix again")).toHaveLength(0);
  });

  it("refuses the admin save while a web editor holds the lock", async () => {
    await pool.query(`INSERT INTO article_edit_locks VALUES ('a', 'editor', 'محرر', (now() at time zone 'UTC') + interval '5 minutes')`);
    expect(await adminSave("phone fix")).toHaveLength(0);
  });
});
