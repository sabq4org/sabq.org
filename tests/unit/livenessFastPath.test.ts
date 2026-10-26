import { afterEach, describe, expect, it } from "vitest";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { applyServerTimeouts, withLivenessFastPath } from "../../server/utils/livenessFastPath";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => { s.closeAllConnections(); s.close(() => r(null)); })));
});

function start(state: { ready: boolean; stopping: boolean }, hits: { express: number }) {
  const app = express();
  // middleware ثقيل/معلّق يحاكي طابور Express تحت الضغط — لا يجوز أن يمرّ به الفحص.
  app.use((_req, _res, next) => {
    hits.express += 1;
    setTimeout(next, 2_000);
  });
  app.get("/api/x", (_req, res) => res.json({ ok: true }));
  const server = createServer(withLivenessFastPath(app, {
    isReady: () => state.ready,
    isStopping: () => state.stopping,
  }));
  servers.push(server);
  return new Promise<number>((r) => server.listen(0, "127.0.0.1", () => r((server.address() as AddressInfo).port)));
}

function get(port: number, path: string, method = "GET") {
  return new Promise<{ status: number; body: string; ms: number }>((resolve, reject) => {
    const t0 = Date.now();
    const req = request({ host: "127.0.0.1", port, path, method }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body, ms: Date.now() - t0 }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("liveness fast path", () => {
  it("answers /healthz and /livez before any Express middleware", async () => {
    const hits = { express: 0 };
    const port = await start({ ready: true, stopping: false }, hits);
    const a = await get(port, "/healthz");
    const b = await get(port, "/livez?probe=render");
    expect(a).toMatchObject({ status: 200, body: "ok" });
    expect(b).toMatchObject({ status: 200, body: "ok" });
    expect(a.ms).toBeLessThan(500);
    expect(hits.express).toBe(0);
  });

  it("stays fast while Express requests are queued", async () => {
    const hits = { express: 0 };
    const port = await start({ ready: true, stopping: false }, hits);
    const slow = Array.from({ length: 20 }, () => get(port, "/api/x"));
    const live = await get(port, "/healthz");
    expect(live.status).toBe(200);
    expect(live.ms).toBeLessThan(500);
    const done = await Promise.all(slow);
    expect(done.every((r) => r.status === 200)).toBe(true);
  });

  it("supports HEAD with an empty body", async () => {
    const port = await start({ ready: true, stopping: false }, { express: 0 });
    expect(await get(port, "/healthz", "HEAD")).toMatchObject({ status: 200, body: "" });
  });

  it("reports 503 starting before boot readiness and 503 stopping during shutdown", async () => {
    const state = { ready: false, stopping: false };
    const port = await start(state, { express: 0 });
    expect(await get(port, "/healthz")).toMatchObject({ status: 503, body: "starting" });
    state.ready = true;
    state.stopping = true;
    expect(await get(port, "/healthz")).toMatchObject({ status: 503, body: "stopping" });
  });

  it("passes every other path and method through to Express", async () => {
    const hits = { express: 0 };
    const port = await start({ ready: true, stopping: false }, hits);
    const r = await get(port, "/healthz", "POST");
    expect(r.status).toBe(404);
    expect(hits.express).toBe(1);
  });
});

describe("applyServerTimeouts", () => {
  it("raises keepAliveTimeout above proxy idle and keeps headersTimeout above it", () => {
    const s = createServer();
    expect(applyServerTimeouts(s, {})).toEqual({ keepAliveTimeout: 65_000, headersTimeout: 66_000 });
    expect(s.keepAliveTimeout).toBe(65_000);
    expect(s.headersTimeout).toBe(66_000);
  });

  it("honours env overrides but never lets headersTimeout fall below keepAlive", () => {
    const s = createServer();
    expect(applyServerTimeouts(s, { HTTP_KEEP_ALIVE_TIMEOUT_MS: "30000", HTTP_HEADERS_TIMEOUT_MS: "10000" }))
      .toEqual({ keepAliveTimeout: 30_000, headersTimeout: 31_000 });
    expect(applyServerTimeouts(s, { HTTP_KEEP_ALIVE_TIMEOUT_MS: "junk" }).keepAliveTimeout).toBe(65_000);
  });
});
