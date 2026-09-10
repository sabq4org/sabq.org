import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as any, generate: vi.fn(), upload: vi.fn() }));
vi.mock("../../server/db", () => ({ db: {
  transaction: (...args: any[]) => state.db.transaction(...args),
  select: (...args: any[]) => state.db.select(...args),
  update: (...args: any[]) => state.db.update(...args),
  insert: (...args: any[]) => state.db.insert(...args),
  delete: (...args: any[]) => state.db.delete(...args),
} }));
vi.mock("../../server/services/openaiImagesProvider", async (original) => ({ ...await original(), generateOpenAIEditorialImage: state.generate }));
vi.mock("../../server/services/newsImageStorageService", () => ({ newsImageStorageService: { upload: state.upload } }));
vi.mock("../../server/services/nanoBananaService", () => ({ generateAndUploadImage: vi.fn() }));
vi.mock("../../server/services/imageStyleService", () => ({ getImageStyleSettings: vi.fn(), resolveGenerationStyle: vi.fn() }));
vi.mock("../../server/rbac", () => ({
  requireAuth: (req: any, res: any, next: any) => { if (!req.headers["x-user"]) return res.sendStatus(401); req.user = { id: req.headers["x-user"] }; next(); },
  requirePermission: (permission: string) => (req: any, res: any, next: any) => req.headers["x-permission"] === permission ? next() : res.sendStatus(403),
  requireAnyPermission: (...permissions: string[]) => (req: any, res: any, next: any) => permissions.includes(req.headers["x-permission"]) ? next() : res.sendStatus(403),
}));
import router from "../../server/routes/editorialImages";
import legacyRouter from "../../server/routes/nanoBananaRoutes";
import { createEditorialImageJob, getEditorialImageJob, runEditorialImageJob } from "../../server/services/editorialImagesService";
import { EditorialImageError } from "../../server/services/openaiImagesProvider";
import type { EditorialImageRequest } from "../../shared/editorialImages";

const url = process.env.EDITORIAL_IMAGES_TEST_DATABASE_URL;
const local = url && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname);
const suite = local ? describe : describe.skip;
const schema = `test_gpt_images_${randomUUID().replaceAll("-", "")}`;
const headers = { "x-user": "editor-a", "x-permission": "articles.generate_images", "Content-Type": "application/json" };
const input = (): EditorialImageRequest => ({ requestId: randomUUID(), prompt: "رسم توضيحي لخبر اقتصادي", model: "gpt-image-2.5-flare", size: "1536x864", quality: "medium" });
let pool: pg.Pool;
let admin: pg.Pool;
let base: string;
const app = express(); app.use(express.json()); app.use(router); app.use("/api/nano-banana", legacyRouter);
const server = createServer(app);

suite("editor image jobs — isolated local PostgreSQL and HTTP", () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 5 });
    await pool.query(`CREATE TABLE ai_image_generations (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(), user_id varchar NOT NULL, article_id varchar,
      prompt text NOT NULL, negative_prompt text, model varchar NOT NULL, aspect_ratio varchar, image_size varchar,
      num_images integer, status varchar NOT NULL, image_url text, thumbnail_url text, media_file_id varchar,
      reference_images jsonb, enable_search_grounding boolean, enable_thinking boolean, branding_config jsonb,
      generation_time integer, cost real, metadata jsonb, error_message text, retry_count integer DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
    )`);
    state.db = drizzle(pool);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await pool?.end(); await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin?.end(); vi.unstubAllEnvs();
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE ai_image_generations");
    vi.resetAllMocks(); vi.stubEnv("OPENAI_IMAGES_API_KEY", "dedicated-secret-test");
    state.generate.mockResolvedValue({ buffer: Buffer.from("fixture"), prompt: "final prompt", usage: { input_tokens: 20 }, requestId: "req-real" });
    state.upload.mockResolvedValue({ success: true, deliveryUrl: "https://media.sabq.org/test.webp", thumbnailUrl: "https://media.sabq.org/thumb.webp" });
  });
  it("enforces auth/permission for capabilities, POST and polling", async () => {
    for (const [method, path] of [["GET", "/capabilities"], ["POST", "/generations"], ["GET", `/generations/${randomUUID()}`]]) {
      expect((await fetch(`${base}/api/editorial-images${path}`, { method })).status).toBe(401);
      expect((await fetch(`${base}/api/editorial-images${path}`, { method, headers: { "x-user": "reader" } })).status).toBe(403);
    }
    expect(state.generate).not.toHaveBeenCalled();
  });
  it("does not leak the dedicated key or cache capabilities; rejects provider injection", async () => {
    const response = await fetch(`${base}/api/editorial-images/capabilities`, { headers });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ configured: true });
    const bad = await fetch(`${base}/api/editorial-images/generations`, { method: "POST", headers, body: JSON.stringify({ ...input(), apiKey: "override" }) });
    expect(bad.status).toBe(400); expect(state.generate).not.toHaveBeenCalled();
  });
  it("creates exactly one job for concurrent requests with the same ID", async () => {
    const request = input();
    const results = await Promise.all([createEditorialImageJob("editor-a", request), createEditorialImageJob("editor-a", request)]);
    expect(results.filter(result => result.created)).toHaveLength(1);
    expect((await pool.query("SELECT count(*) FROM ai_image_generations")).rows[0].count).toBe("1");
    await expect(createEditorialImageJob("editor-a", { ...request, prompt: "محتوى مختلف لهذا الطلب" })).rejects.toMatchObject({ code: "request_conflict" });
  });
  it("allows only one active job per user, without blocking another user", async () => {
    const results = await Promise.allSettled([createEditorialImageJob("editor-a", input()), createEditorialImageJob("editor-a", input())]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect((await createEditorialImageJob("editor-b", input())).created).toBe(true);
  });
  it("returns 202 before generation completes, polls only for owner, and uses deliveryUrl", async () => {
    let finish!: (value: unknown) => void;
    state.generate.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const request = input();
    const response = await fetch(`${base}/api/editorial-images/generations`, { method: "POST", headers, body: JSON.stringify(request) });
    expect(response.status).toBe(202); expect((await response.json()).status).toBe("processing");
    const duplicate = await fetch(`${base}/api/editorial-images/generations`, { method: "POST", headers, body: JSON.stringify(request) });
    expect(duplicate.status).toBe(202); expect(state.generate).toHaveBeenCalledTimes(1);
    expect((await fetch(`${base}/api/editorial-images/generations/${request.requestId}`, { headers: { ...headers, "x-user": "editor-b" } })).status).toBe(404);
    finish({ buffer: Buffer.from("fixture"), prompt: "final prompt", usage: { input_tokens: 20 }, requestId: "req-real" });
    await vi.waitFor(async () => expect((await getEditorialImageJob("editor-a", request.requestId))?.status).toBe("completed"));
    expect(await getEditorialImageJob("editor-a", request.requestId)).toMatchObject({ imageUrl: "https://media.sabq.org/test.webp", error: null });
  });
  it("persists safe provider/storage failures and never marks a missing delivery URL completed", async () => {
    const one = input(); await createEditorialImageJob("editor-a", one);
    state.generate.mockRejectedValueOnce(new EditorialImageError(503, "access_denied", "خدمة الصور غير متاحة"));
    await runEditorialImageJob("editor-a", one);
    expect(await getEditorialImageJob("editor-a", one.requestId)).toMatchObject({ status: "failed", imageUrl: null, error: "خدمة الصور غير متاحة" });
    const two = input(); await createEditorialImageJob("editor-a", two);
    state.upload.mockResolvedValueOnce({ success: true });
    await runEditorialImageJob("editor-a", two);
    expect(await getEditorialImageJob("editor-a", two.requestId)).toMatchObject({ status: "failed", imageUrl: null });
  });
  it("expires interrupted work and ignores late completion after expiry", async () => {
    const request = input(); await createEditorialImageJob("editor-a", request);
    await pool.query("UPDATE ai_image_generations SET created_at = now() - interval '5 minutes' WHERE id=$1", [request.requestId]);
    expect((await getEditorialImageJob("editor-a", request.requestId))?.status).toBe("failed");
    expect((await createEditorialImageJob("editor-a", input())).created).toBe(true);
    await runEditorialImageJob("editor-a", request);
    expect((await getEditorialImageJob("editor-a", request.requestId))?.status).toBe("failed");
  });
  it("keeps GPT jobs out of legacy history, stats, detail, deletion and library save", async () => {
    const request = input(); await createEditorialImageJob("editor-a", request);
    await pool.query("INSERT INTO ai_image_generations (id,user_id,prompt,model,status) VALUES ($1,'editor-a','old','gemini-3-pro-image-preview','completed')", [randomUUID()]);
    const legacy = `${base}/api/nano-banana`;
    const list = await (await fetch(`${legacy}/generations`, { headers })).json();
    expect(list.generations).toHaveLength(1); expect(list.generations[0].model).toBe("gemini-3-pro-image-preview");
    expect((await (await fetch(`${legacy}/stats`, { headers })).json()).total).toBe(1);
    for (const [method, suffix] of [["GET", ""], ["DELETE", ""], ["POST", "/save-to-library"]]) {
      expect((await fetch(`${legacy}/generations/${request.requestId}${suffix}`, { method, headers })).status).toBe(404);
    }
    expect((await getEditorialImageJob("editor-a", request.requestId))?.status).toBe("processing");
  });
});
