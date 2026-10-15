import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "http";
import { paginationOrReject, boundedLimit } from "../../server/utils/pagination";

// Real Express + real HTTP: the exact adapter the /api/v1 list routes call.
let server: Server; let base = ""; const warnings: string[] = [];
beforeAll(async () => {
  const app = express();
  app.get("/articles", (req, res) => {
    const pg = paginationOrReject({ query: req.query as Record<string, unknown>, path: req.path, ip: "test" }, res,
      { defaultLimit: 20, maxLimit: 50, allowPage: true }, (m) => warnings.push(m));
    if (!pg) return;
    res.json({ limit: boundedLimit(pg.limit), offset: pg.offset });
  });
  await new Promise<void>((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(() => server.close());

const get = async (qs: string) => { const r = await fetch(`${base}/articles?${qs}`); return { status: r.status, body: await r.json() }; };

describe("GET /articles pagination over HTTP", () => {
  it.each([
    ["limit=-1", 400, { field: "limit" }],
    ["limit=0", 200, { limit: 20 }],
    ["limit=1", 200, { limit: 1 }],
    ["limit=50", 200, { limit: 50 }],
    ["limit=51", 200, { limit: 50 }],
    ["limit=999999", 200, { limit: 50 }],
    ["limit=abc", 200, { limit: 20 }],
    ["limit=", 200, { limit: 20 }],
    ["", 200, { limit: 20, offset: 0 }],
    ["offset=-1", 400, { field: "offset" }],
    ["page=-1", 400, { field: "page" }],
    ["page=2&limit=10", 200, { limit: 10, offset: 10 }],
  ])("?%s → %i", async (qs, status, body) => {
    const r = await get(qs);
    expect(r.status).toBe(status);
    expect(r.body).toMatchObject(body);
  });
  it("rejections are logged for monitoring", () => {
    expect(warnings.some((w) => w.includes('rejected limit="-1"'))).toBe(true);
  });
});
