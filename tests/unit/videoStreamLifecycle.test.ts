import { createServer, request as httpRequest, type IncomingMessage, type Server } from "node:http";
import express, { type Response as ExpressResponse } from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ resolveXVideo: vi.fn() }));
vi.mock("../../server/services/sahraaTvVideoResolver", () => ({
  resolveXVideoFromPostUrl: (...args: unknown[]) => state.resolveXVideo(...args),
}));
vi.mock("../../server/rbac", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
import router from "../../server/routes/videoResolver";

let server: Server;
let baseUrl = "";
let upstreamFetch: ReturnType<typeof vi.fn>;
let tweetCounter = 0;
let responses: ExpressResponse[] = [];
const upstreamUrl = "https://video.example.invalid/video.mp4";
const videoPath = () => `/api/video/stream/${2088211617947189300n + BigInt(++tweetCounter)}`;

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_500;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for condition");
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}
function openRequest(path: string, headers: Record<string, string> = {}) {
  const request = httpRequest(new URL(path, baseUrl), { headers, agent: false });
  request.on("error", () => undefined);
  request.end();
  return request;
}
function responseBody(response: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    response.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    response.on("end", () => resolve(Buffer.concat(chunks).toString()));
    response.on("error", reject);
  });
}
function getResponse(path: string, headers: Record<string, string> = {}) {
  return new Promise<{ response: IncomingMessage; body: string }>((resolve, reject) => {
    const request = openRequest(path, headers);
    request.on("error", reject);
    request.on("response", (response) => {
      void responseBody(response).then(body => resolve({ response, body }), reject);
    });
  });
}

beforeAll(async () => {
  const app = express();
  app.use((_req, res, next) => { responses.push(res); next(); });
  app.use(router);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
beforeEach(() => {
  responses = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  upstreamFetch = vi.fn();
  vi.stubGlobal("fetch", upstreamFetch);
  state.resolveXVideo.mockReset().mockResolvedValue({ videoUrl: upstreamUrl, posterUrl: "" });
});
afterEach(() => {
  server.closeAllConnections();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

describe("video stream lifecycle", () => {
  it("does not fetch after the client disconnects during URL resolution", async () => {
    let release!: (value: { videoUrl: string; posterUrl: string }) => void;
    state.resolveXVideo.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const request = openRequest(videoPath());
    await waitFor(() => state.resolveXVideo.mock.calls.length === 1);
    request.destroy();
    await waitFor(() => responses[0].destroyed);
    release({ videoUrl: upstreamUrl, posterUrl: "" });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("aborts a pending upstream fetch when the client disconnects", async () => {
    let signal: AbortSignal | undefined;
    upstreamFetch.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      signal = init.signal!;
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const request = openRequest(videoPath());
    await waitFor(() => !!signal);
    request.destroy();
    await waitFor(() => signal!.aborted);
    await new Promise<void>(resolve => setImmediate(resolve));
  });

  it("cancels a response body delivered after the downstream has already closed", async () => {
    let release!: (response: Response) => void;
    let canceled = false;
    upstreamFetch.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const request = openRequest(videoPath());
    await waitFor(() => upstreamFetch.mock.calls.length === 1);
    request.destroy();
    await waitFor(() => responses[0].destroyed);
    release(new Response(new ReadableStream({ cancel() { canceled = true; } })));
    await waitFor(() => canceled);
  });

  it.each([false, true])("cancels mid-stream even when body cancellation rejects: %s", async (rejectCancel) => {
    let canceled = false;
    let signal: AbortSignal | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode("first chunk")); },
      cancel() {
        canceled = true;
        if (rejectCancel) return Promise.reject(new DOMException("Canceled", "AbortError"));
      },
    });
    upstreamFetch.mockImplementation(async (_url: string, init: RequestInit) => {
      signal = init.signal!;
      return new Response(body, { headers: { "content-type": "video/mp4" } });
    });
    const request = openRequest(videoPath());
    request.on("response", response => {
      response.once("data", () => request.destroy());
      response.on("error", () => undefined);
    });
    await waitFor(() => canceled && signal?.aborted === true);
  });

  it.each([200, 206])("preserves status %i, media bytes and range headers", async status => {
    upstreamFetch.mockResolvedValue(new Response("part", {
      status,
      headers: { "content-type": "video/mp4", "content-length": "4", "content-range": "bytes 0-3/8", "accept-ranges": "bytes" },
    }));
    const { response, body } = await getResponse(videoPath(), { range: "bytes=0-3" });
    expect(response.statusCode).toBe(status);
    expect(response.headers["content-range"]).toBe("bytes 0-3/8");
    expect(response.headers["accept-ranges"]).toBe("bytes");
    expect(response.headers["content-length"]).toBe("4");
    expect(body).toBe("part");
    expect(upstreamFetch.mock.calls[0][1].headers.Range).toBe("bytes=0-3");
  });

  it("cancels non-OK upstream bodies and returns 502", async () => {
    let canceled = false;
    upstreamFetch.mockResolvedValue(new Response(new ReadableStream({ cancel() { canceled = true; } }), { status: 503 }));
    const { response } = await getResponse(videoPath());
    expect(response.statusCode).toBe(502);
    expect(canceled).toBe(true);
    expect(console.error).toHaveBeenCalledWith("[VideoResolver] upstream media error", expect.objectContaining({ status: 503 }));
  });

});
