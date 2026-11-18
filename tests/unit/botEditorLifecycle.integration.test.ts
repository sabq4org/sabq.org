// استعلامات حقيقية على Postgres محلي. لا يتصل إلا بـ localhost.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  articleEditLocks,
  articleEvents,
  articleRevisions,
  articleVersions,
  articles,
  enArticleEvents,
  enArticleRevisions,
  enArticles,
  users,
} from "@shared/schema";
import { enArticleEditLocks } from "../../server/services/enArticleEditLocksSchema";

const state = vi.hoisted(() => ({ db: null as any, translated: 0, notified: 0 }));
vi.mock("../../server/db", () => ({ get db() { return state.db; } }));
vi.mock("../../server/rbac", () => ({ logActivity: vi.fn(), getEffectiveUserPermissions: vi.fn(async () => []) }));
vi.mock("../../server/memoryCache", () => ({ memoryCache: { invalidatePattern: vi.fn(), delete: vi.fn() }, CACHE_TTL: {} }));
vi.mock("../../server/services/contentInvalidation", () => ({ invalidateArticleWrite: vi.fn() }));
vi.mock("../../server/services/botDraftPublishEffects", () => ({
  queueBotDraftPublishEffects: vi.fn(),
  queueBotDraftScheduleEffects: vi.fn(),
  queueBotDraftPublishedContentEffects: vi.fn(),
  queueBotDraftVisibilityEffects: vi.fn(),
  queueBotDraftRestoreEffects: vi.fn(),
}));
vi.mock("../../server/services/enBotDraftPublishEffects", () => ({ queueEnBotDraftSurfaceEffects: vi.fn() }));
vi.mock("../../server/services/publishBannedWordsService", () => ({ denyBannedWords: vi.fn(async () => null) }));
vi.mock("../../server/services/editorialNotifications", () => ({ notifyArticleStakeholders: vi.fn(async () => { state.notified += 1; }) }));
vi.mock("../../server/services/enArticleTranslationService", () => ({
  translateArticleToEnglish: vi.fn(async () => { state.translated += 1; return { enArticle: { id: "en-made", status: "published" } }; }),
  EnTranslationError: class EnTranslationError extends Error { code = "AI_FAILED"; },
}));

import arabicRouter from "../../server/routes/botDrafts";
import englishRouter from "../../server/routes/enBotDrafts";

const url = process.env.BOT_EDITOR_TEST_URL || process.env.SESSION_REVOCATION_TEST_URL || process.env.EN_BOT_DRAFTS_TEST_URL;
if (url && !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local database only");

const nashr = "nashr-token-012345678901234567890123456789";
const other = "legacy-token-0123456789012345678901234567";
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

describe.skipIf(!url)("nashr-sabq lifecycle against local Postgres", () => {
  let pool: Pool;
  const app = express();
  app.use(express.json());
  app.use(englishRouter);
  app.use(arabicRouter);
  const server = createServer(app);
  let base = "";

  function call(method: string, path: string, token = nashr, body?: unknown) {
    return fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function stamp(table: "articles" | "en_articles", id: string) {
    const { rows } = await pool.query(`SELECT updated_at FROM ${table} WHERE id = $1`, [id]);
    return new Date(rows[0].updated_at).toISOString();
  }
  function body(expectedUpdatedAt: string, extra: Record<string, unknown> = {}) {
    return { updateReason: "مراجعة نشر سبق", expectedUpdatedAt, ...extra };
  }

  beforeAll(async () => {
    vi.stubEnv("BOT_DRAFTS_API_TOKENS", `nashr-sabq:${nashr},legacy-bot:${other}`);
    vi.stubEnv("BOT_DRAFTS_WRITE_RATE_LIMIT", "1000");
    vi.stubEnv("BOT_DRAFTS_FAILED_RATE_LIMIT", "1000");
    const pushed = process.env.BOT_EDITOR_SCHEMA === "public";
    const schema = pushed ? "public" : `nashr_life_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (!pushed) {
      const admin = new Pool({ connectionString: url, max: 1 });
      try { await admin.query(`CREATE SCHEMA ${schema}`); } finally { await admin.end(); }
    }
    pool = new Pool({ connectionString: url, options: `-c search_path=${schema} -c timezone=UTC`, max: 2 });
    if (!pushed) {
      for (const table of [users, articles, enArticles, articleEditLocks, enArticleEditLocks, articleRevisions, articleEvents, articleVersions, enArticleRevisions, enArticleEvents]) {
        await pool.query(ddlFor(table));
      }
    }
    state.db = drizzle(pool);
    await pool.query(`INSERT INTO users (id, email) VALUES ('editor-1', 'editor@test.local')`);
    const insertAr = (id: string, source: string, status = "draft") => pool.query(
      `INSERT INTO articles (id, title, slug, content, status, author_id, source, article_type, news_type)
       VALUES ($1::varchar, $2::text, $3::text, '<p>متن تجريبي كافٍ للخبر المحلي</p>', $4::text, 'editor-1', $5::text, 'news', 'regular')`,
      [id, `عنوان ${id}`, id, status, source],
    );
    const insertEn = (id: string, source: string | null, status = "draft") => pool.query(
      `INSERT INTO en_articles (id, title, slug, content, status, author_id, seo_metadata, article_type, news_type)
       VALUES ($1::varchar, $2::text, $3::text, '<p>Local English story body</p>', $4::text, 'editor-1', $5::jsonb, 'news', 'regular')`,
      [id, `Title ${id}`, id, status, source ? JSON.stringify({ source }) : null],
    );
    await insertAr("manual-draft", "manual");
    await insertAr("ios-draft", "ios-app");
    await insertAr("locked-draft", "manual");
    await insertAr("ready-draft", "manual", "ready_to_publish");
    await insertAr("live-story", "manual", "published");
    await insertEn("en-manual", null);
    await insertEn("en-ios", "ios-app");
    await insertEn("en-locked", null);
    await insertEn("en-live", null, "published");
    const until = new Date(Date.now() + 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO article_edit_locks (article_id, user_id, user_name, expires_at) VALUES ('locked-draft', 'editor-1', 'محرر بشري', $1)`,
      [until],
    );
    await pool.query(
      `INSERT INTO en_article_edit_locks (article_id, user_id, user_name, expires_at) VALUES ('en-locked', 'editor-1', 'محرر بشري', $1)`,
      [until],
    );
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (pool) {
      const ids = ["manual-draft", "ios-draft", "locked-draft", "ready-draft", "live-story", "fresh"];
      const enIds = ["en-manual", "en-ios", "en-locked", "en-live"];
      await pool.query(`DELETE FROM article_edit_locks WHERE article_id = ANY($1::varchar[])`, [ids]).catch(() => undefined);
      await pool.query(`DELETE FROM en_article_edit_locks WHERE article_id = ANY($1::varchar[])`, [enIds]).catch(() => undefined);
      for (const table of ["article_versions", "article_revisions", "article_events"]) {
        await pool.query(`DELETE FROM ${table} WHERE article_id = ANY($1::varchar[])`, [ids]).catch(() => undefined);
      }
      for (const table of ["en_article_revisions", "en_article_events"]) {
        await pool.query(`DELETE FROM ${table} WHERE article_id = ANY($1::varchar[])`, [enIds]).catch(() => undefined);
      }
      await pool.query(`DELETE FROM articles WHERE id = ANY($1::varchar[])`, [ids]).catch(() => undefined);
      await pool.query(`DELETE FROM en_articles WHERE id = ANY($1::varchar[])`, [enIds]).catch(() => undefined);
      await pool.query(`DELETE FROM users WHERE id = 'editor-1'`).catch(() => undefined);
      await pool.end();
    }
  });

  it("publishes and schedules editor drafts for nashr, and leaves the source unchanged", async () => {
    const published = await call("POST", "/api/internal/bot-drafts/manual-draft/publish", nashr, body(await stamp("articles", "manual-draft")));
    expect(published.status).toBe(200);
    expect(await published.json()).toMatchObject({ id: "manual-draft", status: "published", source: "manual" });
    const scheduled = await call("POST", "/api/internal/bot-drafts/ios-draft/schedule", nashr, body(await stamp("articles", "ios-draft"), { publishAt: "2030-01-01T09:00:00.000Z" }));
    expect(scheduled.status).toBe(200);
    expect(await scheduled.json()).toMatchObject({ id: "ios-draft", status: "scheduled", source: "ios-app" });
    const { rows } = await pool.query(`SELECT id, status, source, scheduled_at IS NOT NULL AS has_slot FROM articles WHERE id IN ('manual-draft', 'ios-draft') ORDER BY id`);
    expect(rows).toEqual([
      { id: "ios-draft", status: "scheduled", source: "ios-app", has_slot: true },
      { id: "manual-draft", status: "published", source: "manual", has_slot: false },
    ]);
    const revisions = await pool.query(`SELECT editor_name, update_reason, original_source FROM article_revisions WHERE article_id = 'manual-draft'`);
    expect(revisions.rows[0]).toMatchObject({ editor_name: "nashr-sabq", update_reason: "مراجعة نشر سبق", original_source: "manual" });
    const versions = await pool.query(`SELECT action FROM article_versions WHERE article_id = 'manual-draft' ORDER BY version_number`);
    expect(versions.rows.map((row) => row.action)).toEqual(["baseline", "published"]);
  });

  it("returns 404 to another bot and 409 to a human edit lock without releasing it", async () => {
    const missing = await call("POST", "/api/internal/bot-drafts/ios-draft/publish", other, {});
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "not_found" });
    const locked = await call("POST", "/api/internal/bot-drafts/locked-draft/publish", nashr, body(await stamp("articles", "locked-draft")));
    expect(locked.status).toBe(409);
    expect(await locked.json()).toMatchObject({ code: "locked_by_editor" });
    const still = await pool.query(`SELECT user_name, status FROM article_edit_locks l JOIN articles a ON a.id = l.article_id WHERE l.article_id = 'locked-draft'`);
    expect(still.rows[0]).toMatchObject({ user_name: "محرر بشري", status: "draft" });
  });

  it("reschedules and unschedules an editor draft", async () => {
    const moved = await call("PATCH", "/api/internal/bot-drafts/ios-draft/schedule", nashr, body(await stamp("articles", "ios-draft"), { publishAt: "2031-06-01T09:00:00.000Z" }));
    expect(moved.status).toBe(200);
    expect(await moved.json()).toMatchObject({ status: "scheduled" });
    const back = await call("DELETE", "/api/internal/bot-drafts/ios-draft/schedule", nashr, body(await stamp("articles", "ios-draft")));
    expect(back.status).toBe(200);
    const row = await pool.query(`SELECT status, scheduled_at FROM articles WHERE id = 'ios-draft'`);
    expect(row.rows[0].status).toBe("draft");
    expect(row.rows[0].scheduled_at).toBeNull();
  });

  it("runs the same publish, schedule and lock rules on English articles", async () => {
    const published = await call("POST", "/api/internal/bot-drafts/en/en-manual/publish", nashr, body(await stamp("en_articles", "en-manual")));
    expect(published.status).toBe(200);
    expect(await published.json()).toMatchObject({ id: "en-manual", status: "published" });
    const scheduled = await call("POST", "/api/internal/bot-drafts/en/en-ios/schedule", nashr, body(await stamp("en_articles", "en-ios"), { publishAt: "2030-01-02T09:00:00.000Z" }));
    expect(scheduled.status).toBe(200);
    const row = await pool.query(`SELECT status, seo_metadata->>'source' AS source, scheduled_at IS NOT NULL AS has_slot FROM en_articles WHERE id = 'en-ios'`);
    expect(row.rows[0]).toEqual({ status: "scheduled", source: "ios-app", has_slot: true });
    const foreign = await call("POST", "/api/internal/bot-drafts/en/en-manual/schedule", other, { publishAt: "2030-01-03T09:00:00.000Z" });
    expect(foreign.status).toBe(404);
    const locked = await call("POST", "/api/internal/bot-drafts/en/en-locked/publish", nashr, body(await stamp("en_articles", "en-locked")));
    expect(locked.status).toBe(409);
    expect(await locked.json()).toMatchObject({ code: "locked_by_editor" });
    const audit = await pool.query(`SELECT editor_name FROM en_article_revisions WHERE article_id = 'en-manual'`);
    expect(audit.rows[0].editor_name).toBe("nashr-sabq");
    const moved = await call("PATCH", "/api/internal/bot-drafts/en/en-ios/schedule", nashr, body(await stamp("en_articles", "en-ios"), { publishAt: "2031-06-02T09:00:00.000Z" }));
    expect(moved.status).toBe(200);
    const back = await call("DELETE", "/api/internal/bot-drafts/en/en-ios/schedule", nashr, body(await stamp("en_articles", "en-ios")));
    expect(back.status).toBe(200);
    const cleared = await pool.query(`SELECT status, seo_metadata->>'source' AS source FROM en_articles WHERE id = 'en-ios'`);
    expect(cleared.rows[0]).toEqual({ status: "draft", source: "ios-app" });
  });

  it("marks ready, reverts, archives a draft, resurfaces, and requests revision", async () => {
    await pool.query(`INSERT INTO articles (id, title, slug, content, status, author_id, source, article_type) VALUES ('fresh'::varchar, 'عنوان جديد للمسودة'::text, 'fresh'::text, '<p>متن تجريبي كافٍ للخبر المحلي</p>', 'draft', 'editor-1', 'manual', 'news')`);
    const ready = await call("POST", "/api/internal/bot-drafts/fresh/ready", nashr, body(await stamp("articles", "fresh")));
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({ status: "ready_to_publish" });
    const reverted = await call("POST", "/api/internal/bot-drafts/ready-draft/revert-to-draft", nashr, body(await stamp("articles", "ready-draft")));
    expect(reverted.status).toBe(200);
    expect(await reverted.json()).toMatchObject({ status: "draft" });
    const removed = await call("DELETE", "/api/internal/bot-drafts/fresh", nashr, body(await stamp("articles", "fresh")));
    expect(removed.status).toBe(200);
    expect(await removed.json()).toMatchObject({ status: "archived" });
    const kept = await pool.query(`SELECT source FROM articles WHERE id = 'fresh'`);
    expect(kept.rows[0].source).toBe("manual");
    const resurfaced = await call("POST", "/api/internal/bot-drafts/live-story/resurface", nashr, body(await stamp("articles", "live-story")));
    expect(resurfaced.status).toBe(200);
    const revision = await call("POST", "/api/internal/bot-drafts/live-story/request-revision", nashr, body(await stamp("articles", "live-story")));
    expect(revision.status).toBe(200);
    const story = await pool.query(`SELECT status, review_status, review_notes, resurfaced_at IS NOT NULL AS resurfaced FROM articles WHERE id = 'live-story'`);
    expect(story.rows[0]).toMatchObject({ status: "draft", review_status: "needs_changes", review_notes: "مراجعة نشر سبق", resurfaced: true });
    expect(state.notified).toBe(1);
    const bare = await call("POST", "/api/internal/bot-drafts/live-story/publish", nashr, {});
    expect(bare.status).toBe(422);
    expect(await bare.json()).toMatchObject({ code: "validation_error" });
  });

  it("stores a video field and refuses English video fields", async () => {
    const edited = await call("PATCH", "/api/internal/bot-drafts/locked-draft", nashr, { videoUrl: "https://cdn.example/video.mp4", isVideoTemplate: true, updateReason: "إضافة فيديو" });
    expect(edited.status).toBe(409);
    const open = await call("PATCH", "/api/internal/bot-drafts/ready-draft", nashr, { videoUrl: "https://cdn.example/video.mp4", isVideoTemplate: true, updateReason: "إضافة فيديو" });
    expect(open.status).toBe(200);
    const video = await pool.query(`SELECT video_url, is_video_template FROM articles WHERE id = 'ready-draft'`);
    expect(video.rows[0]).toMatchObject({ video_url: "https://cdn.example/video.mp4", is_video_template: true });
    const english = await call("PATCH", "/api/internal/bot-drafts/en/en-live/visibility", nashr, {});
    expect([400, 422]).toContain(english.status);
    const rejected = await call("PATCH", "/api/internal/bot-drafts/en/en-live", nashr, { videoUrl: "https://cdn.example/video.mp4", updateReason: "فيديو" });
    expect(rejected.status).toBe(422);
    expect(await rejected.json()).toMatchObject({ code: "forbidden_fields" });
  });

  it("translates a published Arabic article without calling a model when the service is the boundary", async () => {
    await pool.query(`UPDATE articles SET status = 'published', published_at = now() WHERE id = 'manual-draft'`);
    const response = await call("POST", "/api/internal/bot-drafts/manual-draft/translate-to-english", nashr, body(await stamp("articles", "manual-draft")));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ articleId: "manual-draft", englishArticleId: "en-made" });
    expect(state.translated).toBe(1);
    const english = await call("POST", "/api/internal/bot-drafts/en/en-manual/translate-to-english", nashr, body(await stamp("en_articles", "en-manual")));
    expect(english.status).toBe(422);
  });
});
