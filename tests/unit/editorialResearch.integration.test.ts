import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ db: null as any, create: vi.fn(), find: vi.fn(), retrieve: vi.fn(), turns: vi.fn(), items: vi.fn(), cancel: vi.fn(), request: vi.fn(), edit: vi.fn() }));
vi.mock("../../server/db", () => ({ db: {
  transaction: (...args: any[]) => state.db.transaction(...args), select: (...args: any[]) => state.db.select(...args), update: (...args: any[]) => state.db.update(...args), insert: (...args: any[]) => state.db.insert(...args),
} }));
vi.mock("../../server/services/editorialResearchProvider", async original => ({ ...await original(), createResearchSession: state.create, findResearchSession: state.find, retrieveResearchSession: state.retrieve, listResearchTurns: state.turns, listResearchItems: state.items, cancelResearchSession: state.cancel, agentsRequest: state.request }));
vi.mock("../../server/services/editorialAiService", () => ({ runEditorialTask: state.edit }));
vi.mock("../../server/rbac", () => ({
  requireAuth: (req: any, res: any, next: any) => { if (!req.headers["x-user"]) return res.sendStatus(401); req.user = { id: req.headers["x-user"] }; next(); },
  requirePermission: (permission: string) => (req: any, res: any, next: any) => req.headers["x-permission"] === permission ? next() : res.sendStatus(403),
}));
import router from "../../server/routes/editorialResearch";
import { createResearchJob, getResearchJob, requestResearchCancellation, processResearchJobs } from "../../server/services/editorialResearchService";
import { ResearchError } from "../../server/services/editorialResearchProvider";
const url = process.env.EDITORIAL_RESEARCH_TEST_DATABASE_URL;
const local = url && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname);
const suite = local ? describe : describe.skip;
const schema = `test_research_${randomUUID().replaceAll("-", "")}`;
const input = () => ({ requestId: randomUUID(), topic: "تقرير تجريبي عن اللون الأحمر للمريخ في المصادر الرسمية" });
const usage = { input_tokens: 9000, output_tokens: 200, total_tokens: 9200 };
const bundle = { summary: "المصدر الرسمي يشرح أن أكاسيد الحديد سبب اللون الأحمر للمريخ.", sources: [{ title: "ناسا", url: "https://science.nasa.gov/mars/facts/", evidence: "تفسير لون سطح المريخ" }], openQuestions: ["لا يتناول البحث تفاصيل تركيب كل منطقة."] };
let pool: pg.Pool, admin: pg.Pool, base: string;
const app = express(); app.use(express.json()); app.use(router); const server = createServer(app);
const headers = { "x-user": "editor-a", "x-permission": "articles.ai_generate", "Content-Type": "application/json" };
const jobPath = "/api/editorial-research/jobs";
suite("editorial research — local PostgreSQL and authenticated HTTP", () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 10 });
    await pool.query("CREATE TABLE users (id varchar PRIMARY KEY); INSERT INTO users VALUES ('editor-a'), ('editor-b'), ('editor-c')");
    await pool.query(readFileSync("scripts/sql/add-editorial-research-jobs-2026-09-12.sql", "utf8"));
    state.db = drizzle(pool);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); vi.unstubAllEnvs(); });
  beforeEach(async () => {
    await pool.query("TRUNCATE editorial_research_jobs"); vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "synthetic-test-key"); vi.stubEnv("EDITORIAL_RESEARCH_ENABLED", "true"); vi.stubEnv("EDITORIAL_RESEARCH_WORKER_ENABLED", "true");
    state.create.mockResolvedValue({ id: "sess_test", status: "in_progress", usage: null });
    state.find.mockResolvedValue(null); state.retrieve.mockResolvedValue({ id: "sess_test", status: "idle", usage });
    state.turns.mockResolvedValue([{ id: "turn_test", status: "completed", subagent_id: null, usage }]);
    state.items.mockResolvedValue([
      { type: "message", role: "assistant", status: "completed", phase: "final_answer", turn_id: "turn_test", content: [{ type: "output_text", text: JSON.stringify(bundle) }] },
      { type: "web_search_call", status: "completed", turn_id: "turn_test", action: { type: "open_page", url: bundle.sources[0].url } },
    ]);
    state.edit.mockResolvedValue({ headline: "لماذا يبدو المريخ أحمر؟", body: '<p>أكاسيد الحديد.</p><img src=x onerror=alert(1)><script>alert(1)</script>', altHeadlines: [], editorNotes: ["راجع المصدر"], sources: bundle.sources, riskFlags: [], meta: { modelId: "test-editor", fallbackUsed: false } });
    state.cancel.mockResolvedValue(undefined); state.request.mockResolvedValue(null);
  });
  it("enforces auth, permission, strict input and private caching", async () => {
    expect((await fetch(base + jobPath)).status).toBe(401);
    expect((await fetch(base + jobPath, { headers: { "x-user": "editor-a" } })).status).toBe(403);
    const bad = await fetch(base + jobPath, { method: "POST", headers, body: JSON.stringify({ ...input(), model: "unapproved" }) });
    expect(bad.status).toBe(400); expect(bad.headers.get("cache-control")).toBe("private, no-store"); expect(state.create).not.toHaveBeenCalled();
  });
  it("admits one duplicate request once and enforces global and per-user concurrency", async () => {
    const data = input(); const results = await Promise.all([createResearchJob("editor-a", data), createResearchJob("editor-a", data)]);
    expect(results[0].id).toBe(results[1].id);
    expect((await pool.query("SELECT count(*) FROM editorial_research_jobs")).rows[0].count).toBe("1");
    await expect(createResearchJob("editor-a", input())).rejects.toMatchObject({ code: "active_job" });
    await createResearchJob("editor-b", input());
    await expect(createResearchJob("editor-c", input())).rejects.toMatchObject({ code: "capacity" });
    await expect(createResearchJob("editor-b", data)).rejects.toMatchObject({ code: "request_conflict" });
  });
  it("does not expose or cancel another editor's job", async () => {
    const job = await createResearchJob("editor-a", input());
    const other = { ...headers, "x-user": "editor-b" };
    expect((await fetch(base + jobPath + "/" + job.id, { headers: other })).status).toBe(404);
    expect((await fetch(base + jobPath + "/" + job.id + "/cancel", { method: "POST", headers: other })).status).toBe(404);
    expect(await (await fetch(base + jobPath, { headers: other })).json()).toEqual([]);
    expect((await getResearchJob("editor-a", job.id))?.status).toBe("queued");
  });
  it("limits paid attempts across a rolling day including failures", async () => {
    for (let n = 0; n < 5; n++) { const job = await createResearchJob("editor-a", input()); await pool.query("UPDATE editorial_research_jobs SET status='failed' WHERE id=$1", [job.id]); }
    await expect(createResearchJob("editor-a", input())).rejects.toMatchObject({ code: "daily_limit" });
  });
  it("completes research through the existing editor, sanitizes HTML and persists results", async () => {
    const job = await createResearchJob("editor-a", input());
    await processResearchJobs(); await processResearchJobs();
    const saved = await getResearchJob("editor-a", job.id);
    expect(saved?.status).toBe("completed"); expect(saved?.usage).toEqual(usage);
    expect(saved?.result?.body).toBe("<p>أكاسيد الحديد.</p>");
    expect(state.edit).toHaveBeenCalledWith(expect.objectContaining({ type: "report", verificationContext: JSON.stringify(bundle), userId: "editor-a" }));
    await processResearchJobs(); expect(state.request).toHaveBeenCalledWith("sessions/sess_test", "DELETE");
    expect((await getResearchJob("editor-a", job.id))?.result?.headline).toBe("لماذا يبدو المريخ أحمر؟");
  });
  it("does not interpret idle or unknown usage as success or zero", async () => {
    const job = await createResearchJob("editor-a", input()); await processResearchJobs();
    state.retrieve.mockResolvedValue({ status: "idle", usage: null }); state.turns.mockResolvedValue([]);
    await processResearchJobs(); const saved = await getResearchJob("editor-a", job.id);
    expect(saved?.status).toBe("researching"); expect(saved?.usage).toBeNull(); expect(state.edit).not.toHaveBeenCalled();
  });
  it("recovers an ambiguous create by metadata without a second paid POST", async () => {
    const job = await createResearchJob("editor-a", input());
    state.create.mockRejectedValueOnce(new ResearchError(503, "provider_unreachable", "اتصال غير محسوم"));
    await processResearchJobs(); expect((await getResearchJob("editor-a", job.id))?.status).toBe("starting");
    state.find.mockResolvedValueOnce({ id: "sess_recovered", usage: null }); await processResearchJobs();
    expect(state.find).toHaveBeenCalledWith(job.id, expect.any(Date)); expect(state.create).toHaveBeenCalledTimes(1);
    expect((await pool.query("SELECT session_id FROM editorial_research_jobs WHERE id=$1", [job.id])).rows[0].session_id).toBe("sess_recovered");
  });
  it("leases prevent duplicate worker execution across replicas", async () => {
    await createResearchJob("editor-a", input());
    state.create.mockImplementationOnce(async () => { await new Promise(r => setTimeout(r, 30)); return { id: "sess_test", usage: null }; });
    await Promise.all([processResearchJobs(), processResearchJobs()]); expect(state.create).toHaveBeenCalledTimes(1);
  });
  it("cancels queued work without a paid call and discards output cancelled during editing", async () => {
    const job = await createResearchJob("editor-a", input()); await requestResearchCancellation("editor-a", job.id); await processResearchJobs();
    expect((await getResearchJob("editor-a", job.id))?.status).toBe("cancelled"); expect(state.create).not.toHaveBeenCalled();
    const second = await createResearchJob("editor-a", input()); await processResearchJobs();
    state.edit.mockImplementationOnce(async () => { await requestResearchCancellation("editor-a", second.id); return { headline: "ملغى", body: "<p>ملغى</p>", sources: [], altHeadlines: [], editorNotes: [], riskFlags: [], meta: {} }; });
    await processResearchJobs(); await processResearchJobs();
    expect((await getResearchJob("editor-a", second.id))?.status).toBe("cancelled"); expect((await getResearchJob("editor-a", second.id))?.result).toBeNull();
  });
  it("requests cancellation at the deadline and waits for provider confirmation", async () => {
    const job = await createResearchJob("editor-a", input()); await processResearchJobs();
    await pool.query("UPDATE editorial_research_jobs SET created_at=now()-interval '6 minutes' WHERE id=$1", [job.id]);
    state.retrieve.mockResolvedValue({ status: "in_progress", usage: null }); state.turns.mockResolvedValue([{ status: "in_progress", subagent_id: null }]);
    await processResearchJobs(); expect(state.cancel).toHaveBeenCalled(); expect((await getResearchJob("editor-a", job.id))?.status).toBe("cancelling");
    state.turns.mockResolvedValue([{ status: "cancelled", subagent_id: null }]); await processResearchJobs();
    expect((await getResearchJob("editor-a", job.id))?.status).toBe("cancelled"); expect(state.edit).not.toHaveBeenCalled();
  });
  it("rejects an invented report source and leaves the completed research available", async () => {
    const job = await createResearchJob("editor-a", input()); await processResearchJobs();
    state.edit.mockResolvedValueOnce({ headline: "عنوان التقرير", body: "<p>متن التقرير</p>", sources: [{title:"مصدر مختلق",url:"https://example.com/invented"}], altHeadlines: [], editorNotes: [], riskFlags: [], meta: {} });
    await processResearchJobs(); const saved = await getResearchJob("editor-a", job.id);
    expect(saved?.status).toBe("failed"); expect(saved?.research).toEqual(bundle); expect(saved?.result).toBeNull();
  });
  it("expires crashed editing without a second formatter call and expires stale queued jobs before charging", async () => {
    const first = await createResearchJob("editor-a", input());
    await pool.query("UPDATE editorial_research_jobs SET status='editing',session_id='sess_test',updated_at=now()-interval '16 minutes' WHERE id=$1", [first.id]);
    await processResearchJobs(); expect((await getResearchJob("editor-a", first.id))?.status).toBe("failed"); expect(state.edit).not.toHaveBeenCalled();
    const second = await createResearchJob("editor-a", input());
    await pool.query("UPDATE editorial_research_jobs SET created_at=now()-interval '6 minutes' WHERE id=$1", [second.id]);
    await processResearchJobs(); expect((await getResearchJob("editor-a", second.id))?.status).toBe("failed"); expect(state.create).not.toHaveBeenCalled();
  });
  it("blocks new jobs when the worker or admission is disabled", async () => {
    vi.stubEnv("EDITORIAL_RESEARCH_WORKER_ENABLED", "false");
    await expect(createResearchJob("editor-a", input())).rejects.toMatchObject({code:"disabled"});
    expect(state.create).not.toHaveBeenCalled();
  });
  it("fails closed when sources were not opened", async () => {
    const job = await createResearchJob("editor-a", input()); await processResearchJobs();
    state.items.mockResolvedValueOnce([{ type: "message", role: "assistant", status: "completed", phase: "final_answer", turn_id: "turn_test", content: [{ type: "output_text", text: JSON.stringify(bundle) }] }]);
    await processResearchJobs(); expect((await getResearchJob("editor-a", job.id))?.status).toBe("failed"); expect(state.edit).not.toHaveBeenCalled();
  });
});
