// «مكتب سبق» يتجاوز قفل التحرير الخامل (بلا نبض منذ دقيقتين) على مقالات الرأي،
// ويبقى القفل الحي وقفل المسودات مانعَين. الويب (articleLockAllowsWriter) لا يتغير.
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { articleEditLocks, articles } from "@shared/schema";
import {
  articleLockAllowsWriter,
  deskLockAllowsWriter,
  liveDeskEditLock,
} from "../../server/services/articleWriteVersion";

const url = process.env.SESSION_REVOCATION_TEST_URL;
if (url && !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local database only");

describe.skipIf(!url)("desk writes and idle edit locks (PostgreSQL)", () => {
  let pool: Pool;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    const schema = `desk_lock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    pool = new Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 2 });
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query("CREATE TABLE articles (id varchar PRIMARY KEY, status text NOT NULL, draft_locked_by varchar)");
    await pool.query(`CREATE TABLE article_edit_locks (article_id varchar PRIMARY KEY, user_id varchar NOT NULL,
      user_name text NOT NULL, acquired_at timestamp NOT NULL, expires_at timestamp NOT NULL, last_heartbeat timestamp NOT NULL)`);
    db = drizzle(pool);
  });
  beforeEach(async () => {
    await pool.query("DELETE FROM article_edit_locks");
    await pool.query("DELETE FROM articles");
    await pool.query("INSERT INTO articles (id, status) VALUES ('a', 'draft')");
  });
  afterAll(async () => { if (pool) await pool.end(); });

  const lock = (userId: string, heartbeatAgo: string) => pool.query(
    `INSERT INTO article_edit_locks VALUES ('a', $1, 'صحيفة سبق', now() at time zone 'UTC',
      (now() at time zone 'UTC') + interval '8 minutes', (now() at time zone 'UTC') - interval '${heartbeatAgo}')`,
    [userId],
  );
  const deskMayWrite = async (userId: string) =>
    (await db.select({ id: articles.id }).from(articles).where(and(eq(articles.id, "a"), deskLockAllowsWriter(userId)))).length === 1;
  const webMayWrite = async (userId: string) =>
    (await db.select({ id: articles.id }).from(articles).where(and(eq(articles.id, "a"), articleLockAllowsWriter(userId)))).length === 1;
  const liveHolders = async () =>
    (await db.select({ userName: articleEditLocks.userName }).from(articleEditLocks)
      .where(and(eq(articleEditLocks.articleId, "a"), liveDeskEditLock()))).length;

  it("a live colleague lock (recent heartbeat) still blocks the desk", async () => {
    await lock("editor", "30 seconds");
    expect(await deskMayWrite("desk")).toBe(false);
    expect(await liveHolders()).toBe(1);
  });

  it("an idle lock (no heartbeat for over two minutes) no longer blocks the desk", async () => {
    await lock("editor", "3 minutes");
    expect(await deskMayWrite("desk")).toBe(true);
    expect(await liveHolders()).toBe(0);
    // الويب لا يتغير: القفل غير المنتهي يمنع زميل الويب كما كان
    expect(await webMayWrite("colleague")).toBe(false);
  });

  it("an expired lock never blocks", async () => {
    await pool.query(`INSERT INTO article_edit_locks VALUES ('a', 'editor', 'x', now() at time zone 'UTC',
      (now() at time zone 'UTC') - interval '1 second', now() at time zone 'UTC')`);
    expect(await deskMayWrite("desk")).toBe(true);
  });

  it("the draft lock still blocks the desk even without an edit lock", async () => {
    await pool.query("UPDATE articles SET draft_locked_by = 'editor'");
    expect(await deskMayWrite("desk")).toBe(false);
    expect(await deskMayWrite("editor")).toBe(true);
  });
});
