import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { articles } from "../../shared/schema";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("../../server/db", () => ({ db: {
  select: (...args: any[]) => state.db.select(...args),
  // Execute the real storage UPDATE; project only the fixture's relevant columns.
  update: (table: any) => ({ set: (values: any) => ({ where: (condition: any) => ({
    returning: () => state.db.update(table).set(values).where(condition).returning({
      id: articles.id, imageUrl: articles.imageUrl, aiImageModel: articles.aiImageModel,
      aiImagePrompt: articles.aiImagePrompt, isAiGeneratedImage: articles.isAiGeneratedImage,
    }),
  }) }) }),
} }));
import { resolveArticleImageProvenance, resetChangedImageProvenance } from "../../server/services/articleImageProvenance";
import { DatabaseStorage } from "../../server/storage";

const url = process.env.EDITORIAL_IMAGES_TEST_DATABASE_URL;
const local = url && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname);
const suite = local ? describe : describe.skip;
const schema = `test_image_provenance_${randomUUID().replaceAll("-", "")}`;
const imageUrl = "https://media.sabq.org/news/current.webp";
let admin: pg.Pool;
let pool: pg.Pool;

suite("current image provenance — isolated PostgreSQL", () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
    state.db = drizzle(pool);
    await pool.query(`CREATE TABLE ai_image_generations (id varchar PRIMARY KEY, image_url text, model varchar, prompt text, metadata jsonb, status varchar);
      CREATE TABLE media_files (url text, is_ai_generated boolean, ai_generation_model text, ai_generation_prompt text);
      CREATE TABLE articles (id varchar PRIMARY KEY, image_url text, ai_image_model text, ai_image_prompt text,
        is_ai_generated_image boolean DEFAULT true, updated_at timestamp, seo_metadata jsonb);`);
  });
  afterAll(async () => {
    await pool?.end(); await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin?.end();
  });
  beforeEach(async () => { await pool.query("TRUNCATE ai_image_generations, media_files, articles"); });

  it.each(["gpt-image-2.5-flare", "gpt-image-2.5-sunburst", "gemini-3-pro-image-preview"])("storage replaces stale model when AI is already enabled: %s", async model => {
    await pool.query("INSERT INTO ai_image_generations VALUES ($1,$2,$3,$4,$5,'completed')", [randomUUID(), imageUrl, model, "original brief", JSON.stringify({ finalPrompt: "actual provider prompt" })]);
    const patch = { imageUrl, isAiGeneratedImage: true, aiImageModel: "previous-model", aiImagePrompt: "previous prompt" };
    await (new DatabaseStorage() as any).applyAiImageFlagFromMedia(patch);
    expect(patch).toEqual({ imageUrl, isAiGeneratedImage: true, aiImageModel: model, aiImagePrompt: "actual provider prompt" });
  });

  it("uses the recorded prompt when a legacy generation has no finalPrompt", async () => {
    await pool.query("INSERT INTO ai_image_generations VALUES ($1,$2,'gemini-3-pro-image-preview','legacy provider prompt',NULL,'completed')", [randomUUID(), imageUrl]);
    expect((await resolveArticleImageProvenance(imageUrl))?.aiImagePrompt).toBe("legacy provider prompt");
  });

  it.each(["processing", "failed"])("does not claim a %s generation belongs to the image", async status => {
    await pool.query("INSERT INTO ai_image_generations VALUES ($1,$2,'gpt-image-2.5-flare','brief',NULL,$3)", [randomUUID(), imageUrl, status]);
    expect(await resolveArticleImageProvenance(imageUrl)).toBeNull();
  });

  it("requires exact URL match and preserves unrelated caller fields", async () => {
    await pool.query("INSERT INTO ai_image_generations VALUES ($1,$2,'gpt-image-2.5-flare','brief',NULL,'completed')", [randomUUID(), `${imageUrl}?other=1`]);
    const patch = { imageUrl, title: "unchanged title", isAiGeneratedImage: false };
    await (new DatabaseStorage() as any).applyAiImageFlagFromMedia(patch);
    expect(patch).toEqual({ imageUrl, title: "unchanged title", isAiGeneratedImage: false });
  });

  it("uses legacy generated-media provenance even with an existing AI flag", async () => {
    await pool.query("INSERT INTO media_files VALUES ($1,true,'gemini-3-pro-image-preview','media prompt')", [imageUrl]);
    const patch = { imageUrl, isAiGeneratedImage: true, aiImageModel: "gpt-image-2.5-flare" };
    await (new DatabaseStorage() as any).applyAiImageFlagFromMedia(patch);
    expect(patch).toMatchObject({ aiImageModel: "gemini-3-pro-image-preview", aiImagePrompt: "media prompt" });
  });

  it("does not retain a previous model when the generated medium has unknown provenance", async () => {
    await pool.query("INSERT INTO media_files VALUES ($1,true,NULL,NULL)", [imageUrl]);
    expect(await resolveArticleImageProvenance(imageUrl)).toEqual({ isAiGeneratedImage: true, aiImageModel: null, aiImagePrompt: null });
  });

  it("atomically clears old attribution only when an unknown image URL changes", async () => {
    await pool.query("INSERT INTO articles (id,image_url,ai_image_model,ai_image_prompt) VALUES ('article-a',$1,'old-model','old-prompt')", [imageUrl]);
    const write = async (nextUrl: string) => (await state.db.update(articles).set({ imageUrl: nextUrl, ...resetChangedImageProvenance(nextUrl) }).where(eq(articles.id, "article-a")).returning({ model: articles.aiImageModel, prompt: articles.aiImagePrompt }))[0];
    expect(await write(imageUrl)).toEqual({ model: "old-model", prompt: "old-prompt" });
    expect(await write("https://media.sabq.org/news/uploaded.webp")).toEqual({ model: null, prompt: null });
  });

  it("persists model changes through the actual storage update and preserves unchanged image attribution", async () => {
    await pool.query("INSERT INTO articles (id,image_url,ai_image_model,ai_image_prompt) VALUES ('article-a','old.webp','gemini-3-pro-image-preview','old-prompt')");
    await pool.query("INSERT INTO ai_image_generations VALUES ($1,$2,'gpt-image-2.5-flare','new-prompt',NULL,'completed')", [randomUUID(), imageUrl]);
    const storage = new DatabaseStorage();
    expect(await storage.updateArticle("article-a", { imageUrl, isAiGeneratedImage: true })).toMatchObject({ aiImageModel: "gpt-image-2.5-flare", aiImagePrompt: "new-prompt" });
    // Unknown legacy source, same URL: a save must retain its existing attribution.
    await pool.query("TRUNCATE ai_image_generations");
    expect(await storage.updateArticle("article-a", { imageUrl })).toMatchObject({ aiImageModel: "gpt-image-2.5-flare", aiImagePrompt: "new-prompt" });
    expect(await storage.updateArticle("article-a", { imageUrl: "external-ai.webp", isAiGeneratedImage: true })).toMatchObject({ aiImageModel: null, aiImagePrompt: null });
    await pool.query("UPDATE articles SET ai_image_model='older-model', ai_image_prompt='older-prompt'");
    expect(await storage.updateArticle("article-a", { imageUrl: null })).toMatchObject({ aiImageModel: null, aiImagePrompt: null });
  });
});
