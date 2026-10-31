// «طلب تعديل» ضد PostgreSQL حقيقي (محلي فقط، كبقية *.integration.test.ts):
// الإنشاء المتزامن، وذرية الاعتماد (الحجز + كتابة المادة)، وإعادة المحاولة،
// وتوجيه البث اللحظي، وإشعار «إشعاراتي التحريرية» الواحد لكل طلب.
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  articleEditRequests,
  articles,
  editorialNotificationPrefs,
  editorialNotifications,
  notificationsInbox,
  pushDevices,
  users,
} from "@shared/schema";

const state = vi.hoisted(() => ({
  db: null as any,
  failInsideApprovalTx: false,
  busEmits: [] as Array<{ userId: unknown; payload: any }>,
  pushes: [] as Array<{ token: string; payload: any }>,
  historySaves: 0,
}));

vi.mock("../../server/db", () => ({ get db() { return state.db; } }));
vi.mock("../../server/notificationBus", () => ({
  notificationBus: { emit: (userId: unknown, payload: unknown) => { state.busEmits.push({ userId, payload }); } },
}));
vi.mock("../../server/notificationService", () => ({ sendDraftSubmittedNotification: async () => {} }));
vi.mock("../../server/services/articleEventsService", () => ({ logArticleEvent: async () => {} }));
vi.mock("../../server/services/articleHistoryService", () => ({
  recordArticleSave: async () => { state.historySaves += 1; return { id: `v${state.historySaves}` }; },
}));
vi.mock("../../server/services/publishFirstService", () => ({
  maybePlanPublishedRevision: async () => null,
  recordArticleRevision: async () => {},
}));
vi.mock("../../server/services/thumbnailService", () => ({ generateArticleThumbnail: async () => {} }));
vi.mock("../../server/openai", () => ({ summarizeArticle: async () => null }));
vi.mock("../../server/seo-generator", () => ({ generateSeoMetadata: async () => { throw new Error("unused"); } }));
vi.mock("../../server/storage", () => ({ storage: {} }));
vi.mock("../../server/services/apnsService", () => ({
  isApnsConfigured: () => true,
  createCustomNotificationPayload: (title: string, body: string, data: unknown) => ({ title, body, data }),
  sendPushNotification: async (token: string, payload: unknown) => { state.pushes.push({ token, payload }); return { success: true }; },
}));
// الدالة الحقيقية، مع حقن فشل اختياري بعد الحجز وكتابة المادة وقبل commit.
vi.mock("../../server/services/breakingNewsService", async (importActual) => {
  const actual = await importActual<typeof import("../../server/services/breakingNewsService")>();
  return {
    ...actual,
    runWithExclusiveBreaking: (writeFn: any, options: any) => actual.runWithExclusiveBreaking(async (tx: any) => {
      const written = await writeFn(tx);
      if (state.failInsideApprovalTx) throw new Error("simulated crash before commit");
      return written;
    }, options),
  };
});

import {
  approveEditRequest,
  createEditRequest,
  editRequestDecisionDeepLink,
  rejectEditRequest,
} from "../../server/services/articleEditRequestsService";

const url = process.env.SESSION_REVOCATION_TEST_URL;
if (url && !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local database only");

const SCHEMA = "edit_request_audit";
const dialect = new PgDialect();

/** جدول من تعريف drizzle نفسه (كل الأعمدة، بقيمها الافتراضية) حتى يعمل select() الكامل. */
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

const REPORTER = "reporter-1";
const EDITOR = "editor-1";
const proposed = { title: "عنوان مصحح" };

describe.skipIf(!url)("article edit requests against PostgreSQL", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url, options: `-c search_path=${SCHEMA}`, max: 10 });
    await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await pool.query(`CREATE SCHEMA ${SCHEMA}`);
    for (const table of [users, articles, articleEditRequests, notificationsInbox, editorialNotifications, editorialNotificationPrefs, pushDevices]) {
      await pool.query(ddlFor(table));
    }
    await pool.query(`CREATE TABLE article_edit_locks (article_id varchar PRIMARY KEY, user_id varchar NOT NULL,
      user_name text NOT NULL, acquired_at timestamp, expires_at timestamp NOT NULL, last_heartbeat timestamp)`);
    state.db = drizzle(pool);
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE users, articles, article_edit_requests, notifications_inbox, editorial_notifications, editorial_notification_prefs, push_devices, article_edit_locks");
    await pool.query("DROP INDEX IF EXISTS idx_article_edit_requests_one_pending");
    await pool.query(`INSERT INTO users (id, email, first_name) VALUES ('${REPORTER}', 'r@test.local', 'مراسل'), ('${EDITOR}', 'e@test.local', 'محرر')`);
    await pool.query(`INSERT INTO articles (id, title, slug, content, status, article_type, reporter_id, author_id, updated_at)
      VALUES ('a1', 'العنوان الأصلي', 'a1-slug', '<p>نص</p>', 'published', 'news', '${REPORTER}', '${EDITOR}', '2026-10-31T10:00:00.123456')`);
    await pool.query(`INSERT INTO push_devices (id, user_id, device_token, token_provider, platform, bundle_id)
      VALUES ('d1', '${REPORTER}', 'tok-1', 'apns', 'ios', 'com.sabq.sabqorg')`);
    state.failInsideApprovalTx = false;
    state.busEmits = [];
    state.pushes = [];
    state.historySaves = 0;
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
      await pool.end();
    }
  });

  const create = () => createEditRequest({ articleId: "a1", urgent: false, note: "خطأ في العنوان", proposed } as any, REPORTER);
  const pendingCount = async () => Number((await pool.query("SELECT count(*) FROM article_edit_requests WHERE status = 'pending'")).rows[0].count);
  const waitForNotifications = () => vi.waitFor(async () => {
    expect(Number((await pool.query("SELECT count(*) FROM editorial_notifications WHERE delivery_status <> 'pending'")).rows[0].count)).toBeGreaterThan(0);
  });

  it("ten concurrent creates by the same reporter yield exactly one pending request", async () => {
    // تأخير كل استعلام يوسّع نافذة «فحص ثم إدراج» كما تحت ضغط الإنتاج.
    const realDb = state.db;
    const slowPool = Object.create(pool);
    slowPool.query = async (...args: any[]) => { await new Promise((r) => setTimeout(r, 15)); return (pool.query as any)(...args); };
    slowPool.connect = async () => {
      const client = await pool.connect();
      const query = client.query.bind(client);
      (client as any).query = async (...args: any[]) => { await new Promise((r) => setTimeout(r, 15)); return (query as any)(...args); };
      return client;
    };
    state.db = drizzle(slowPool);
    let results: Awaited<ReturnType<typeof create>>[];
    try {
      results = await Promise.all(Array.from({ length: 10 }, create));
    } finally {
      state.db = realDb;
    }
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const refused = results.filter((r) => !r.ok) as Array<{ status: number; code?: string }>;
    expect(refused).toHaveLength(9);
    expect(refused.every((r) => r.status === 409 && r.code === "EDIT_REQUEST_PENDING")).toBe(true);
    expect(await pendingCount()).toBe(1);
  });

  it("the partial unique index blocks a second pending row, and the service maps 23505 to 409 EDIT_REQUEST_PENDING", async () => {
    // نفس DDL ملف migrations/20261031_article_edit_requests_one_pending.sql (بلا CONCURRENTLY داخل الاختبار).
    await pool.query(`CREATE UNIQUE INDEX idx_article_edit_requests_one_pending ON article_edit_requests (article_id, requester_id) WHERE status = 'pending'`);
    expect((await create()).ok).toBe(true);
    await expect(pool.query(`INSERT INTO article_edit_requests (article_id, requester_id) VALUES ('a1', '${REPORTER}')`))
      .rejects.toMatchObject({ code: "23505" });
    await pool.query(`INSERT INTO article_edit_requests (article_id, requester_id, status) VALUES ('a1', '${REPORTER}', 'cancelled')`);

    // مسار كتابة آخر سبق الفحص: الإدراج يصطدم بالفهرس فيرجع 409 لا 500.
    const realTransaction = state.db.transaction.bind(state.db);
    state.db.transaction = (fn: any) => realTransaction((tx: any) => {
      const t = Object.create(tx);
      t.select = () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) });
      return fn(t);
    });
    try {
      expect(await create()).toMatchObject({ ok: false, status: 409, code: "EDIT_REQUEST_PENDING" });
    } finally {
      state.db.transaction = realTransaction;
    }
    expect(await pendingCount()).toBe(1);
  });

  it("a failure after claim but before commit leaves the request pending and the article untouched", async () => {
    const created = await create();
    if (!created.ok) throw new Error("create failed");
    state.failInsideApprovalTx = true;
    await expect(approveEditRequest({ id: created.request.id, actorId: EDITOR, fields: ["title"] })).rejects.toThrow("simulated crash");
    const request = (await pool.query("SELECT status, decided_by, applied_fields FROM article_edit_requests")).rows[0];
    expect(request).toMatchObject({ status: "pending", decided_by: null, applied_fields: null });
    expect((await pool.query("SELECT title FROM articles WHERE id = 'a1'")).rows[0].title).toBe("العنوان الأصلي");
    expect(state.historySaves).toBe(0);
    expect(state.busEmits).toHaveLength(0);
    expect(Number((await pool.query("SELECT count(*) FROM editorial_notifications")).rows[0].count)).toBe(0);

    // إعادة المحاولة: تُطبَّق مرة واحدة، والثالثة ترجع CLOSED بلا تطبيق ولا إشعار.
    state.failInsideApprovalTx = false;
    const retry = await approveEditRequest({ id: created.request.id, actorId: EDITOR, fields: ["title"] });
    expect(retry.ok).toBe(true);
    const again = await approveEditRequest({ id: created.request.id, actorId: EDITOR, fields: ["title"] });
    expect(again).toMatchObject({ ok: false, status: 409, code: "EDIT_REQUEST_CLOSED" });
    await waitForNotifications();
    expect((await pool.query("SELECT title FROM articles WHERE id = 'a1'")).rows[0].title).toBe("عنوان مصحح");
    const decided = (await pool.query("SELECT status, decided_by, applied_fields, applied_version_id FROM article_edit_requests")).rows[0];
    expect(decided).toMatchObject({ status: "approved", decided_by: EDITOR, applied_fields: ["title"], applied_version_id: "v1" });
    expect(state.historySaves).toBe(1);
    expect(Number((await pool.query("SELECT count(*) FROM notifications_inbox")).rows[0].count)).toBe(1);
    const editorial = (await pool.query("SELECT type, deep_link, delivery_status, article_id FROM editorial_notifications")).rows;
    expect(editorial).toEqual([{
      type: "edit_request_approved",
      deep_link: `sabq://article/a1-slug?editRequest=${created.request.id}`,
      delivery_status: "sent",
      article_id: "a1",
    }]);
    expect(state.pushes).toHaveLength(1);
    expect(state.pushes[0].payload.data).toMatchObject({ type: "editorial.edit_request_approved", deeplink: editorial[0].deep_link });
  });

  it("two concurrent approvals of one request apply once and notify once", async () => {
    const created = await create();
    if (!created.ok) throw new Error("create failed");
    const results = await Promise.all([
      approveEditRequest({ id: created.request.id, actorId: EDITOR, fields: ["title"] }),
      approveEditRequest({ id: created.request.id, actorId: EDITOR, fields: ["title"] }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ code: expect.stringMatching(/^(EDIT_REQUEST_CLOSED|ARTICLE_CHANGED)$/) });
    await waitForNotifications();
    expect(state.historySaves).toBe(1);
    expect(Number((await pool.query("SELECT count(*) FROM editorial_notifications")).rows[0].count)).toBe(1);
    expect(await pendingCount()).toBe(0);
  });

  it("a version conflict rolls the claim back to pending (409 ARTICLE_CHANGED)", async () => {
    const created = await create();
    if (!created.ok) throw new Error("create failed");
    // محرر حفظ المادة بعد قراءة الخدمة لها: نغيّر النسخة بين القراءة والمعاملة.
    const realTransaction = state.db.transaction.bind(state.db);
    state.db.transaction = async (fn: any) => {
      await pool.query("UPDATE articles SET updated_at = now(), title = 'حفظ محرر آخر'");
      return realTransaction(fn);
    };
    try {
      const result = await approveEditRequest({ id: created.request.id, actorId: EDITOR, fields: ["title"] });
      expect(result).toMatchObject({ ok: false, status: 409, code: "ARTICLE_CHANGED" });
    } finally {
      state.db.transaction = realTransaction;
    }
    expect(await pendingCount()).toBe(1);
    expect((await pool.query("SELECT title FROM articles")).rows[0].title).toBe("حفظ محرر آخر");
    expect(state.busEmits).toHaveLength(0);
  });

  it("a live edit lock by someone else returns 409 ARTICLE_LOCKED and keeps the request pending", async () => {
    const created = await create();
    if (!created.ok) throw new Error("create failed");
    await pool.query(`INSERT INTO article_edit_locks VALUES ('a1', 'someone', 'زميل', now(), (now() at time zone 'UTC') + interval '5 minutes', now())`);
    const result = await approveEditRequest({ id: created.request.id, actorId: EDITOR, fields: ["title"] });
    expect(result).toMatchObject({ ok: false, status: 409, code: "ARTICLE_LOCKED" });
    expect(await pendingCount()).toBe(1);
  });

  it("rejection notifies the requester by id on the bus and once in editorial notifications with the reason", async () => {
    const created = await create();
    if (!created.ok) throw new Error("create failed");
    const result = await rejectEditRequest({ id: created.request.id, actorId: EDITOR, reason: "المعلومة غير مؤكدة" });
    expect(result.ok).toBe(true);
    await waitForNotifications();
    expect(state.busEmits).toHaveLength(1);
    expect(state.busEmits[0].userId).toBe(REPORTER);
    expect(state.busEmits[0].payload).toMatchObject({ type: "ArticleEditRequestDecision", title: "لم يُعتمد طلب تعديلك" });
    const inbox = (await pool.query("SELECT body, deeplink FROM notifications_inbox")).rows;
    expect(inbox).toHaveLength(1);
    expect(inbox[0].body).toContain("السبب: المعلومة غير مؤكدة");
    const editorial = (await pool.query("SELECT type, reviewer_note FROM editorial_notifications")).rows;
    expect(editorial).toEqual([{ type: "edit_request_rejected", reviewer_note: "المعلومة غير مؤكدة" }]);
    expect((await rejectEditRequest({ id: created.request.id, actorId: EDITOR, reason: "مرة ثانية" }))).toMatchObject({ code: "EDIT_REQUEST_CLOSED" });
    expect(state.busEmits).toHaveLength(1);
  });

  it("respects the «طلب تعديل» preference: no editorial row or push, inbox still written", async () => {
    await pool.query(`INSERT INTO editorial_notification_prefs (user_id, revision_enabled) VALUES ('${REPORTER}', false)`);
    const created = await create();
    if (!created.ok) throw new Error("create failed");
    await rejectEditRequest({ id: created.request.id, actorId: EDITOR, reason: "سبب" });
    await vi.waitFor(async () => {
      expect(Number((await pool.query("SELECT count(*) FROM notifications_inbox")).rows[0].count)).toBe(1);
    });
    await new Promise((r) => setTimeout(r, 100));
    expect(Number((await pool.query("SELECT count(*) FROM editorial_notifications")).rows[0].count)).toBe(0);
    expect(state.pushes).toHaveLength(0);
  });
});

describe("editRequestDecisionDeepLink", () => {
  it("opens the article when published, the draft otherwise, and carries the request id", () => {
    expect(editRequestDecisionDeepLink({ requestId: "r1", articleId: "a1", articleSlug: "s", articleStatus: "published", articleType: "news" }))
      .toBe("sabq://article/s?editRequest=r1");
    expect(editRequestDecisionDeepLink({ requestId: "r1", articleId: "a1", articleSlug: "s", articleStatus: "published", articleType: "opinion" }))
      .toBe("sabq://opinion/s?editRequest=r1");
    expect(editRequestDecisionDeepLink({ requestId: "r1", articleId: "a1", articleSlug: "s", articleStatus: "draft", articleType: "news" }))
      .toBe("sabq://draft/a1?editRequest=r1");
  });
});
