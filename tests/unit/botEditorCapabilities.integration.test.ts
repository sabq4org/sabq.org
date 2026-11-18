// استعلامات حقيقية على Postgres محلي: حذف soft، حماية المقالات الخمس، بوابة رصيد الناشر،
// حذف الوسائط، وسقف GPT اليومي. لا يتصل إلا بـ localhost ولا يلمس أي بيانات إنتاج.
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
  publisherCreditLogs, publisherCredits, publishers, users,
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

describe.skipIf(!url)("nashr-sabq editor capabilities against local Postgres", () => {
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
  const snapshot = async (id: string) => (await pool.query(`SELECT status, title, content, updated_at, is_featured FROM articles WHERE id = $1`, [id])).rows[0];

  beforeAll(async () => {
    vi.stubEnv("BOT_DRAFTS_API_TOKENS", `nashr-sabq:${nashr},legacy-bot:${other}`);
    vi.stubEnv("BOT_DRAFTS_WRITE_RATE_LIMIT", "1000");
    vi.stubEnv("BOT_DRAFTS_FAILED_RATE_LIMIT", "1000");
    vi.stubEnv("BOT_DRAFTS_AUTHOR_USER_ID", "bot-author");
    vi.stubEnv("OPENAI_IMAGES_API_KEY", "test-key-not-real");
    const schema = `nashr_caps_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const admin = new Pool({ connectionString: url, max: 1 });
    try { await admin.query(`CREATE SCHEMA ${schema}`); } finally { await admin.end(); }
    pool = new Pool({ connectionString: url, options: `-c search_path=${schema} -c timezone=UTC`, max: 3 });
    for (const table of [users, articles, enArticles, articleEditLocks, enArticleEditLocks, articleRevisions, articleEvents, articleVersions, enArticleRevisions, enArticleEvents,
      publishers, publisherCredits, publisherCreditLogs, botEditorOperations, mediaFiles, articleMediaAssets, mediaUsageLog, aiImageGenerations, categories, tags, articleTags]) await pool.query(ddlFor(table));
    state.db = drizzle(pool);
    await pool.query(`INSERT INTO users (id, email, status) VALUES ('editor-1', 'editor@test.local', 'active'), ('bot-author', 'bot@test.local', 'active'), ('pub-user', 'pub@test.local', 'active'), ('pub-user-2', 'pub2@test.local', 'active')`);
    const insertAr = (id: string, status = "draft", opts: { publisherId?: string; type?: string } = {}) => pool.query(
      `INSERT INTO articles (id, title, slug, content, status, author_id, source, article_type, news_type, publisher_id)
       VALUES ($1::varchar, $2::text, $3::text, '<p>متن تجريبي كافٍ للخبر المحلي</p>', $4::text, 'editor-1', 'manual', $5::text, 'regular', $6::varchar)`,
      [id, `عنوان ${id}`, id, status, opts.type ?? "news", opts.publisherId ?? null],
    );
    for (const id of ["del-draft", "del-live", "del-stale", "del-noreason"]) await insertAr(id, id === "del-live" ? "published" : "draft");
    PROTECTED_ARTICLE_IDS.forEach((id, i) => void i);
    for (const [i, id] of PROTECTED_ARTICLE_IDS.entries()) await insertAr(id, i % 2 ? "draft" : "published", { type: i === 1 || i === 2 ? "opinion" : "news" });
    await pool.query(`INSERT INTO publishers (id, user_id, agency_name, contact_person, phone_number, email) VALUES ('pub-a', 'pub-user', 'وكالة أ', 'م', '1', 'a@x'), ('pub-b', 'pub-user-2', 'وكالة ب', 'م', '1', 'b@x')`);
    await pool.query(`INSERT INTO publisher_credits (id, publisher_id, package_name, total_credits, used_credits, remaining_credits, period, start_date) VALUES ('pkg-b', 'pub-b', 'باقة', 3, 0, 3, 'one-time', now() - interval '1 day')`);
    for (const id of ["cr-no-publish", "cr-no-schedule"]) await insertAr(id, "draft", { publisherId: "pub-a" });
    for (const id of ["cr-ok-publish", "cr-ok-schedule", "cr-twice"]) await insertAr(id, "draft", { publisherId: "pub-b" });
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

  describe("DELETE = soft archive with mandatory reason, expectedUpdatedAt and audit", () => {
    it("rejects a missing reason or missing expectedUpdatedAt and changes nothing", async () => {
      const before = await snapshot("del-noreason");
      const noReason = await call("DELETE", `${AR}/del-noreason`, nashr, { expectedUpdatedAt: before.updated_at });
      expect(noReason.status).toBe(422);
      expect(await noReason.json()).toMatchObject({ code: "validation_error" });
      const noStamp = await call("DELETE", `${AR}/del-noreason`, nashr, { updateReason: "سبب كافٍ" });
      expect(noStamp.status).toBe(422);
      const short = await call("DELETE", `${AR}/del-noreason`, nashr, { updateReason: "ab", expectedUpdatedAt: before.updated_at });
      expect(short.status).toBe(422);
      expect(await snapshot("del-noreason")).toEqual(before);
    });
    it("409 on a stale expectedUpdatedAt", async () => {
      const response = await call("DELETE", `${AR}/del-stale`, nashr, { updateReason: "مادة مكررة", expectedUpdatedAt: "2020-01-01T00:00:00.000Z" });
      expect(response.status).toBe(409);
      expect((await snapshot("del-stale")).status).toBe("draft");
    });
    it("archives a draft (row kept) and writes event, revision and operation", async () => {
      const response = await call("DELETE", `${AR}/del-draft`, nashr, await lifecycle("del-draft", { updateReason: "مسودة مكررة" }));
      expect(response.status).toBe(200);
      const row = await pool.query(`SELECT status, title FROM articles WHERE id = 'del-draft'`);
      expect(row.rows[0]).toMatchObject({ status: "archived", title: "عنوان del-draft" });
      const revisions = await pool.query(`SELECT editor_name, update_reason FROM article_revisions WHERE article_id = 'del-draft'`);
      expect(revisions.rows[0]).toMatchObject({ editor_name: "nashr-sabq", update_reason: "مسودة مكررة" });
      expect((await pool.query(`SELECT 1 FROM article_events WHERE article_id = 'del-draft'`)).rowCount).toBeGreaterThan(0);
      const ops = await pool.query(`SELECT outcome, metadata FROM bot_editor_operations WHERE operation = 'delete_article'`);
      expect(ops.rows.some((o) => o.metadata?.articleId === "del-draft" && o.outcome === "succeeded")).toBe(true);
    });
    it("archives a PUBLISHED article too, never a hard delete", async () => {
      const response = await call("DELETE", `${AR}/del-live`, nashr, await lifecycle("del-live", { updateReason: "خبر خاطئ" }));
      expect(response.status).toBe(200);
      expect((await pool.query(`SELECT status FROM articles WHERE id = 'del-live'`)).rows[0].status).toBe("archived");
      expect((await pool.query(`SELECT count(*)::int AS n FROM articles WHERE id = 'del-live'`)).rows[0].n).toBe(1);
    });
    it("stays 405 for the other bot token", async () => {
      expect((await call("DELETE", `${AR}/del-stale`, other, {})).status).toBe(405);
    });
  });

  describe("protected articles (the five by full id)", () => {
    it("blocks every write with 423, leaves the rows byte-identical, and still allows reads", async () => {
      expect(PROTECTED_ARTICLE_IDS).toHaveLength(5);
      const before = new Map<string, any>();
      for (const id of PROTECTED_ARTICLE_IDS) before.set(id, await snapshot(id));
      for (const id of PROTECTED_ARTICLE_IDS) {
        const body = await lifecycle(id);
        const writes: Array<[string, string, unknown]> = [
          ["PATCH", `${AR}/${id}`, { title: "تعديل ممنوع", updateReason: "تعديل" }],
          ["DELETE", `${AR}/${id}`, body],
          ["POST", `${AR}/${id}/archive`, body],
          ["POST", `${AR}/${id}/unpublish`, body],
          ["PATCH", `${AR}/${id}/visibility`, { isFeatured: true }],
          ["POST", `${AR}/${id}/publish`, body],
          ["POST", `${AR}/${id}/schedule`, { ...body, publishAt: "2030-01-01T09:00:00+03:00" }],
          ["POST", `${AR}/${id}/revert-to-draft`, body],
          ["POST", `${AR}/${id}/push`, {}],
        ];
        for (const token of [nashr, other]) {
          for (const [method, path, payload] of writes) {
            const response = await call(method, path, token, payload);
            expect(response.status, `${method} ${path.replace(id, id.slice(0, 8))}`).toBe(423);
            expect(await response.json()).toMatchObject({ code: "protected_article" });
          }
        }
        const read = await call("GET", `${AR}/${id}`);
        // الخبر يُقرأ؛ مادة الرأي (قبل PR2) قد تعطي 404 من مسار الأخبار لكن لا 423 أبداً للقراءة
        const isOpinion = (await pool.query(`SELECT article_type FROM articles WHERE id = $1`, [id])).rows[0].article_type === "opinion";
        expect(read.status, `GET ${id.slice(0, 8)}`).not.toBe(423);
        if (!isOpinion) { expect(read.status).toBe(200); expect(await read.json()).toMatchObject({ id }); }
      }
      for (const id of PROTECTED_ARTICLE_IDS) expect(await snapshot(id)).toEqual(before.get(id));
      const audited = await pool.query(`SELECT count(*)::int AS n FROM bot_editor_operations WHERE operation = 'protected_write_blocked'`);
      expect(audited.rows[0].n).toBeGreaterThanOrEqual(PROTECTED_ARTICLE_IDS.length * 9);
      for (const id of PROTECTED_ARTICLE_IDS) {
        expect((await pool.query(`SELECT 1 FROM article_revisions WHERE article_id = $1`, [id])).rowCount).toBe(0);
      }
    });
    it("does not block a normal article with a similar id prefix", async () => {
      await pool.query(`INSERT INTO articles (id, title, slug, content, status, author_id, source, article_type, news_type) VALUES ('d05bc8d5-0000-0000-0000-000000000000', 'مشابه', 'similar', '<p>متن تجريبي كافٍ للخبر المحلي</p>', 'draft', 'editor-1', 'manual', 'news', 'regular')`);
      const response = await call("PATCH", `${AR}/d05bc8d5-0000-0000-0000-000000000000`, nashr, { title: "عنوان معدّل", updateReason: "تعديل" });
      expect(response.status).toBe(200);
    });
  });

  describe("publisher credit guard on publish and schedule", () => {
    it("refuses to publish a publisher article without credit (403, rolled back, nothing charged)", async () => {
      const response = await call("POST", `${AR}/cr-no-publish/publish`, nashr, await lifecycle("cr-no-publish"));
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ details: { reason: "no_credits" } });
      expect((await pool.query(`SELECT status FROM articles WHERE id = 'cr-no-publish'`)).rows[0].status).toBe("draft");
      expect((await pool.query(`SELECT 1 FROM publisher_credit_logs WHERE article_id = 'cr-no-publish'`)).rowCount).toBe(0);
    });
    it("refuses to schedule without credit and does not move the article", async () => {
      const response = await call("POST", `${AR}/cr-no-schedule/schedule`, nashr, await lifecycle("cr-no-schedule", { publishAt: "2030-01-01T09:00:00+03:00" }));
      expect(response.status).toBe(403);
      expect((await pool.query(`SELECT status, scheduled_at FROM articles WHERE id = 'cr-no-schedule'`)).rows[0]).toEqual({ status: "draft", scheduled_at: null });
    });
    it("publishes with credit: status published, one credit deducted and logged once", async () => {
      const response = await call("POST", `${AR}/cr-ok-publish/publish`, nashr, await lifecycle("cr-ok-publish"));
      expect(response.status).toBe(200);
      expect((await pool.query(`SELECT status FROM articles WHERE id = 'cr-ok-publish'`)).rows[0].status).toBe("published");
      expect((await pool.query(`SELECT remaining_credits, used_credits FROM publisher_credits WHERE id = 'pkg-b'`)).rows[0]).toEqual({ remaining_credits: 2, used_credits: 1 });
      const logs = await pool.query(`SELECT action_type FROM publisher_credit_logs WHERE article_id = 'cr-ok-publish'`);
      expect(logs.rows).toEqual([{ action_type: "credit_used" }]);
    });
    it("scheduling with credit only checks: remaining credits are untouched", async () => {
      const response = await call("POST", `${AR}/cr-ok-schedule/schedule`, nashr, await lifecycle("cr-ok-schedule", { publishAt: "2030-01-01T09:00:00+03:00" }));
      expect(response.status).toBe(200);
      expect((await pool.query(`SELECT status FROM articles WHERE id = 'cr-ok-schedule'`)).rows[0].status).toBe("scheduled");
      expect((await pool.query(`SELECT remaining_credits FROM publisher_credits WHERE id = 'pkg-b'`)).rows[0].remaining_credits).toBe(2);
    });
    it("is idempotent per article (unpublish then publish again does not charge twice)", async () => {
      expect((await call("POST", `${AR}/cr-twice/publish`, nashr, await lifecycle("cr-twice"))).status).toBe(200);
      const un = await call("POST", `${AR}/cr-twice/unpublish`, nashr, {});
      expect(un.status).toBe(200);
      expect((await call("POST", `${AR}/cr-twice/publish`, nashr, await lifecycle("cr-twice"))).status).toBe(200);
      expect((await pool.query(`SELECT remaining_credits FROM publisher_credits WHERE id = 'pkg-b'`)).rows[0].remaining_credits).toBe(1);
    });
  });

  describe("media library delete (soft: row removed, blob retained, audited)", () => {
    const insertMedia = (id: string, uploadedBy = "bot-author") => pool.query(
      `INSERT INTO media_files (id, file_name, original_name, url, type, mime_type, size, uploaded_by, is_ai_generated) VALUES ($1::varchar, $1::text || '.png', $1::text || '.png', 'https://cdn.test.local/' || $1::text || '.png', 'image', 'image/png', 10, $2::varchar, true)`, [id, uploadedBy]);
    it("deletes an unreferenced bot-owned file and records a snapshot", async () => {
      await insertMedia("m-free");
      const response = await call("DELETE", `${AR}/media/m-free`, nashr, { updateReason: "صورة مكررة" });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ deleted: true, blobRetained: true });
      expect((await pool.query(`SELECT 1 FROM media_files WHERE id = 'm-free'`)).rowCount).toBe(0);
      const ops = await pool.query(`SELECT metadata FROM bot_editor_operations WHERE operation = 'delete_media'`);
      expect(ops.rows[0].metadata).toMatchObject({ mediaId: "m-free", url: "https://cdn.test.local/m-free.png", reason: "صورة مكررة" });
    });
    it("refuses a file used by an article and a file owned by someone else", async () => {
      await insertMedia("m-used");
      await pool.query(`INSERT INTO article_media_assets (article_id, media_file_id, alt_text) VALUES ('del-stale', 'm-used', 'alt')`);
      const used = await call("DELETE", `${AR}/media/m-used`, nashr, { updateReason: "محاولة" });
      expect(used.status).toBe(409);
      await insertMedia("m-human", "editor-1");
      const human = await call("DELETE", `${AR}/media/m-human`, nashr, { updateReason: "محاولة" });
      expect(human.status).toBe(403);
      expect((await pool.query(`SELECT count(*)::int AS n FROM media_files WHERE id IN ('m-used','m-human')`)).rows[0].n).toBe(2);
      expect((await call("DELETE", `${AR}/media/nope`, nashr, { updateReason: "محاولة" })).status).toBe(404);
      expect((await call("DELETE", `${AR}/media/m-used`, other, { updateReason: "محاولة" })).status).toBe(403);
    });
  });

  describe("GPT image: daily cap, 503 when unconfigured, cost logging", () => {
    const gptBody = (requestId: string) => ({ prompt: "رسم توضيحي لخبر اقتصادي عن النفط", model: "gpt-image-2.5-flare", requestId });
    it("returns 503 not_configured without the key and creates no job", async () => {
      state.gptConfigured = false;
      const response = await call("POST", `${AR}/images/generate-gpt`, nashr, gptBody("11111111-1111-4111-8111-111111111111"));
      state.gptConfigured = true;
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ code: "not_configured" });
      expect((await pool.query(`SELECT count(*)::int AS n FROM ai_image_generations`)).rows[0].n).toBe(0);
    });
    it("runs a job end to end: 202, poll, cost row, media library link", async () => {
      const id = "22222222-2222-4222-8222-222222222222";
      const response = await call("POST", `${AR}/images/generate-gpt`, nashr, gptBody(id));
      expect(response.status).toBe(202);
      expect(await response.json()).toMatchObject({ jobId: id, dailyCap: 20 });
      let done = false;
      for (let i = 0; i < 60 && !done; i++) {
        await new Promise((r) => setTimeout(r, 100));
        done = (await pool.query(`SELECT 1 FROM bot_editor_operations WHERE operation = 'generate_image_gpt' AND outcome = 'succeeded'`)).rowCount === 1;
      }
      expect(done).toBe(true);
      const poll = await call("GET", `${AR}/images/generate-gpt/${id}`);
      expect(await poll.json()).toMatchObject({ jobId: id, status: "completed", imageUrl: "https://cdn.test.local/gpt.png" });
      const cost = await pool.query(`SELECT metadata FROM bot_editor_operations WHERE operation = 'generate_image_gpt' AND outcome = 'succeeded'`);
      expect(cost.rows[0].metadata).toMatchObject({ inputTokens: 11, outputTokens: 22, totalTokens: 33, assetId: "media-from-gpt", model: "gpt-image-2.5-flare" });
      expect(JSON.stringify(cost.rows[0].metadata)).not.toContain("النفط");
    });
    it("429 daily_cap_reached once the daily cap is used up, and no new job is created", async () => {
      vi.stubEnv("BOT_EDITOR_GPT_DAILY_CAP", "1");
      const before = (await pool.query(`SELECT count(*)::int AS n FROM ai_image_generations`)).rows[0].n;
      const response = await call("POST", `${AR}/images/generate-gpt`, nashr, gptBody("33333333-3333-4333-8333-333333333333"));
      expect(response.status).toBe(429);
      expect(await response.json()).toMatchObject({ code: "daily_cap_reached", details: { cap: 1, used: 1 } });
      expect((await pool.query(`SELECT count(*)::int AS n FROM ai_image_generations`)).rows[0].n).toBe(before);
      vi.stubEnv("BOT_EDITOR_GPT_DAILY_CAP", "0");
      expect((await call("POST", `${AR}/images/generate-gpt`, nashr, gptBody("44444444-4444-4444-8444-444444444444"))).status).toBe(429);
      vi.unstubAllEnvs();
      vi.stubEnv("BOT_DRAFTS_API_TOKENS", `nashr-sabq:${nashr},legacy-bot:${other}`);
      vi.stubEnv("BOT_DRAFTS_AUTHOR_USER_ID", "bot-author");
      vi.stubEnv("OPENAI_IMAGES_API_KEY", "test-key-not-real");
      vi.stubEnv("BOT_DRAFTS_WRITE_RATE_LIMIT", "1000");
      vi.stubEnv("BOT_DRAFTS_FAILED_RATE_LIMIT", "1000");
    });
    it("kill switch image.generate_gpt stops it before any DB work", async () => {
      vi.stubEnv("BOT_EDITOR_DISABLED_CAPS", "image.generate_gpt");
      const response = await call("POST", `${AR}/images/generate-gpt`, nashr, gptBody("55555555-5555-4555-8555-555555555555"));
      vi.stubEnv("BOT_EDITOR_DISABLED_CAPS", "");
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "capability_disabled" });
    });
  });
});
