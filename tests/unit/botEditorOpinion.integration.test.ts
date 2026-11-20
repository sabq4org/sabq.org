// PR2: مقالات الرأي/التحليل/الزاوية لنشر سبق على Postgres محلي حقيقي (مكتب الرأي + دورة الأخبار).
// لا يتصل إلا بـ localhost ولا يلمس أي بيانات إنتاج.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  aiImageGenerations, articleEditLocks, articleEvents, articleMediaAssets, articleTags, categories, tags, articleRevisions, articleVersions, articles,
  botEditorOperations, enArticleEvents, enArticleRevisions, enArticles, mediaFiles, mediaUsageLog,
  publisherCreditLogs, publisherCredits, publishers, users, opinionWriterSchedules, systemSettings,
} from "@shared/schema";
import { PROTECTED_ARTICLE_IDS } from "@shared/botEditorCapabilities";
import { enArticleEditLocks } from "../../server/services/enArticleEditLocksSchema";

const state = vi.hoisted(() => ({ db: null as any, gptConfigured: true, uploads: 0 }));
vi.mock("../../server/db", () => ({ get db() { return state.db; } }));
vi.mock("../../server/rbac", () => ({ logActivity: vi.fn(), getEffectiveUserPermissions: vi.fn(async () => []) }));
vi.mock("../../server/memoryCache", () => ({ memoryCache: { invalidatePattern: vi.fn(), delete: vi.fn() }, CACHE_TTL: {} }));
vi.mock("../../server/services/contentInvalidation", () => ({ invalidateArticleWrite: vi.fn() }));
vi.mock("../../server/services/botDraftPublishEffects", () => ({
  queueBotDraftPublishEffects: vi.fn(), queueBotDraftScheduleEffects: vi.fn(), queueBotDraftPublishedContentEffects: vi.fn(),
  queueBotDraftVisibilityEffects: vi.fn(), queueBotDraftRestoreEffects: vi.fn(),
}));
vi.mock("../../server/services/enBotDraftPublishEffects", () => ({ queueEnBotDraftSurfaceEffects: vi.fn() }));
vi.mock("../../server/services/publishBannedWordsService", () => ({ denyBannedWords: vi.fn(async () => null) }));
vi.mock("../../server/services/editorAlerts", async (original) => ({ ...(await original<typeof import("../../server/services/editorAlerts")>()), sendOpinionAuthorPublishEmail: vi.fn(async () => undefined) }));
vi.mock("../../server/services/editorialNotifications", () => ({ notifyArticleStakeholders: vi.fn(async () => undefined) }));
vi.mock("../../server/services/openaiImagesProvider", async (original) => {
  const actual = await original<typeof import("../../server/services/openaiImagesProvider")>();
  return {
    ...actual,
    areOpenAIImagesConfigured: () => state.gptConfigured,
    generateOpenAIEditorialImage: vi.fn(async () => ({ buffer: Buffer.from("89504e470d0a1a0a00", "hex"), prompt: "final", usage: { input_tokens: 11, output_tokens: 22, total_tokens: 33 }, requestId: "req_test" })),
  };
});
vi.mock("../../server/services/newsImageStorageService", async (original) => {
  const actual = await original<typeof import("../../server/services/newsImageStorageService")>();
  return { ...actual, newsImageStorageService: { upload: vi.fn(async () => { state.uploads += 1; return { success: true, deliveryUrl: "https://cdn.test.local/gpt.png", thumbnailUrl: null }; }) } };
});
vi.mock("../../server/services/mediaGenerationService", () => ({ saveGeneratedImage: vi.fn(async () => ({ id: "media-from-gpt" })) }));

import { queueBotDraftPublishedContentEffects } from "../../server/services/botDraftPublishEffects";
import arabicRouter from "../../server/routes/botDrafts";
import englishRouter from "../../server/routes/enBotDrafts";

const url = process.env.BOT_EDITOR_TEST_URL || process.env.SESSION_REVOCATION_TEST_URL || process.env.EN_BOT_DRAFTS_TEST_URL;
if (url && !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local database only");

const nashr = "nashr-token-012345678901234567890123456789";
const other = "legacy-token-0123456789012345678901234567";
const AR = "/api/internal/bot-drafts";
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
    return `"${col.name}" ${col.getSQLType()}${col.primary ? " PRIMARY KEY" : ""}${col.notNull && !col.primary ? " NOT NULL" : ""}${def}`;
  });
  return `CREATE TABLE "${config.name}" (${columns.join(", ")})`;
}


describe.skipIf(!url)("nashr-sabq opinion / analysis / column against local Postgres", () => {
  let pool: Pool;
  const app = express();
  app.use(express.json());
  app.use(englishRouter);
  app.use(arabicRouter);
  const server = createServer(app);
  let base = "";
  const call = (method: string, path: string, token = nashr, body?: unknown) => fetch(base + path, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const stamp = async (id: string) => new Date((await pool.query(`SELECT updated_at FROM articles WHERE id = $1`, [id])).rows[0].updated_at).toISOString();
  const lifecycle = async (id: string, extra: Record<string, unknown> = {}) => ({ updateReason: "مراجعة نشر سبق", expectedUpdatedAt: await stamp(id), ...extra });
  const row = async (id: string) => (await pool.query(`SELECT status, title, content, review_status, scheduled_at, published_at, updated_at, article_type FROM articles WHERE id = $1`, [id])).rows[0];
  const PROTECTED_OPINION = PROTECTED_ARTICLE_IDS.find((id) => id.startsWith("8dab8d72"))!;
  const PROTECTED_OPINION_2 = PROTECTED_ARTICLE_IDS.find((id) => id.startsWith("4cfda185"))!;
  const OP = `${AR}/opinion/drafts`;

  beforeAll(async () => {
    vi.stubEnv("BOT_DRAFTS_API_TOKENS", `nashr-sabq:${nashr},legacy-bot:${other}`);
    vi.stubEnv("BOT_DRAFTS_WRITE_RATE_LIMIT", "1000");
    vi.stubEnv("BOT_DRAFTS_FAILED_RATE_LIMIT", "1000");
    vi.stubEnv("BOT_DRAFTS_EXTRAS_RATE_LIMIT", "1000");
    vi.stubEnv("BOT_DRAFTS_AUTHOR_USER_ID", "bot-author");
    const schema = `nashr_op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const admin = new Pool({ connectionString: url, max: 1 });
    try { await admin.query(`CREATE SCHEMA ${schema}`); } finally { await admin.end(); }
    pool = new Pool({ connectionString: url, options: `-c search_path=${schema} -c timezone=UTC`, max: 3 });
    for (const table of [users, articles, enArticles, articleEditLocks, enArticleEditLocks, articleRevisions, articleEvents, articleVersions, enArticleRevisions, enArticleEvents,
      publishers, publisherCredits, publisherCreditLogs, botEditorOperations, mediaFiles, articleMediaAssets, mediaUsageLog, aiImageGenerations, categories, tags, articleTags,
      opinionWriterSchedules, systemSettings]) await pool.query(ddlFor(table));
    state.db = drizzle(pool);
    await pool.query(`INSERT INTO users (id, email, status, first_name, last_name) VALUES ('writer-1', 'w@test.local', 'active', 'سعد', 'الكاتب'), ('bot-author', 'bot@test.local', 'active', 'صحيفة', 'سبق')`);
    const insert = (id: string, type: string, status: string, review: string | null = null, extra: { scheduledAt?: string } = {}) => pool.query(
      `INSERT INTO articles (id, title, slug, content, status, author_id, source, article_type, news_type, review_status, scheduled_at)
       VALUES ($1::varchar, $2::text, $3::text, '<p>متن تجريبي كافٍ لمقال الرأي المحلي، وهو أطول من عشرين حرفاً.</p>', $4::text, 'writer-1', 'manual', $5::text, 'regular', $6::text, $7::timestamp)`,
      [id, `عنوان ${id}`, id, status, type, review, extra.scheduledAt ?? null]);
    await insert("op-pending", "opinion", "draft", "pending_review");
    await insert("op-sched", "opinion", "scheduled", "approved", { scheduledAt: "2030-01-01 09:00:00" });
    await insert("op-live", "opinion", "published");
    await insert("op-return", "opinion", "draft", "pending_review");
    await insert("op-publish", "opinion", "draft", "approved");
    await insert("op-archive", "opinion", "published");
    await insert("an-draft", "analysis", "draft");
    await insert("an-live", "analysis", "published");
    await insert("col-draft", "column", "draft");
    await insert("news-1", "news", "draft");
    await insert(PROTECTED_OPINION, "opinion", "scheduled", "approved", { scheduledAt: "2030-01-01 09:00:00" });
    await insert(PROTECTED_OPINION_2, "opinion", "published");
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (pool) {
      const schema = (await pool.query(`SELECT current_schema() AS s`)).rows[0].s as string;
      await pool.end();
      const admin = new Pool({ connectionString: url, max: 1 });
      try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); } finally { await admin.end(); }
    }
  });

  describe("reads", () => {
    it("GET /:id reads opinion, analysis and column; the default list stays news-only", async () => {
      for (const id of ["op-pending", "an-draft", "col-draft"]) {
        const res = await call("GET", `${AR}/${id}`);
        expect(res.status, id).toBe(200);
        expect(await res.json()).toMatchObject({ id });
      }
      const news = await (await call("GET", AR)).json();
      expect(news.items.map((i: any) => i.id)).toEqual(["news-1"]);
      for (const [type, ids] of [["opinion", ["op-archive", "op-live", "op-pending", "op-publish", "op-return", "op-sched"]], ["analysis", ["an-draft", "an-live"]], ["column", ["col-draft"]]] as const) {
        const res = await call("GET", `${AR}?articleType=${type}&limit=50`);
        expect(res.status, type).toBe(200);
        const found = (await res.json()).items.map((i: any) => i.id);
        for (const id of ids) expect(found).toContain(id);
        expect(found).not.toContain("news-1");
      }
      expect((await call("GET", `${AR}?articleType=weekly_photos`)).status).toBe(400);
      expect((await call("GET", `${AR}?articleType=opinion`, other)).status).toBe(403);
    });
    it("kill switch opinion.read stops opinion reads but not news reads", async () => {
      vi.stubEnv("BOT_EDITOR_DISABLED_CAPS", "opinion.read");
      expect((await call("GET", `${AR}/op-pending`)).status).toBe(403);
      expect((await call("GET", `${AR}?articleType=opinion`)).status).toBe(403);
      expect((await call("GET", `${AR}/news-1`)).status).toBe(200);
      vi.stubEnv("BOT_EDITOR_DISABLED_CAPS", "");
    });
    it("opinion desk detail and board read the real tables", async () => {
      const detail = await call("GET", `${OP}/op-pending`);
      expect(detail.status).toBe(200);
      expect(await detail.json()).toMatchObject({ item: { article: { id: "op-pending", status: "new_draft" } } });
      const board = await call("GET", OP);
      expect(board.status).toBe(200);
      const ids = (await board.json()).items.map((i: any) => i.article.id);
      expect(ids).toEqual(expect.arrayContaining(["op-pending", "op-return", "op-publish"]));
      expect((await call("GET", `${OP}/op-sched`)).status).toBe(200);
    });
  });

  describe("opinion desk lifecycle (same service functions as the human desk)", () => {
    it("edit changes title/content of a pending draft only, with history", async () => {
      const before = await row("op-pending");
      const res = await call("PATCH", `${OP}/op-pending`, nashr, { title: "عنوان رأي معدّل من نشر سبق" });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ changed: true, changedFields: ["title"] });
      const after = await row("op-pending");
      expect(after.title).toBe("عنوان رأي معدّل من نشر سبق");
      expect(after.status).toBe(before.status);
      expect(after.content).toBe(before.content);
      const live = await call("PATCH", `${OP}/op-live`, nashr, { title: "عنوان رأي معدّل لمنشور" });
      expect(live.status).toBeGreaterThanOrEqual(400);
      expect((await row("op-live")).title).toBe("عنوان op-live");
    });
    it("return-to-writer sets needs_revision and notifies; note is required", async () => {
      expect((await call("POST", `${OP}/op-return/return`, nashr, {})).status).toBe(400);
      const res = await call("POST", `${OP}/op-return/return`, nashr, { note: "أعد صياغة المقدمة" });
      expect(res.status).toBe(200);
      const after = await row("op-return");
      expect(after.status).toBe("draft");
      expect(after.review_status).not.toBe("pending_review");
    });
    it("publish an approved opinion draft: status published, publishedAt set, reviewedBy = bot author, op audited", async () => {
      const res = await call("POST", `${OP}/op-publish/publish`, nashr, {});
      expect(res.status).toBe(200);
      const after = await row("op-publish");
      expect(after.status).toBe("published");
      expect(after.published_at).not.toBeNull();
      expect((await pool.query(`SELECT reviewed_by FROM articles WHERE id = 'op-publish'`)).rows[0].reviewed_by).toBe("bot-author");
      const again = await call("POST", `${OP}/op-publish/publish`, nashr, {});
      expect(again.status).toBe(409);
      const ops = await pool.query(`SELECT operation FROM bot_editor_operations WHERE operation = 'opinion_publish'`);
      expect(ops.rowCount).toBe(1);
    });
    it("kill switch opinion.lifecycle blocks publish and leaves the row untouched", async () => {
      const before = await row("op-sched");
      vi.stubEnv("BOT_EDITOR_DISABLED_CAPS", "opinion.lifecycle");
      const res = await call("POST", `${OP}/op-sched/publish`, nashr, {});
      vi.stubEnv("BOT_EDITOR_DISABLED_CAPS", "");
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ code: "capability_disabled" });
      expect(await row("op-sched")).toEqual(before);
    });
  });

  describe("shared lifecycle for opinion types (archive / restore / unpublish / delete)", () => {
    it("archives a published opinion article softly and restores it to draft", async () => {
      const res = await call("DELETE", `${AR}/op-archive`, nashr, await lifecycle("op-archive", { updateReason: "مقال مكرر" }));
      expect(res.status).toBe(200);
      expect((await row("op-archive")).status).toBe("archived");
      expect((await pool.query(`SELECT count(*)::int AS n FROM articles WHERE id = 'op-archive'`)).rows[0].n).toBe(1);
      expect((await pool.query(`SELECT editor_name FROM article_revisions WHERE article_id = 'op-archive'`)).rows[0].editor_name).toBe("نشر سبق");
      const restored = await call("POST", `${AR}/op-archive/restore`, nashr, {});
      expect(restored.status).toBe(200);
      expect((await row("op-archive")).status).toBe("draft");
    });
    it("unpublish works on a published opinion article; the generic edit and publish are redirected to the desk", async () => {
      expect((await call("POST", `${AR}/op-live/unpublish`, nashr, {})).status).toBe(200);
      expect((await row("op-live")).status).toBe("draft");
      const edit = await call("PATCH", `${AR}/op-pending`, nashr, { title: "تعديل عام ممنوع" });
      expect(edit.status).toBe(403);
      expect(await edit.json()).toMatchObject({ code: "forbidden_action" });
      const publish = await call("POST", `${AR}/op-pending/publish`, nashr, await lifecycle("op-pending"));
      expect(publish.status).toBe(403);
      expect((await row("op-pending")).status).toBe("draft");
    });
    it("kill switch opinion.lifecycle blocks archive of an opinion type but not of news", async () => {
      vi.stubEnv("BOT_EDITOR_DISABLED_CAPS", "opinion.lifecycle");
      const blocked = await call("POST", `${AR}/op-sched/archive`, nashr, await lifecycle("op-sched"));
      const news = await call("DELETE", `${AR}/news-1`, nashr, await lifecycle("news-1", { updateReason: "خبر مكرر" }));
      vi.stubEnv("BOT_EDITOR_DISABLED_CAPS", "");
      expect(blocked.status).toBe(403);
      expect((await row("op-sched")).status).toBe("scheduled");
      expect(news.status).toBe(200);
    });
  });

  describe("analysis and column follow the full news lifecycle", () => {
    it("edit, schedule, unschedule, publish, unpublish and delete an analysis draft", async () => {
      expect((await call("PATCH", `${AR}/an-draft`, nashr, { title: "تحليل بعنوان معدّل" })).status).toBe(200);
      expect((await row("an-draft")).title).toBe("تحليل بعنوان معدّل");
      expect((await call("POST", `${AR}/an-draft/schedule`, nashr, await lifecycle("an-draft", { publishAt: "2030-02-01T09:00:00+03:00" }))).status).toBe(200);
      expect((await row("an-draft")).status).toBe("scheduled");
      expect((await call("DELETE", `${AR}/an-draft/schedule`, nashr, await lifecycle("an-draft"))).status).toBe(200);
      expect((await row("an-draft")).status).toBe("draft");
      expect((await call("POST", `${AR}/an-draft/publish`, nashr, await lifecycle("an-draft"))).status).toBe(200);
      expect((await row("an-draft")).status).toBe("published");
      expect((await call("POST", `${AR}/an-draft/unpublish`, nashr, {})).status).toBe(200);
      expect((await call("DELETE", `${AR}/an-draft`, nashr, await lifecycle("an-draft", { updateReason: "تحليل مكرر" }))).status).toBe(200);
      expect((await row("an-draft")).status).toBe("archived");
    });
    it("column: publish then soft delete a published one; other bot token stays out", async () => {
      expect((await call("POST", `${AR}/col-draft/publish`, nashr, await lifecycle("col-draft"))).status).toBe(200);
      expect((await call("DELETE", `${AR}/an-live`, nashr, await lifecycle("an-live", { updateReason: "تحليل خاطئ" }))).status).toBe(200);
      expect((await row("an-live")).status).toBe("archived");
      expect((await call("DELETE", `${AR}/col-draft`, other, {})).status).toBe(405);
    });
  });

  describe("protected opinion articles (8dab8d72 / 4cfda185 by full id)", () => {
    it("423 on every write through the desk routes and the shared routes; rows unchanged; reads allowed", async () => {
      for (const id of [PROTECTED_OPINION, PROTECTED_OPINION_2]) {
        const before = await row(id);
        const writes: Array<[string, string, unknown]> = [
          ["PATCH", `${OP}/${id}`, { title: "تعديل ممنوع من الرأي" }], ["POST", `${OP}/${id}/prepare`, {}], ["POST", `${OP}/${id}/image`, {}],
          ["POST", `${OP}/${id}/schedule`, {}], ["POST", `${OP}/${id}/publish`, {}], ["POST", `${OP}/${id}/return`, { note: "ملاحظة" }],
          ["POST", `${AR}/${id}/archive`, await lifecycle(id)], ["DELETE", `${AR}/${id}`, await lifecycle(id)], ["POST", `${AR}/${id}/unpublish`, {}],
        ];
        for (const [method, path, payload] of writes) {
          const res = await call(method, path, nashr, payload);
          expect(res.status, `${method} ${path.replace(id, id.slice(0, 8))}`).toBe(423);
          expect(await res.json()).toMatchObject({ code: "protected_article" });
        }
        expect(await row(id)).toEqual(before);
        expect((await call("GET", `${AR}/${id}`)).status).toBe(200);
        expect((await call("GET", `${OP}/${id}`)).status).toBe(200);
      }
    });
  });

  describe("published opinion edit (PATCH /opinion/published/:id)", () => {
    const PUB = `${AR}/opinion/published`;
    const dirty = '<p style="text-align: right">الفقرة الأولى من المقال</p><p style="text-align: right">&nbsp;</p><p style="text-align: right">الفقرة الثانية من المقال</p>';
    const seed = (id: string, type = "opinion", status = "published", content = dirty) => pool.query(
      `INSERT INTO articles (id, title, slug, content, status, author_id, source, article_type, news_type, published_at)
       VALUES ($1::varchar, $2::text, $3::text, $4::text, $5::text, 'writer-1', 'manual', $6::text, 'regular', now() - interval '1 hour')`,
      [id, `عنوان ${id}`, id, content, status, type]);
    const full = async (id: string) => (await pool.query(`SELECT title, content, excerpt, status, corrected_at, seo_metadata, updated_at FROM articles WHERE id = $1`, [id])).rows[0];
    const payload = async (id: string, extra: Record<string, unknown> = {}) => ({ expectedUpdatedAt: await stamp(id), updateReason: "إصلاح تنسيق", ...extra });

    it("edits title/body/excerpt of a published opinion: revision + event + cache effect, same status, no wrong-writer change", async () => {
      await seed("pub-1");
      vi.mocked(queueBotDraftPublishedContentEffects).mockClear();
      const before = await full("pub-1");
      const res = await call("PATCH", `${PUB}/pub-1`, nashr, await payload("pub-1", { title: "عنوان معدّل للمقال المنشور", excerpt: "ملخص جديد للمقال", content: '<p>متن جديد كامل للمقال المنشور بعد التحرير.</p>' }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ id: "pub-1", status: "published", title: "عنوان معدّل للمقال المنشور" });
      const after = await full("pub-1");
      expect(after).toMatchObject({ title: "عنوان معدّل للمقال المنشور", excerpt: "ملخص جديد للمقال", status: "published" });
      expect(after.content).toContain("متن جديد كامل");
      expect(after.corrected_at).not.toBeNull();
      expect(new Date(after.updated_at).getTime()).toBeGreaterThan(new Date(before.updated_at).getTime());
      const revisions = (await pool.query(`SELECT editor_name, changed_fields FROM article_revisions WHERE article_id = 'pub-1'`)).rows;
      expect(revisions).toHaveLength(1);
      expect(revisions[0].editor_name).toBe("نشر سبق");
      expect(revisions[0].changed_fields).toEqual(expect.arrayContaining(["title", "content", "excerpt"]));
      expect((await pool.query(`SELECT summary FROM article_events WHERE article_id = 'pub-1' AND event_type = 'updated'`)).rows[0].summary).toContain("إصلاح تنسيق");
      expect(queueBotDraftPublishedContentEffects).toHaveBeenCalledTimes(1);
      expect((await pool.query(`SELECT outcome FROM bot_editor_operations WHERE operation = 'edit_published_opinion'`)).rows.length).toBeGreaterThanOrEqual(1);
    });

    it("formatting-only fix: strips redundant text-align + the empty &nbsp; paragraph, keeps text, and does not stamp a reader-facing correction", async () => {
      await seed("pub-2");
      const res = await call("PATCH", `${PUB}/pub-2`, nashr, await payload("pub-2", { content: dirty, contentFormat: "html" }));
      expect(res.status).toBe(200);
      const after = await full("pub-2");
      expect(after.content).toBe("<p>الفقرة الأولى من المقال</p><p>الفقرة الثانية من المقال</p>");
      expect(after.corrected_at).toBeNull();
      expect(after.seo_metadata?.editorialModifiedAt).toBeUndefined();
      expect((await pool.query(`SELECT changed_fields FROM article_revisions WHERE article_id = 'pub-2'`)).rows[0].changed_fields).toContain("content");
    });

    it("image swap/add with identical plain text is a visible change (stamps correctedAt/editorialModifiedAt); cleanup-only around an unchanged image is not", async () => {
      const withImg = (src: string) => `<p style="text-align: right">الفقرة الأولى من المقال</p><p style="text-align: right">&nbsp;</p><p><img src="${src}" alt="صورة"></p><p>الفقرة الثانية من المقال</p>`;
      // 1) استبدال صورة في المتن بنص مطابق
      await seed("pub-img-1", "opinion", "published", withImg("https://cdn.test/a.jpg"));
      const swap = await call("PATCH", `${PUB}/pub-img-1`, nashr, await payload("pub-img-1", { content: withImg("https://cdn.test/b.jpg"), contentFormat: "html" }));
      expect(swap.status).toBe(200);
      const swapped = await full("pub-img-1");
      expect(swapped.content).toContain("https://cdn.test/b.jpg");
      expect(swapped.corrected_at).not.toBeNull();
      expect(swapped.seo_metadata?.editorialModifiedAt).toBeTruthy();
      // 2) إضافة صورة عبر imageUrls دون أي تغيير نصي
      await seed("pub-img-2");
      const added = await call("PATCH", `${PUB}/pub-img-2`, nashr, await payload("pub-img-2", { imageUrls: ["https://cdn.test/new.jpg"] }));
      expect(added.status).toBe(200);
      const addedRow = await full("pub-img-2");
      expect(addedRow.content).toContain("https://cdn.test/new.jpg");
      expect(addedRow.corrected_at).not.toBeNull();
      expect(addedRow.seo_metadata?.editorialModifiedAt).toBeTruthy();
      // 3) تنظيف فقط والصورة نفسها: لا «تم التحديث»
      await seed("pub-img-3", "opinion", "published", withImg("https://cdn.test/a.jpg"));
      const clean = await call("PATCH", `${PUB}/pub-img-3`, nashr, await payload("pub-img-3", { content: withImg("https://cdn.test/a.jpg"), contentFormat: "html" }));
      expect(clean.status).toBe(200);
      const cleanRow = await full("pub-img-3");
      expect(cleanRow.content).toContain("https://cdn.test/a.jpg");
      expect(cleanRow.content).not.toMatch(/text-align|&nbsp;<\/p>/);
      expect(cleanRow.corrected_at).toBeNull();
      expect(cleanRow.seo_metadata?.editorialModifiedAt).toBeUndefined();
    });

    it("requires expectedUpdatedAt (422), rejects a stale one (409) and requires updateReason (422); nothing is written", async () => {
      await seed("pub-3");
      const snapshot = await full("pub-3");
      expect((await call("PATCH", `${PUB}/pub-3`, nashr, { title: "عنوان بلا إصدار", updateReason: "سبب" })).status).toBe(422);
      expect((await call("PATCH", `${PUB}/pub-3`, nashr, { title: "عنوان بلا سبب", expectedUpdatedAt: await stamp("pub-3") })).status).toBe(422);
      expect((await call("PATCH", `${PUB}/pub-3`, nashr, { title: "عنوان قديم", updateReason: "سبب", expectedUpdatedAt: "2020-01-01T00:00:00Z" })).status).toBe(409);
      expect((await call("PATCH", `${PUB}/pub-3`, nashr, { title: "عنوان بلا منطقة", updateReason: "سبب", expectedUpdatedAt: "2026-01-01 00:00:00" })).status).toBe(422);
      expect(await full("pub-3")).toEqual(snapshot);
    });

    it("refuses writer/attribution changes and unknown fields; refuses non-published opinion, news and the shared route", async () => {
      await seed("pub-4"); await seed("pub-news", "news"); await seed("pub-draft", "opinion", "draft");
      const snapshot = await full("pub-4");
      expect((await call("PATCH", `${PUB}/pub-4`, nashr, await payload("pub-4", { authorId: "bot-author" }))).status).toBe(422);
      expect((await call("PATCH", `${PUB}/pub-4`, nashr, await payload("pub-4", { status: "draft" }))).status).toBe(422);
      expect(await full("pub-4")).toEqual(snapshot);
      const draft = await call("PATCH", `${PUB}/pub-draft`, nashr, await payload("pub-draft", { title: "عنوان مسودة" }));
      expect(draft.status).toBe(409);
      expect(await draft.json()).toMatchObject({ code: "not_published" });
      const news = await call("PATCH", `${PUB}/pub-news`, nashr, await payload("pub-news", { title: "عنوان خبر" }));
      expect(news.status).toBe(403);
      // المسار المشترك يبقى مغلقاً لنوع opinion، والمكتب يرفض المنشور
      const shared = await call("PATCH", `${AR}/pub-4`, nashr, { title: "عنوان من المسار المشترك" });
      expect(shared.status).toBe(403);
      expect((await shared.json()).message).toContain("/opinion/published/:id");
      expect((await call("PATCH", `${OP}/pub-4`, nashr, { title: "عنوان من المكتب" })).status).toBe(409);
      expect(await full("pub-4")).toEqual(snapshot);
    });

    it("other legacy tokens get 403; the kill switch (opinion.edit_published or *) returns 403 capability_disabled", async () => {
      await seed("pub-5");
      const snapshot = await full("pub-5");
      expect((await call("PATCH", `${PUB}/pub-5`, other, await payload("pub-5", { title: "عنوان من توكن آخر" }))).status).toBe(403);
      for (const caps of ["opinion.edit_published", "*"]) {
        vi.stubEnv("BOT_EDITOR_DISABLED_CAPS", caps);
        const res = await call("PATCH", `${PUB}/pub-5`, nashr, await payload("pub-5", { title: "عنوان أثناء الإيقاف" }));
        expect(res.status, caps).toBe(403);
        expect(await res.json()).toMatchObject({ code: "capability_disabled" });
      }
      vi.stubEnv("BOT_EDITOR_DISABLED_CAPS", "opinion.edit");
      expect((await call("PATCH", `${PUB}/pub-5`, nashr, await payload("pub-5", { title: "عنوان بقدرة مستقلة" }))).status).toBe(200);
      vi.stubEnv("BOT_EDITOR_DISABLED_CAPS", "");
      expect(snapshot.title).not.toBe((await full("pub-5")).title);
    });

    it("423 on the protected published opinion (4cfda185) with the row unchanged", async () => {
      const id = PROTECTED_OPINION_2;
      const snapshot = await full(id);
      const res = await call("PATCH", `${PUB}/${id}`, nashr, { title: "تعديل ممنوع على المحمية", updateReason: "سبب", expectedUpdatedAt: await stamp(id) });
      expect(res.status).toBe(423);
      expect(await res.json()).toMatchObject({ code: "protected_article" });
      expect(await full(id)).toEqual(snapshot);
    });

    it("bot-draft saves (analysis edit) drop empty paragraphs and redundant text-align", async () => {
      await seed("pub-an", "analysis", "published");
      const res = await call("PATCH", `${AR}/pub-an`, nashr, { content: dirty, contentFormat: "html", updateReason: "تنظيف" });
      expect(res.status).toBe(200);
      expect((await full("pub-an")).content).toBe("<p>الفقرة الأولى من المقال</p><p>الفقرة الثانية من المقال</p>");
    });
  });
});
