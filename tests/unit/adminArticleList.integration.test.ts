import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, ilike, or } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("../../server/db", () => ({ db: { execute: (...args: any[]) => state.db.execute(...args) } }));
import { articles } from "../../shared/schema";
import { adminScheduledOrder, getAdminArticleMetrics, getAdminPublishedPageIds } from "../../server/services/adminArticleList";

const url = process.env.EDITORIAL_LIST_TEST_DATABASE_URL;
const local = url && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname);
const suite = local ? describe : describe.skip;
const schema = `test_editorial_list_${randomUUID().replaceAll("-", "")}`;
let admin: pg.Pool;
let pool: pg.Pool;
const fullOrder = "GREATEST(display_order,FLOOR(EXTRACT(EPOCH FROM published_at))) DESC,published_at DESC NULLS LAST,created_at DESC,id DESC";

suite("editorial lists — actual PostgreSQL in an isolated local schema", () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 3 });
    await pool.query(`CREATE TABLE articles (
      id text PRIMARY KEY, title text, excerpt text, status text, article_type text,
      author_id text, reporter_id text, category_id text, display_order bigint NOT NULL DEFAULT 0,
      scheduled_at timestamp, published_at timestamp, created_at timestamp DEFAULT '2026-09-01'
    )`);
    state.db = drizzle(pool);
  });
  afterAll(async () => { await pool?.end(); await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin?.end(); });
  beforeEach(async () => { await pool.query("TRUNCATE articles"); });

  it("returns both news and opinion published from old schedules on page one", async () => {
    await pool.query(`INSERT INTO articles(id,status,display_order,published_at)
      SELECT 'ordinary-'||n,'published',1788900000+n,to_timestamp(1788900000+n) AT TIME ZONE 'UTC' FROM generate_series(1,90) n`);
    await pool.query(`INSERT INTO articles(id,status,article_type,display_order,published_at,scheduled_at) VALUES
      ('old-opinion','published','opinion',1788300000,'2026-09-09 06:16:00.039','2026-09-09 06:15'),
      ('old-news','published','news',0,'2026-09-09 06:15','2026-09-09 06:15')`);
    const old = (await pool.query("SELECT id FROM articles ORDER BY display_order DESC,published_at DESC LIMIT 30")).rows.map(r => r.id);
    expect(old).not.toContain("old-opinion"); expect(old).not.toContain("old-news");
    expect((await getAdminPublishedPageIds(undefined, 30, 0)).slice(0, 2)).toEqual(["old-opinion", "old-news"]);
  });

  it("matches the complete sort across pages, tied seconds, null dates and manual values", async () => {
    await pool.query(`INSERT INTO articles(id,status,display_order,published_at,created_at)
      SELECT 'row-'||lpad(n::text,4,'0'),'published',CASE WHEN n%9=0 THEN 0 ELSE 1788900000+(n*37)%113 END,
      CASE WHEN n%7=0 THEN NULL ELSE to_timestamp(1788900000+(n*29)%113+(n%3)*0.001) AT TIME ZONE 'UTC' END,
      '2026-09-01'::timestamp + (n%4)*interval '1 second' FROM generate_series(1,253) n`);
    const expected = (await pool.query(`SELECT id FROM articles ORDER BY ${fullOrder}`)).rows.map(r => r.id);
    const actual: string[] = [];
    for (let offset = 0; offset < 270; offset += 30) actual.push(...await getAdminPublishedPageIds(undefined, 30, offset));
    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(253);
    expect(await getAdminPublishedPageIds(undefined, 30, 300)).toEqual([]);
  });

  it("applies ownership, category, type and search inside both candidate sources", async () => {
    await pool.query(`INSERT INTO articles(id,status,title,excerpt,article_type,author_id,reporter_id,category_id,display_order,published_at)
      SELECT 'filtered-'||n,CASE WHEN n%11=0 THEN 'scheduled' ELSE 'published' END,'خبر '||n,
      CASE WHEN n%2=0 THEN 'اقتصاد' ELSE 'رياضة' END,CASE WHEN n%3=0 THEN 'opinion' ELSE 'news' END,
      CASE WHEN n%4=0 THEN 'owner' ELSE 'other' END,CASE WHEN n%5=0 THEN 'owner' ELSE 'other' END,
      CASE WHEN n%7=0 THEN 'world' ELSE 'local' END,1788900000+n,
      to_timestamp(1788900000+200-n) AT TIME ZONE 'UTC' FROM generate_series(1,180) n`);
    const filter = and(or(eq(articles.authorId,"owner"),eq(articles.reporterId,"owner")),eq(articles.articleType,"news"),eq(articles.categoryId,"local"),ilike(articles.excerpt,"%اقتصاد%"));
    const expected = (await pool.query(`SELECT id FROM articles WHERE status='published' AND (author_id='owner' OR reporter_id='owner') AND article_type='news' AND category_id='local' AND excerpt ILIKE '%اقتصاد%' ORDER BY ${fullOrder}`)).rows.map(r => r.id);
    const actual: string[] = [];
    for (let offset=0;offset<expected.length;offset+=5) actual.push(...await getAdminPublishedPageIds(filter,5,offset));
    expect(actual).toEqual(expected); expect(actual.length).toBeGreaterThan(0);
  });

  it("preserves descending manual override including a just-published row dragged down", async () => {
    await pool.query(`INSERT INTO articles(id,status,display_order,published_at) VALUES
      ('recent','published',0,'2026-09-09 06:16'),('older','published',0,'2026-09-01')`);
    expect(await getAdminPublishedPageIds(undefined,30,0)).toEqual(["recent","older"]);
    await pool.query(`UPDATE articles SET display_order=extract(epoch from '2026-09-09 06:16'::timestamp)::bigint+CASE id WHEN 'older' THEN 2 ELSE 1 END`);
    expect(await getAdminPublishedPageIds(undefined,30,0)).toEqual(["older","recent"]);
  });

  it("lists and counts future, overdue and undated schedules then moves published items between sets", async () => {
    await pool.query(`INSERT INTO articles(id,status,article_type,scheduled_at,display_order) VALUES
      ('future-news','scheduled','news','2099-09-10',900),
      ('due-opinion','scheduled','opinion','2020-09-09',1),
      ('missing-date','scheduled','news',NULL,1000),
      ('draft','draft','news','2099-09-09',1001),('archived','archived','news',NULL,2000)`);
    const scheduled = () => state.db.select({id:articles.id}).from(articles).where(eq(articles.status,"scheduled")).orderBy(adminScheduledOrder);
    expect((await scheduled()).map((r: {id:string})=>r.id)).toEqual(["due-opinion","future-news","missing-date"]);
    expect(await getAdminArticleMetrics()).toEqual({published:0,scheduled:3,draft:1,archived:1});
    await pool.query("UPDATE articles SET status='published',published_at='2026-09-09 06:16' WHERE id='due-opinion'");
    expect(await getAdminPublishedPageIds(undefined,30,0)).toEqual(["due-opinion"]);
    expect((await scheduled()).map((r: {id:string})=>r.id)).toEqual(["future-news","missing-date"]);
    expect(await getAdminArticleMetrics()).toEqual({published:1,scheduled:2,draft:1,archived:1});
  });
});
