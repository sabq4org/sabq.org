import express from "express";
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type Server,
} from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveTweetVideo: vi.fn(async () => ({
    videoUrl: "https://video.twimg.com/ext_tw_video/test.mp4?token=secret",
    posterUrl: "https://pbs.twimg.com/test.jpg",
  })),
}));

vi.mock("../../server/services/sahraaTvVideoResolver", () => ({
  resolveXVideoFromPostUrl: mocks.resolveTweetVideo,
}));
vi.mock("../../server/rbac", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import router, {
  fetchUpstreamVideo,
  isExpectedUpstreamStreamEnd,
  pipeVideoToResponse,
} from "../../server/routes/videoResolver";

type HttpResult = {
  status?: number;
  body: string;
  aborted: boolean;
  headers: IncomingHttpHeaders;
};

function qDisconnect(): TypeError {
  return Object.assign(new TypeError("terminated"), {
    cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }),
  });
}

function get(origin: URL, path: string): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    let body = "";
    let status: number | undefined;
    let headers: IncomingHttpHeaders = {};
    let settled = false;
    const finish = (aborted: boolean) => {
      if (settled) return;
      settled = true;
      resolve({ status, body, aborted, headers });
    };
    const req = httpRequest(new URL(path, origin), (res) => {
      status = res.statusCode;
      headers = res.headers;
      res.setEncoding("utf8");
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => finish(false));
      res.on("aborted", () => finish(true));
      res.on("error", () => finish(true));
    });
    req.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ECONNRESET") finish(true);
      else reject(error);
    });
    req.end();
  });
}

describe("video stream proxy failures", () => {
  let server: Server;
  let origin: URL;
  const observedErrors: unknown[] = [];

  beforeAll(async () => {
    const app = express();
    app.use(router);
    app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      observedErrors.push(error);
      if (!res.headersSent) res.status(500).end();
    });
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not start");
    origin = new URL(`http://127.0.0.1:${address.port}`);
  });

  afterEach(() => {
    observedErrors.length = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  it("matches only the exact undici upstream socket termination", () => {
    expect(isExpectedUpstreamStreamEnd(qDisconnect())).toBe(true);
    expect(isExpectedUpstreamStreamEnd(new TypeError("terminated"))).toBe(false);
    expect(isExpectedUpstreamStreamEnd(new TypeError("x is not a function"))).toBe(false);
    expect(isExpectedUpstreamStreamEnd(Object.assign(new Error("terminated"), {
      code: "ETIMEDOUT",
    }))).toBe(false);
  });

  it("clears the header deadline after fetch resolves instead of aborting a long body", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const response = new Response(new ReadableStream({ start() {} }), { status: 200 });
      const fetchImpl = vi.fn(async () => response) as unknown as typeof fetch;

      await expect(fetchUpstreamVideo("https://example.invalid/video", {}, controller, fetchImpl))
        .resolves.toBe(response);
      await vi.advanceTimersByTimeAsync(30_001);

      expect(controller.signal.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not start an upstream fetch when the client closes during URL resolution", async () => {
    let releaseResolver: (() => void) | undefined;
    mocks.resolveTweetVideo.mockImplementationOnce(() => new Promise(resolve => {
      releaseResolver = () => resolve({
        videoUrl: "https://video.twimg.com/ext_tw_video/delayed.mp4?token=secret",
        posterUrl: "https://pbs.twimg.com/delayed.jpg",
      });
    }));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const req = httpRequest(new URL("/api/video/stream/2111196763344244824", origin));
    req.on("error", () => {});
    req.end();
    await vi.waitFor(() => expect(releaseResolver).toBeTypeOf("function"));

    req.destroy();
    await new Promise(resolve => setTimeout(resolve, 20));
    releaseResolver?.();
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns an uncached JSON 502 when the upstream fails before the first byte", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.error(qDisconnect());
      },
    }), {
      status: 206,
      headers: {
        "content-type": "video/mp4",
        "content-length": "100",
        "content-range": "bytes 0-99/100",
        "accept-ranges": "bytes",
      },
    })));

    const response = await get(origin, "/api/video/stream/2111196763344244825");

    expect(response).toMatchObject({ status: 502, aborted: false });
    expect(response.headers["content-type"]).toMatch(/^application\/json/);
    expect(response.headers["content-range"]).toBeUndefined();
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(JSON.parse(response.body)).toEqual({ message: "تعذر بث الفيديو" });
  });

  it("handles NODE-EXPRESS-Q without re-emitting the upstream error on the response socket", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        setTimeout(() => controller.error(qDisconnect()), 10);
      },
    }), {
      status: 200,
      headers: {
        "content-type": "video/mp4",
        "content-length": "6",
        "accept-ranges": "bytes",
      },
    })));

    const first = await get(origin, "/api/video/stream/2111196763344244823");
    const health = await get(origin, "/api/video/stream/nope");

    expect(first.aborted).toBe(true);
    expect(health).toMatchObject({ status: 400, aborted: false });
    expect(observedErrors).toEqual([]);
    expect(errorLog).toHaveBeenCalledWith(
      "[VideoResolver] upstream media stream ended early",
      expect.objectContaining({
        tweetId: "2111196763344244823",
        message: "terminated",
        causeCode: "UND_ERR_SOCKET",
      }),
    );
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("token=secret");
  });

  it("keeps unexpected stream failures on the Express/Sentry error path", async () => {
    const unexpected = new Error("decoder invariant failed");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
        setTimeout(() => controller.error(unexpected), 10);
      },
    }), { status: 200, headers: { "content-type": "video/mp4" } })));

    const response = await get(origin, "/api/video/stream/2111196763344244823");

    expect(response.aborted).toBe(true);
    expect(observedErrors).toEqual([unexpected]);
  });

  it("absorbs late AbortError emitted by source stream after downstream close (NODE-EXPRESS-S)", async () => {
    const { Readable, Writable } = await import("node:stream");
    const uncaught: unknown[] = [];
    const onUncaught = (err: unknown) => uncaught.push(err);
    process.on("uncaughtException", onUncaught);

    try {
      const source = new Readable({
        read() {},
        destroy(err, cb) {
          // Simulate Readable.fromWeb async reader.cancel() completion after abortForDownstream
          Promise.resolve().then(() => cb(err));
        },
      });
      const res = new Writable({
        write(_chunk, _enc, cb) { cb(); },
      }) as unknown as express.Response;

      const pipePromise = pipeVideoToResponse(source, res);

      // 1. In Node 24, abortForDownstream -> controller.abort() synchronously marks
      //    the Readable.fromWeb stream destroyed with AbortError before res emits "close".
      const abortErr = new DOMException("This operation was aborted", "AbortError");
      source.destroy(abortErr);

      // 2. Immediately after, socketOnClose emits "close" on res, settling pipeVideoToResponse.
      res.emit("close");
      await expect(pipePromise).rejects.toMatchObject({ code: "SABQ_VIDEO_DOWNSTREAM_CLOSED" });

      // 3. Flush nextTick/microtasks where emitErrorCloseNT emits "error" on source.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(uncaught).toEqual([]);
    } finally {
      process.off("uncaughtException", onUncaught);
    }
  });
});
