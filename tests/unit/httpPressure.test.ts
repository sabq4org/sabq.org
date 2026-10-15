import { createServer, get, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpPressureTracker } from "../../server/utils/httpPressure";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  })));
});

describe("HTTP pressure counters", () => {
  it("distinguishes persistent sports streams and releases successful and aborted readers once", async () => {
    const tracker = createHttpPressureTracker();
    const pending: ServerResponse[] = [];
    const server = createServer((req, res) => {
      if (req.url === "/health") return void res.end("ok");
      if (req.url?.startsWith("/api/sports/live-stream")) {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(": connected\n\n");
      } else {
        pending.push(res);
      }
    });
    servers.push(server);
    tracker.attach(server);
    tracker.attach(server); // Idempotent when bootstrap and app share a server.
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const stream = get(`${base}/api/sports/live-stream?test=1`, { agent: false });
    stream.on("error", () => {});
    await new Promise<void>((resolve) => stream.once("response", (res) => { res.resume(); resolve(); }));
    const readers = Array.from({ length: 40 }, () => new Promise<void>((resolve, reject) => {
      get(`${base}/article`, { agent: false }, (res) => { res.resume(); res.once("end", resolve); }).on("error", reject);
    }));
    await expect.poll(() => pending.length).toBe(40);
    expect(tracker.snapshot()).toMatchObject({ activeRequests: 41, activeSportsStreams: 1, inboundSockets: 41 });
    const health = await fetch(`${base}/health`);
    expect(await health.text()).toBe("ok");
    for (const res of pending) res.end("article");
    await Promise.all(readers);
    await expect.poll(() => tracker.snapshot().activeRequests).toBe(1);
    stream.destroy();
    await expect.poll(() => tracker.snapshot().activeRequests).toBe(0);
    expect(tracker.snapshot()).toMatchObject({ activeSportsStreams: 0, completedRequests: 41, abortedRequests: 1 });
    expect(tracker.snapshot().peakRequests).toBeGreaterThanOrEqual(41);
    expect(tracker.snapshot().peakSockets).toBeGreaterThanOrEqual(41);
  });
});
