// تذكير «مسودة لم تُرسل» ضد PostgreSQL حقيقي (محلي فقط، كبقية *.integration.test.ts):
// تذكير واحد لكل مسودة بعد 24 ساعة، لا شيء قبلها ولا بعد 14 يومًا، ولا تذكير لكاتب لديه مقال لدى التحرير.
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activityLogs, articles, editorialNotifications, users } from "@shared/schema";

const state = vi.hoisted(() => ({
  db: null as any,
  emails: [] as Array<{ to: string; subject: string; text?: string }>,
}));

vi.mock("../../server/db", () => ({ get db() { return state.db; } }));
vi.mock("../../server/services/email", () => ({
  sendEmailNotification: async (options: { to: string; subject: string; text?: string }) => {
    state.emails.push(options);
    return { success: true };
  },
}));

import { DRAFT_REMINDER_TYPE, runWriterDraftReminderTick } from "../../server/services/writerDraftReminderService";

const url = process.env.SESSION_REVOCATION_TEST_URL;
if (url && !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local database only");

const dialect = new PgDialect();

function ddlFor(table: PgTable): string {
  const config = getTableConfig(table);
  const columns = config.columns.map((col) => {
    let def = "";
    if (col.hasDefault && col.default !== undefined) {
      const value = col.default as any;
      if (value && typeof value === "object" && "queryChunks" in value) def = ` DEFAULT ${dialect.sqlToQuery(value).sql}`;
      else if (typeof value === "string") def = ` DEFAULT '${value.replace(/'/g, "''")}'`;
      else if (typeof value === "number" || typeof value === "boolean") def = ` DEFAULT ${value}`;
      else if (col.getSQLType() === "jsonb") def = ` DEFAULT '${JSON.stringify(value)}'::jsonb`;
    }
    return `"${col.name}" ${col.getSQLType()}${col.primary ? " PRIMARY KEY" : ""}${def}`;
  });
  return `CREATE TABLE "${config.name}" (${columns.join(", ")})`;
}

const NOW = new Date("2026-11-26T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

describe.skipIf(!url)("writer unsent-draft reminder against PostgreSQL", () => {
  let pool: Pool;

  beforeEach(async () => {
    const schema = `draft_reminder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const admin = new Pool({ connectionString: url, max: 1 });
    try {
      await admin.query(`CREATE SCHEMA ${schema}`);
    } finally {
      await admin.end();
    }
    pool = new Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 5 });
    for (const table of [users, articles, editorialNotifications, activityLogs]) await pool.query(ddlFor(table));
    state.db = drizzle(pool);
    state.emails = [];
    await pool.query(`INSERT INTO users (id, email, first_name, role) VALUES
      ('w1', 'w1@test.local', 'سارة', 'opinion_author'),
      ('w2', 'w2@test.local', 'خالد', 'opinion_author'),
      ('r1', 'r1@test.local', 'مراسل', 'reporter')`);
  });

  afterEach(async () => {
    if (pool) await pool.end();
  });

  const addArticle = (id: string, author: string, updatedAt: string, extra: { status?: string; reviewStatus?: string | null; type?: string } = {}) =>
    pool.query(
      `INSERT INTO articles (id, title, slug, content, status, review_status, article_type, author_id, updated_at)
       VALUES ($1, $2, $8, '<p>نص</p>', $3, $4, $5, $6, $7)`,
      [id, `مقال ${id}`, extra.status ?? "draft", extra.reviewStatus ?? null, extra.type ?? "opinion", author, updatedAt, `${id}-slug`],
    );
  const reminders = async () =>
    (await pool.query(`SELECT article_id, user_id, delivery_status FROM editorial_notifications WHERE type = $1 ORDER BY article_id`, [DRAFT_REMINDER_TYPE])).rows;

  it("reminds once per draft after 24 idle hours, by inbox and email", async () => {
    await addArticle("a1", "w1", hoursAgo(25));
    await runWriterDraftReminderTick(NOW);
    expect(await reminders()).toEqual([{ article_id: "a1", user_id: "w1", delivery_status: "sent" }]);
    expect(state.emails.map((e) => e.to)).toEqual(["w1@test.local"]);
    expect(state.emails[0].text).toContain("/dashboard/articles/a1/edit");

    await runWriterDraftReminderTick(new Date(NOW.getTime() + 3600_000));
    expect((await reminders()).length).toBe(1);
    expect(state.emails.length).toBe(1);
  });

  it("skips fresh, stale, already-sent, non-opinion and non-writer drafts", async () => {
    await addArticle("fresh", "w1", hoursAgo(5));
    await addArticle("stale", "w1", hoursAgo(15 * 24));
    await addArticle("sent", "w1", hoursAgo(30), { reviewStatus: "pending_review" });
    await addArticle("news", "w1", hoursAgo(30), { type: "news" });
    await addArticle("reporter", "r1", hoursAgo(30));
    await runWriterDraftReminderTick(NOW);
    expect(await reminders()).toEqual([]);
    expect(state.emails).toEqual([]);
  });

  it("waits while the writer has another article with the editors, then reminds", async () => {
    await addArticle("a2", "w2", hoursAgo(30));
    await addArticle("busy", "w2", hoursAgo(40), { reviewStatus: "pending_review" });
    await runWriterDraftReminderTick(NOW);
    expect(await reminders()).toEqual([]);

    await pool.query(`UPDATE articles SET status = 'published', review_status = 'approved' WHERE id = 'busy'`);
    await runWriterDraftReminderTick(NOW);
    expect((await reminders()).map((r) => r.article_id)).toEqual(["a2"]);
  });

  it("busy writers' drafts do not crowd out other writers' drafts past the batch limit", async () => {
    await addArticle("busy", "w2", hoursAgo(40), { status: "scheduled", reviewStatus: "approved" });
    for (let i = 0; i < 45; i++) await addArticle(`w2d${String(i).padStart(2, "0")}`, "w2", hoursAgo(25 + i / 10));
    await addArticle("w1old", "w1", hoursAgo(100));
    await runWriterDraftReminderTick(NOW);
    expect((await reminders()).map((r) => r.article_id)).toEqual(["w1old"]);
  });

  it("deleting the reminder from the inbox does not trigger a second one", async () => {
    await addArticle("a1", "w1", hoursAgo(25));
    await runWriterDraftReminderTick(NOW);
    await pool.query(`DELETE FROM editorial_notifications`);
    await runWriterDraftReminderTick(new Date(NOW.getTime() + 2 * 24 * 3600_000));
    expect(await reminders()).toEqual([]);
    expect(state.emails.length).toBe(1);
  });

  it("skips old app drafts, which count as already sent", async () => {
    await addArticle("app", "w1", hoursAgo(30));
    await pool.query(`UPDATE articles SET source = 'ios-app' WHERE id = 'app'`);
    await runWriterDraftReminderTick(NOW);
    expect(await reminders()).toEqual([]);
  });

  it("sends at most one reminder per writer per day, newest draft first", async () => {
    await addArticle("old", "w1", hoursAgo(72));
    await addArticle("new", "w1", hoursAgo(26));
    await runWriterDraftReminderTick(NOW);
    expect((await reminders()).map((r) => r.article_id)).toEqual(["new"]);
    await runWriterDraftReminderTick(new Date(NOW.getTime() + 3600_000));
    expect((await reminders()).map((r) => r.article_id)).toEqual(["new"]);
    await runWriterDraftReminderTick(new Date(NOW.getTime() + 25 * 3600_000));
    expect((await reminders()).map((r) => r.article_id)).toEqual(["new", "old"]);
  });
});
