import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../../server/db", () => ({
  get db() {
    return holder.db;
  },
}));
// الوسيط مخزّن ساعة في الإنتاج؛ الاختبار يحتاج كل حالة طازجة
vi.mock("../../server/memoryCache", () => ({
  withCache: (_key: string, _ttl: number, fn: () => unknown) => fn(),
}));

import { articles, categories, publisherCreditLogs, pushCampaigns, socialPosts, users, type Publisher } from "@shared/schema";
import {
  getArticlePlacements,
  getCategoryMedians,
  getPortalMonthlyReport,
  getPortalStatement,
  getPublisherBenchmark,
} from "../../server/services/publisherInsightsService";

const url = process.env.EDITORIAL_LIST_TEST_DATABASE_URL ?? process.env.SESSION_REVOCATION_TEST_URL;
const local = url && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname);
const schema = `test_publisher_insights_${randomUUID().replaceAll("-", "")}`;
let admin: pg.Pool;
let pool: pg.Pool;

function ddl(table: PgTable): string {
  const { name, columns } = getTableConfig(table);
  const cols = columns.map((c) => {
    let def = "";
    if (c.name === "id") def = " PRIMARY KEY DEFAULT gen_random_uuid()::text";
    else if (c.hasDefault && c.default !== undefined && typeof c.default !== "object") {
      def = ` DEFAULT ${typeof c.default === "string" ? `'${c.default.replaceAll("'", "''")}'` : String(c.default)}`;
    } else if (c.hasDefault && c.getSQLType().startsWith("timestamp")) def = " DEFAULT now()";
    return `"${c.name}" ${c.getSQLType()}${def}`;
  });
  return `CREATE TABLE "${name}" (${cols.join(", ")})`;
}

const agency = { id: "agency", agencyName: "وكالة" } as Publisher;
let seq = 0;

async function article(p: { publisher?: string | null; category?: string; views: number; daysAgo: number; author?: string; status?: string }) {
  const id = `a${++seq}`;
  await pool.query(
    `INSERT INTO articles (id, title, slug, content, publisher_id, category_id, status, published_at, views, author_id)
     VALUES ($1, $8, $9, 'c', $2, $3, $4, now() - make_interval(days => $5::int), $6, $7)`,
    [id, p.publisher === undefined ? "agency" : p.publisher, p.category ?? "biz", p.status ?? "published", p.daysAgo, p.views, p.author ?? null, id, id],
  );
  return id;
}

async function ledger(articleId: string, actionType: string) {
  await pool.query(
    `INSERT INTO publisher_credit_logs (publisher_id, credit_package_id, article_id, action_type, credits_before, credits_changed, credits_after)
     VALUES ('agency', 'pkg', $1, $2, 0, 0, 0)`,
    [articleId, actionType],
  );
}

(local ? describe : describe.skip)("publisher insights — actual PostgreSQL", () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 4 });
    for (const t of [articles, categories, publisherCreditLogs, pushCampaigns, socialPosts, users]) {
      await pool.query(ddl(t));
    }
    holder.db = drizzle(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE articles, categories, publisher_credit_logs, push_campaigns, social_posts, users");
    await pool.query(`INSERT INTO categories (id, name_ar, slug) VALUES ('biz', 'أعمال', 'biz')`);
  });
  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it("uses the median of Sabq's own stories in the section, ignoring agency stories and fresh ones", async () => {
    for (const views of [100, 200, 300, 400, 50_000]) await article({ publisher: null, views, daysAgo: 10 });
    await article({ publisher: null, views: 99_999, daysAgo: 1 }); // لم تكتمل قراءاته
    await article({ publisher: null, views: 99_999, daysAgo: 200 }); // خارج النافذة
    await article({ views: 99_999, daysAgo: 10 }); // خبر وكالة
    const medians = await getCategoryMedians(["biz"]);
    expect(medians.get("biz")).toEqual({ median: 300, sample: 5 });
  });

  it("needs at least five stories before calling anything usual", async () => {
    for (const views of [100, 200, 300, 400]) await article({ publisher: null, views, daysAgo: 10 });
    expect((await getCategoryMedians(["biz"])).size).toBe(0);
  });

  it("benchmarks the agency against its main section", async () => {
    for (const views of [100, 200, 300, 400, 500]) await article({ publisher: null, views, daysAgo: 10 });
    for (const views of [600, 700, 800, 900, 1000]) await article({ views, daysAgo: 5 });
    expect(await getPublisherBenchmark(agency)).toMatchObject({
      agencyMedian: 800,
      agencySample: 5,
      categoryName: "أعمال",
      categoryMedian: 300,
    });
  });

  it("marks every published story in the statement as charged, settled or missing", async () => {
    const charged = await article({ views: 1, daysAgo: 1 });
    const settled = await article({ views: 1, daysAgo: 1 });
    const refunded = await article({ views: 1, daysAgo: 1 });
    await article({ views: 1, daysAgo: 1 }); // بلا قيد
    await ledger(charged, "credit_used");
    await ledger(settled, "credit_settled");
    await ledger(refunded, "credit_used");
    await ledger(refunded, "credit_refunded");

    const [month] = await getPortalStatement(agency);
    expect(month).toMatchObject({ published: 4, charged: 1, settled: 1, missing: 2 });
  });

  it("reports only placements that actually happened", async () => {
    const a = await article({ views: 1, daysAgo: 1 });
    const b = await article({ views: 1, daysAgo: 1 });
    await pool.query(`INSERT INTO push_campaigns (name, title, body, article_id, status, sent_at) VALUES ('n', 't', 'b', $1, 'sent', now())`, [a]);
    await pool.query(`INSERT INTO push_campaigns (name, title, body, article_id, status) VALUES ('n', 't', 'b', $1, 'draft')`, [b]);
    await pool.query(
      `INSERT INTO social_posts (article_id, text, status, external_post_url, created_by_user_id, published_at) VALUES ($1, 'x', 'published', 'https://x.com/s/1', 'u', now())`,
      [a],
    );
    const map = await getArticlePlacements([
      { id: a, isFeatured: true, newsType: "regular" },
      { id: b, isFeatured: false, newsType: "breaking" },
    ]);
    expect(map.get(a)).toMatchObject({ featured: true, breaking: false, x: { url: "https://x.com/s/1" } });
    expect(map.get(a)?.push).not.toBeNull();
    expect(map.get(b)).toMatchObject({ featured: false, breaking: true, push: null, x: null });
  });

  it("builds the monthly report with sections, authors and the previous month", async () => {
    await pool.query(`INSERT INTO users (id, email, first_name, last_name) VALUES ('u1', 'a@x', 'سارة', 'علي')`);
    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    await article({ views: 500, daysAgo: 0, author: "u1" });
    await article({ views: 300, daysAgo: 0, author: "u1" });
    const report = await getPortalMonthlyReport(agency, month);
    expect(report.totals).toEqual({ published: 2, views: 800 });
    expect(report.categories[0]).toMatchObject({ name: "أعمال", published: 2 });
    expect(report.authors).toEqual([{ name: "سارة علي", published: 2, views: 800 }]);
    expect(report.topArticles.map((t) => t.views)).toEqual([500, 300]);
    expect(report.availableMonths).toContain(month);
  });
});
