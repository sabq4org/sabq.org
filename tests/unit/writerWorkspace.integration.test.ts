import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// يعمل فقط على Postgres محلي (localhost):
// WRITER_WORKSPACE_TEST_DATABASE_URL=postgres://user@localhost:5432/db npx vitest run tests/unit/writerWorkspace.integration.test.ts
// كل شيء على اتصال واحد داخل معاملة بجداول مؤقتة (pg_temp تسبق مسار البحث) تنتهي
// بـ ROLLBACK: لا يُنشأ ولا يُحذف أي مخطط أو جدول دائم.
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("../../server/db", () => ({
  db: { select: (...args: any[]) => state.db.select(...args) },
}));
vi.mock("../../server/ai/gateway", () => ({ aiGateway: { complete: vi.fn() } }));
vi.mock("../../server/memoryCache", () => ({ memoryCache: { get: vi.fn(), set: vi.fn() } }));
import { getOpinionAuthorWorkspace } from "../../server/services/opinionAuthorWorkspaceService";

const url = process.env.WRITER_WORKSPACE_TEST_DATABASE_URL;
const local = url && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname);
const suite = local ? describe : describe.skip;
const WRITER = "writer-1";
const ARTICLES = 240;
let pool: pg.Pool;
let client: pg.PoolClient;
let captured: Array<{ sql: string; bytes: number }> = [];

type Row = {
  id: string; title: string; content: string; excerpt: string | null; status: string;
  reviewStatus: string | null; reviewNotes: string | null; views: number; scheduledAt: Date | null;
  publishedAt: Date | null; reviewedAt: Date | null; updatedAt: Date | null; createdAt: Date;
};

// منطق المساحة قبل التعديل حرفيًا (الترتيب والترشيح في الذاكرة) — مرجع المقارنة.
function legacy(writerArticles: Row[], commentRows: Array<{ articleId: string; likesCount: number; content: string; sentiment: string | null }>) {
  const priority = (a: Row) => {
    if (a.reviewStatus === "needs_changes") return 0;
    if (a.reviewStatus === "pending_review") return 1;
    if (a.status === "scheduled") return 2;
    if (a.reviewStatus === "approved") return 3;
    if (a.status === "published") return 4;
    if (a.status === "draft") return 5;
    if (a.reviewStatus === "rejected" || a.status === "archived" || a.status === "rejected") return 6;
    return 7;
  };
  const time = (a: Row) => (a.publishedAt || a.updatedAt || a.createdAt).getTime();
  const published = writerArticles.filter((a) => a.status === "published");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonth = published.filter((a) => a.publishedAt && a.publishedAt >= monthStart);
  const top = [...commentRows].sort((a, b) => b.likesCount - a.likesCount)[0];
  return {
    desk: writerArticles
      .filter((a) => a.status === "draft" || a.status === "scheduled" || a.reviewStatus === "pending_review" || a.reviewStatus === "needs_changes")
      .sort((a, b) => Number(b.reviewStatus === "needs_changes") - Number(a.reviewStatus === "needs_changes"))
      .slice(0, 6).map((a) => a.id),
    tracking: [...writerArticles].sort((a, b) => priority(a) - priority(b) || time(b) - time(a)).map((a) => a.id),
    followUp: [...published].sort((a, b) => b.views - a.views)[0]?.id ?? null,
    writerTitles: writerArticles.slice(0, 10).map((a) => a.title),
    monthly: { publishedCount: thisMonth.length, views: thisMonth.reduce((s, a) => s + a.views, 0) },
    highlighted: top ? { content: top.content, articleTitle: writerArticles.find((a) => a.id === top.articleId)!.title } : null,
  };
}

suite("writer workspace — actual local PostgreSQL, one rolled-back transaction", () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 2000, max: 1 });
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query(`CREATE TEMP TABLE articles (
      id varchar PRIMARY KEY, title text NOT NULL, content text NOT NULL, excerpt text, status text NOT NULL,
      review_status text, review_notes text, views int NOT NULL DEFAULT 0, article_type text NOT NULL,
      author_id varchar NOT NULL, submitter_id varchar, scheduled_at timestamp, published_at timestamp,
      reviewed_at timestamp, updated_at timestamp, created_at timestamp NOT NULL
    )`);
    await client.query(`CREATE TEMP TABLE comments (
      id varchar PRIMARY KEY, article_id varchar NOT NULL, content text NOT NULL, status text NOT NULL,
      current_sentiment text, likes_count int NOT NULL DEFAULT 0, created_at timestamp NOT NULL
    )`);
    await client.query(`CREATE TEMP TABLE world_days (
      id varchar PRIMARY KEY, name_ar text NOT NULL, month int NOT NULL, day int NOT NULL,
      category varchar NOT NULL, is_active boolean NOT NULL
    )`);
    // 240 مقال رأي للكاتب بنص ~9KB (حجم مقال رأي عربي معتاد)، بحالات وتواريخ متنوعة
    // تشمل تعادلات وقيم NULL في updated_at وpublished_at، ومقالات ككاتب ومُرسِل.
    await client.query(`INSERT INTO articles
      SELECT 'w-'||lpad(n::text,4,'0'), 'عنوان '||n, repeat('نص مقال رأي طويل ', 500), 'مقتطف '||n,
        (ARRAY['draft','scheduled','published','published','archived','rejected','published'])[1+n%7],
        (ARRAY[NULL,'pending_review','needs_changes','approved','rejected',NULL])[1+n%6],
        CASE WHEN n%3=0 THEN 'ملاحظة '||n END, (n*37)%500, 'opinion',
        CASE WHEN n%5=0 THEN 'someone-else' ELSE '${WRITER}' END, CASE WHEN n%5=0 THEN '${WRITER}' END,
        CASE WHEN n%7=1 THEN now() + n*interval '1 hour' END,
        CASE WHEN n%7 IN (2,3,6) AND n%11<>0 THEN now() - (n%40)*interval '1 day' END,
        CASE WHEN n%4=0 THEN now() - n*interval '1 hour' END,
        CASE WHEN n%13=0 THEN NULL ELSE now() - ((n*17)%97)*interval '1 hour' END,
        '2026-01-01'::timestamp + (n%9)*interval '1 day'
      FROM generate_series(1,${ARTICLES}) n`);
    await client.query(`INSERT INTO articles VALUES
      ('other-1','لغيره',repeat('x',100),NULL,'published',NULL,NULL,9999,'opinion','other',NULL,NULL,now(),NULL,now(),now()),
      ('news-1','خبر',repeat('x',100),NULL,'draft',NULL,NULL,0,'news','${WRITER}',NULL,NULL,NULL,NULL,now(),now())`);
    await client.query(`INSERT INTO comments
      SELECT 'c-'||n, CASE WHEN n%4=0 THEN 'other-1' ELSE 'w-'||lpad((1+n%${ARTICLES})::text,4,'0') END,
        'تعليق '||n, CASE WHEN n%3=0 THEN 'pending' ELSE 'approved' END,
        CASE WHEN n%2=0 THEN 'positive' ELSE 'neutral' END, n%9 + CASE WHEN n=17 THEN 50 ELSE 0 END,
        now() - n*interval '1 minute'
      FROM generate_series(1,60) n`);
    await client.query(`INSERT INTO world_days VALUES ('d1','اليوم الوطني',9,23,'national',true)`);

    // عدّاد الاستعلامات وحجم الصفوف العائدة (JSON) لكل استعلام.
    const query = client.query.bind(client) as any;
    (client as any).query = async (...args: any[]) => {
      const result = await query(...args);
      const text = typeof args[0] === "string" ? args[0] : args[0]?.text;
      captured.push({ sql: text, bytes: Buffer.byteLength(JSON.stringify(result.rows ?? [])) });
      return result;
    };
    // Promise.all في الخدمة آمن على اتصال واحد: pg يصفّ الاستعلامات.
    state.db = drizzle(client);
  });
  afterAll(async () => {
    if (client) {
      await client.query("ROLLBACK");
      client.release();
    }
    await pool?.end();
  });

  // الاستعلام القديم بلا كاسر تعادل؛ id DESC هنا يثبّت ترتيب الصفوف المتساوية في updated_at
  // كما يفعل الاستعلام الجديد (القديم كان يتركه لترتيب Postgres العشوائي).
  async function legacyFixture() {
    const rows = (await client.query(`SELECT id, title, content, excerpt, status, review_status AS "reviewStatus",
        review_notes AS "reviewNotes", views, scheduled_at AS "scheduledAt", published_at AS "publishedAt",
        reviewed_at AS "reviewedAt", updated_at AS "updatedAt", created_at AS "createdAt"
      FROM articles WHERE article_type='opinion' AND (author_id=$1 OR submitter_id=$1)
      ORDER BY updated_at DESC, id DESC`, [WRITER])).rows as Row[];
    const commentRows = (await client.query(`SELECT article_id AS "articleId", likes_count AS "likesCount", content,
        current_sentiment AS sentiment FROM comments WHERE article_id = ANY($1) AND status='approved'
      ORDER BY created_at DESC LIMIT 20`, [rows.map((r) => r.id)])).rows;
    return { rows, commentRows };
  }

  it("returns the same desk, tracking, follow-up, titles, monthly brief and reader pulse as the in-memory version", async () => {
    const { rows, commentRows } = await legacyFixture();
    const expected = legacy(rows, commentRows);
    const ws = await getOpinionAuthorWorkspace(WRITER);
    expect(ws.tracking.map((a) => a.id)).toEqual(expected.tracking);
    expect(ws.tracking).toHaveLength(rows.length);
    expect(ws.desk.map((a) => a.id)).toEqual(expected.desk);
    expect(ws.followUp?.articleId ?? null).toEqual(expected.followUp);
    expect(ws.context.writerTitles).toEqual(expected.writerTitles);
    expect(ws.monthlyBrief.publishedCount).toBe(expected.monthly.publishedCount);
    expect(ws.monthlyBrief.views).toBe(expected.monthly.views);
    expect(ws.readerPulse.commentsCount).toBe(commentRows.length);
    expect(ws.readerPulse.highlightedComment).toEqual(expected.highlighted);
    expect(ws.trackingPage).toEqual({ total: rows.length, offset: 0, limit: null, hasMore: false });
  });

  it("paginates tracking in SQL with stable, complete pages", async () => {
    const full = (await getOpinionAuthorWorkspace(WRITER)).tracking.map((a) => a.id);
    const paged: string[] = [];
    for (let offset = 0; offset < full.length + 25; offset += 25) {
      const ws = await getOpinionAuthorWorkspace(WRITER, { trackingLimit: 25, trackingOffset: offset });
      expect(ws.trackingPage.total).toBe(full.length);
      expect(ws.trackingPage.hasMore).toBe(offset + 25 < full.length);
      paged.push(...ws.tracking.map((a) => a.id));
    }
    expect(paged).toEqual(full);
  });

  it("measures rows/bytes/queries against the old full-content query", async () => {
    captured = [];
    await legacyFixture();
    const before = captured[0];
    captured = [];
    await getOpinionAuthorWorkspace(WRITER);
    const afterArticles = captured.filter((q) => /from "articles"/i.test(q.sql) && !/from "comments"/i.test(q.sql));
    const afterBytes = afterArticles.reduce((s, q) => s + q.bytes, 0);
    for (const q of captured) expect(q.sql).not.toMatch(/"articles"\."content"/);
    captured = [];
    const page = await getOpinionAuthorWorkspace(WRITER, { trackingLimit: 25 });
    const pageBytes = captured.filter((q) => /from "articles"/i.test(q.sql) && !/from "comments"/i.test(q.sql)).reduce((s, q) => s + q.bytes, 0);
    process.stdout.write(`[measure] writer articles=${page.trackingPage.total} | before: 1 article query, ${before.bytes} bytes `
      + `(4 queries total) | after default: ${afterArticles.length} article queries, ${afterBytes} bytes `
      + `(${afterArticles.length + 2} queries total) | after trackingLimit=25: ${pageBytes} bytes\n`);
    expect(afterBytes).toBeLessThan(before.bytes / 10);
  });
});
