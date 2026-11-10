// دورة النسخة الإنجليزية على PostgreSQL محلي: المسارات تكتب en_articles فعلاً.
// EN_BOT_DRAFTS_TEST_URL يجب أن يكون localhost. المخططات تبقى بعد التشغيل
// (نفس أسلوب بقية *.integration.test.ts) ولا يُحذف شيء.
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { articles, categories, enArticlePublishOperations, enArticles, enCategories, users } from "@shared/schema";
import { EN_AUTO_SETTLE_MS } from "@shared/enAutoTranslate";
import { SABQ_NEWSPAPER_ACCOUNT_ID } from "@shared/sabqNewspaper";

const state = vi.hoisted(() => ({ db: null as any }));

vi.mock("../../server/db", () => ({ get db() { return state.db; } }));
vi.mock("../../server/rbac", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../server/memoryCache", () => ({ memoryCache: { invalidatePattern: vi.fn() }, CACHE_TTL: {} }));
vi.mock("../../server/indexNow", () => ({ notifySearchEngines: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../server/services/sitemapCacheService", () => ({ invalidateSitemapXmlCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../server/services/cloudflarePurge", () => ({
  purgeUrls: vi.fn().mockResolvedValue({ ok: true }),
  purgeArticle: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("../../server/services/newsImageStorageService", async (original) => {
  const actual = await original<typeof import("../../server/services/newsImageStorageService")>();
  return {
    ...actual,
    newsImageStorageService: {
      ...actual.newsImageStorageService,
      isR2Configured: () => true,
      upload: vi.fn().mockResolvedValue({
        success: true,
        deliveryUrl: "https://media.sabq.org/news/2026/11/en-proof/w1600.webp",
        imageId: "img-proof",
        filename: "cover.jpg",
        provider: "r2",
        width: 1200,
        height: 675,
      }),
    },
  };
});
vi.mock("../../server/ai/editorGatewayText", () => ({
  completeEditorText: vi.fn().mockResolvedValue({
    content: "The Saudi cabinet approved a national decision, and the English edition summarizes it for readers.",
    truncated: false,
    provider: "test",
    modelId: "test",
  }),
}));
vi.mock("../../server/seo-generator", () => ({
  generateSeoMetadata: vi.fn().mockResolvedValue({
    content: {
      metaTitle: "Saudi cabinet decision",
      metaDescription: "The English edition of Sabq reports the Saudi cabinet decision for international readers.",
      keywords: ["Saudi", "cabinet", "decision"],
    },
    provider: "openai",
    model: "test",
  }),
}));

import enRouter from "../../server/routes/enBotDrafts";
import arabicRouter from "../../server/routes/botDrafts";
import { loadEnAutoTranslateCandidates } from "../../server/services/enAutoTranslateService";
import { publishDueScheduledEnBotArticles } from "../../server/services/enBotDraftsService";
import sharp from "sharp";

const url = process.env.EN_BOT_DRAFTS_TEST_URL;
if (url && !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
  throw new Error("Local database only");
}

const dialect = new PgDialect();
const TOKEN = "en-bot-proof-token-0123456789abcdef-XYZ";

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

describe.skipIf(!url)("English bot drafts against PostgreSQL", () => {
  let pool: Pool;
  let base = "";
  const server = createServer();

  beforeAll(async () => {
    const schema = `en_bot_drafts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const admin = new Pool({ connectionString: url, max: 1 });
    try {
      await admin.query(`CREATE SCHEMA ${schema}`);
    } finally {
      await admin.end();
    }
    pool = new Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 4 });
    for (const table of [users, categories, articles, enCategories, enArticles, enArticlePublishOperations]) {
      await pool.query(ddlFor(table));
    }
    await pool.query(`CREATE UNIQUE INDEX uq_en_article_publish_operations_actor_article_operation
      ON en_article_publish_operations (actor_key, article_id, operation_id)`);
    state.db = drizzle(pool);
    process.env.BOT_DRAFTS_API_TOKENS = `nashr-sabq:${TOKEN}`;
    process.env.BOT_DRAFTS_AUTHOR_USER_ID = SABQ_NEWSPAPER_ACCOUNT_ID;
    process.env.BOT_DRAFTS_WRITE_RATE_LIMIT = "1000";
    process.env.BOT_DRAFTS_EXTRAS_RATE_LIMIT = "1000";
    process.env.PUBLIC_SITE_URL = "https://sabq.org";

    await pool.query(
      `INSERT INTO users (id, email, status, first_name) VALUES ($1, 'newspaper@test.local', 'active', 'سبق')`,
      [SABQ_NEWSPAPER_ACCOUNT_ID],
    );
    await pool.query(`INSERT INTO en_categories (id, name, slug, status, type, display_order) VALUES
      ('cat-saudi', 'Saudi', 'saudi', 'active', 'core', 0),
      ('cat-sports', 'Sports', 'sports', 'active', 'core', 1),
      ('cat-tourism', 'Tourism', 'tourism', 'active', 'core', 2),
      ('cat-business', 'Business', 'business', 'active', 'core', 3),
      ('cat-world', 'World', 'world', 'active', 'core', 4),
      ('cat-smart', 'Smart', 'smart-hidden', 'active', 'smart', 9)`);
    await pool.query(`INSERT INTO articles (id, title, slug, english_slug, content, status, article_type, author_id, published_at)
      VALUES ('ar-source', 'خبر عربي أصلي', 'ar-source', 'srcslug', '<p>arabic</p>', 'published', 'news', $1, now() - interval '30 minutes')`,
      [SABQ_NEWSPAPER_ACCOUNT_ID]);
    await pool.query(`INSERT INTO articles (id, title, slug, content, status, article_type, author_id, published_at)
      VALUES ('ar-open', 'خبر بلا ترجمة', 'ar-open', '<p>open</p>', 'published', 'news', $1, now() - interval '30 minutes')`,
      [SABQ_NEWSPAPER_ACCOUNT_ID]);

    const app = express();
    app.use(express.json());
    app.use(enRouter);
    app.use(arabicRouter);
    server.on("request", app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (pool) await pool.end();
  });

  function call(method: string, path: string, body?: unknown) {
    return fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  const body = "<p>The Saudi cabinet approved a national decision that the English edition of Sabq reports for readers outside the Arabic homepage.</p>";

  it("runs the English lifecycle on en_articles and leaves the Arabic bot path unchanged", async () => {
    const arabicReject = await call("POST", "/api/internal/bot-drafts", {
      title: "عنوان عربي للرفض",
      content: "<p>متن عربي أطول من الحد الأدنى حتى يصل الرفض من التحقق لا من القاعدة.</p>",
      sourceArticleId: "ar-source",
    });
    expect(arabicReject.status).toBe(400);

    const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer();
    const form = new FormData();
    form.set("file", new Blob([jpeg], { type: "image/jpeg" }), "cover.jpg");
    const uploaded = await fetch(`${base}/api/internal/bot-drafts/en/images`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: form,
    });
    expect(uploaded.status).toBe(201);
    const image = await uploaded.json() as { deliveryUrl: string };
    expect(image.deliveryUrl).toMatch(/^https:\/\/media\.sabq\.org\//);

    const badCategory = await call("POST", "/api/internal/bot-drafts/en", {
      title: "Wrong section",
      content: body,
      categorySlug: "local",
    });
    expect(badCategory.status).toBe(422);
    const badBody = await badCategory.json() as { code: string; details?: { validSlugs?: string[] } };
    expect(badBody.code).toBe("category_not_found");
    expect(badBody.details?.validSlugs).toEqual(expect.arrayContaining(["saudi", "sports", "tourism", "business", "world"]));
    expect(badBody.details?.validSlugs).not.toContain("smart-hidden");

    const created = await call("POST", "/api/internal/bot-drafts/en", {
      title: "Saudi cabinet approves a national decision",
      content: body,
      categorySlug: "saudi",
      sourceArticleId: "ar-source",
      imageUrl: image.deliveryUrl,
      clientReference: "proof-en-1",
    });
    expect(created.status).toBe(201);
    const draft = await created.json() as { id: string; status: string; sourceArticleId: string; publicUrl: string | null; slug: string };
    expect(draft.status).toBe("draft");
    expect(draft.sourceArticleId).toBe("ar-source");
    expect(draft.slug).toBe("srcslug");

    const duplicate = await call("POST", "/api/internal/bot-drafts/en", {
      title: "Second English take",
      content: body,
      sourceArticleId: "ar-source",
    });
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json() as { code: string }).code).toBe("source_article_already_linked");

    const patched = await call("PATCH", `/api/internal/bot-drafts/en/${draft.id}`, { subtitle: "Riyadh" });
    expect(patched.status).toBe(200);

    const extras = await call("POST", `/api/internal/bot-drafts/en/${draft.id}/regenerate-extras`, { fields: ["summary", "seo"] });
    expect(extras.status).toBe(200);
    const extrasBody = await extras.json() as { draft: { excerpt: string | null; seoTitle: string | null } };
    expect(extrasBody.draft.excerpt).toMatch(/cabinet/i);
    expect(extrasBody.draft.seoTitle).toBe("Saudi cabinet decision");

    expect((await call("PATCH", `/api/internal/bot-drafts/en/${draft.id}/ready`, {})).status).toBe(200);
    const operationId = "22222222-2222-4222-8222-222222222222";
    const published = await call("POST", `/api/internal/bot-drafts/en/${draft.id}/publish`, { operationId });
    expect(published.status).toBe(200);
    const publishedBody = await published.json() as { status: string; response: { publicUrl: string; status: string } };
    expect(publishedBody.status).toBe("succeeded");
    expect(publishedBody.response.publicUrl).toBe("https://sabq.org/en/article/srcslug");
    const again = await call("POST", `/api/internal/bot-drafts/en/${draft.id}/publish`, { operationId });
    expect(again.status).toBe(200);
    expect((await again.json() as { status: string }).status).toBe("succeeded");
    expect((await call("GET", `/api/internal/bot-drafts/en/${draft.id}/operations/${operationId}`)).status).toBe(200);

    const lookup = await call("GET", "/api/internal/bot-drafts/en/by-public-id/srcslug");
    expect(lookup.status).toBe(200);
    expect((await lookup.json() as { id: string }).id).toBe(draft.id);

    const read = await call("GET", `/api/internal/bot-drafts/en/${draft.id}?includeContent=1`);
    expect(read.status).toBe(200);
    expect((await read.json() as { content?: string }).content).toContain("Saudi cabinet");

    expect((await call("PATCH", `/api/internal/bot-drafts/en/${draft.id}/visibility`, { newsType: "breaking", isFeatured: true })).status).toBe(200);
    const edited = await call("PATCH", `/api/internal/bot-drafts/en/${draft.id}`, { title: "Saudi cabinet approves the decision" });
    expect(edited.status).toBe(200);
    expect((await edited.json() as { slug: string; status: string }).slug).toBe("srcslug");

    expect((await call("POST", `/api/internal/bot-drafts/en/${draft.id}/archive`, { reason: "proof archive" })).status).toBe(200);
    expect((await call("POST", `/api/internal/bot-drafts/en/${draft.id}/restore`, {})).status).toBe(200);

    const scheduled = await call("POST", "/api/internal/bot-drafts/en", {
      title: "Tourism season opens",
      content: body,
      categorySlug: "tourism",
    });
    const scheduledDraft = await scheduled.json() as { id: string };
    expect((await call("POST", `/api/internal/bot-drafts/en/${scheduledDraft.id}/schedule`, { publishAt: "2026-12-20T18:30:00+03:00" })).status).toBe(200);
    expect((await call("PATCH", `/api/internal/bot-drafts/en/${scheduledDraft.id}/schedule`, { publishAt: "2026-12-21T18:30:00+03:00" })).status).toBe(200);
    expect((await call("DELETE", `/api/internal/bot-drafts/en/${scheduledDraft.id}/schedule`, {})).status).toBe(200);

    const due = await call("POST", "/api/internal/bot-drafts/en", {
      title: "World desk note",
      content: body,
      categorySlug: "world",
    });
    const dueDraft = await due.json() as { id: string };
    expect((await call("POST", `/api/internal/bot-drafts/en/${dueDraft.id}/schedule`, { publishAt: "2026-12-22T09:00:00+03:00" })).status).toBe(200);
    const released = await publishDueScheduledEnBotArticles(new Date("2026-12-22T10:00:00Z"));
    expect(released).toBe(1);

    const stored = await pool.query<{
      id: string;
      status: string;
      source: string | null;
      source_article_id: string | null;
      english_slug: string | null;
      author_id: string;
      reporter_id: string;
    }>(`SELECT id, status,
             seo_metadata->>'source' AS source,
             seo_metadata->>'sourceArticleId' AS source_article_id,
             english_slug, author_id, reporter_id
        FROM en_articles
        WHERE id = $1`, [draft.id]);
    const dueRow = await pool.query<{ status: string; source: string | null }>(
      `SELECT status, seo_metadata->>'source' AS source FROM en_articles WHERE id = $1`,
      [dueDraft.id],
    );
    const receipt = await pool.query<{ status: string }>(
      `SELECT status FROM en_article_publish_operations WHERE article_id = $1 AND operation_id = $2`,
      [draft.id, operationId],
    );
    const arabicCount = await pool.query<{ count: string }>(`SELECT count(*) FROM articles WHERE source = 'bot'`);
    const proof = {
      linked: stored.rows[0],
      scheduledRelease: dueRow.rows[0],
      receipt: receipt.rows[0],
      arabicBotRows: Number(arabicCount.rows[0].count),
    };
    console.log("[en-bot-drafts proof]", JSON.stringify(proof));
    expect(proof.linked).toMatchObject({
      status: "draft",
      source: "bot",
      source_article_id: "ar-source",
      english_slug: "srcslug",
      author_id: SABQ_NEWSPAPER_ACCOUNT_ID,
      reporter_id: SABQ_NEWSPAPER_ACCOUNT_ID,
    });
    expect(proof.scheduledRelease).toEqual({ status: "published", source: "bot" });
    expect(proof.receipt.status).toBe("succeeded");
    expect(proof.arabicBotRows).toBe(0);

    const candidates = await loadEnAutoTranslateCandidates(new Date());
    const ids = candidates.map((row) => row.id);
    expect(ids).not.toContain("ar-source");
    expect(ids).toContain("ar-open");
    expect(EN_AUTO_SETTLE_MS).toBeGreaterThan(0);
  });
});
