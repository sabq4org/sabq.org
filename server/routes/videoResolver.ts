import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { captureException } from "@sentry/node";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { resolveVideoUrl } from "../services/videoResolverService";
import { resolveXVideoFromPostUrl } from "../services/sahraaTvVideoResolver";
import { requireAuth } from "../rbac";

const router = Router();

const resolveSchema = z.object({
  url: z.string().min(1),
});

const UPSTREAM_TIMEOUT_MS = 30_000;

export type VideoStreamLifecycle = {
  signal: AbortSignal;
  isResponseClosed: () => boolean;
  isClientDisconnected: () => boolean;
  getUpstreamStreamError: () => unknown;
  setNodeStream: (stream: Readable) => void;
  finish: () => void;
};

export function createVideoStreamLifecycle(req: Request, res: Response): VideoStreamLifecycle {
  const controller = new AbortController();
  let responseClosed = false;
  let clientDisconnected = false;
  let finished = false;
  let nodeStream: Readable | null = null;
  let upstreamStreamError: unknown;

  const abortUpstream = () => {
    if (finished) return;
    responseClosed = true;
    if (!upstreamStreamError) clientDisconnected = true;
    controller.abort();
    nodeStream?.destroy();
  };

  const onResponseClose = () => {
    if (finished || res.writableEnded || res.writableFinished) return;
    responseClosed = true;
    abortUpstream();
  };

  req.once("aborted", abortUpstream);
  res.once("close", onResponseClose);

  return {
    signal: controller.signal,
    isResponseClosed: () => responseClosed || req.aborted || req.socket?.destroyed === true || res.destroyed,
    isClientDisconnected: () => clientDisconnected,
    getUpstreamStreamError: () => upstreamStreamError,
    setNodeStream: (stream) => {
      nodeStream = stream;
      stream.once("error", (error) => {
        if (!clientDisconnected) upstreamStreamError = error;
      });
      stream.once("close", () => {
        if (!clientDisconnected && !stream.readableEnded) {
          upstreamStreamError ??= new Error("Upstream video stream closed prematurely");
        }
      });
      if (responseClosed || req.aborted || req.socket?.destroyed === true || res.destroyed) {
        stream.destroy();
      }
    },
    finish: () => {
      finished = true;
      controller.abort();
      req.removeListener("aborted", abortUpstream);
      res.removeListener("close", onResponseClose);
    },
  };
}

function isExpectedClientStreamError(error: unknown, lifecycle: VideoStreamLifecycle): boolean {
  const code = error && typeof error === "object" && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  const name = error && typeof error === "object" && "name" in error
    ? (error as { name?: unknown }).name
    : undefined;
  const message = error instanceof Error ? error.message : String(error);

  if (lifecycle.getUpstreamStreamError() !== undefined) return false;

  if (lifecycle.isClientDisconnected()) {
    return name === "AbortError"
      || code === "ERR_STREAM_PREMATURE_CLOSE"
      || code === "ERR_STREAM_DESTROYED"
      || message === "terminated"
      || message.includes("Cannot pipe to a closed or destroyed stream");
  }

  return false;
}

async function cancelUpstreamBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body) return;
  try {
    await body.cancel();
  } catch {
    // The abort signal may already have canceled the body.
  }
}

export async function streamVideoResponse(
  req: Request,
  res: Response,
  upstreamUrl: string,
  lifecycle: VideoStreamLifecycle,
  timeoutMs = UPSTREAM_TIMEOUT_MS,
): Promise<void> {
  const timeoutController = new AbortController();
  const timeoutTimer = setTimeout(() => timeoutController.abort(), timeoutMs);
  const signal = AbortSignal.any([lifecycle.signal, timeoutController.signal]);

  try {
    const headers: Record<string, string> = {
      Accept: "*/*",
      "User-Agent": "Mozilla/5.0 (compatible; SabqVideo/1.0; +https://sabq.org)",
      Referer: "https://x.com/",
      Origin: "https://x.com",
    };
    if (typeof req.headers.range === "string" && req.headers.range) {
      headers.Range = req.headers.range;
    }

    if (lifecycle.isResponseClosed()) return;
    const upstream = await fetch(upstreamUrl, {
      headers,
      signal,
      redirect: "follow",
    });

    if (!upstream.ok && upstream.status !== 206) {
      console.error("[VideoResolver] upstream media error", upstream.status, upstreamUrl);
      await cancelUpstreamBody(upstream.body);
      if (!lifecycle.isResponseClosed()) {
        res.status(502).json({ message: "تعذر بث الفيديو من المصدر" });
      }
      return;
    }

    if (lifecycle.isResponseClosed()) {
      await cancelUpstreamBody(upstream.body);
      return;
    }

    res.status(upstream.status);
    const passHeaders = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
    ] as const;
    for (const name of passHeaders) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    if (!res.getHeader("content-type")) {
      res.setHeader("Content-Type", "video/mp4");
    }
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");

    if (!upstream.body) {
      res.end();
      return;
    }

    const nodeStream = Readable.fromWeb(upstream.body as import("stream/web").ReadableStream);
    lifecycle.setNodeStream(nodeStream);
    if (lifecycle.isResponseClosed()) {
      nodeStream.destroy();
      return;
    }

    await pipeline(nodeStream, res);
  } catch (err: unknown) {
    if (isExpectedClientStreamError(err, lifecycle)) return;
    const failure = lifecycle.getUpstreamStreamError() ?? err;
    captureException(failure, { tags: { component: "video-stream" } });
    if (!res.headersSent) {
      console.error("[VideoResolver] media proxy error:", failure);
      if (!lifecycle.isResponseClosed()) {
        res.status(502).json({ message: "تعذر بث الفيديو" });
      }
    } else {
      console.error("[VideoResolver] media proxy error:", failure);
      res.destroy(failure instanceof Error ? failure : undefined);
    }
  } finally {
    clearTimeout(timeoutTimer);
    timeoutController.abort();
  }
}

// Cache resolved video URLs in memory for 1 hour to avoid repeated API lookups
const resolvedUrlCache = new Map<string, { url: string; posterUrl: string; expiresAt: number }>();

async function getUpstreamMp4Url(tweetId: string): Promise<string | null> {
  const cached = resolvedUrlCache.get(tweetId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  try {
    const resolved = await resolveXVideoFromPostUrl(`https://twitter.com/i/status/${tweetId}`);
    if (resolved?.videoUrl) {
      resolvedUrlCache.set(tweetId, {
        url: resolved.videoUrl,
        posterUrl: resolved.posterUrl,
        expiresAt: Date.now() + 3600_000,
      });
      return resolved.videoUrl;
    }
  } catch (err) {
    console.error("[VideoResolver] Failed to resolve tweet video for streaming:", tweetId, err);
  }
  return null;
}

router.post("/api/video/resolve", requireAuth, async (req, res) => {
  try {
    const parsed = resolveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "رابط الفيديو مطلوب" });
    }

    const info = await resolveVideoUrl(parsed.data.url);
    res.json(info);
  } catch (error: any) {
    console.error("[VideoResolver] Failed to resolve video:", error);
    res.status(500).json({ message: "تعذر معالجة رابط الفيديو" });
  }
});

router.get("/api/video/stream/:tweetId", async (req, res) => {
  const tweetId = req.params.tweetId;
  if (!tweetId || !/^\d{5,25}$/.test(tweetId)) {
    res.status(400).json({ message: "معرف التغريدة غير صالح" });
    return;
  }

  const lifecycle = createVideoStreamLifecycle(req, res);
  try {
    const upstreamUrl = await getUpstreamMp4Url(tweetId);
    if (!upstreamUrl) {
      if (!lifecycle.isResponseClosed()) {
        res.status(404).json({ message: "تعذر العثور على ملف الفيديو" });
      }
      return;
    }
    if (lifecycle.isResponseClosed()) return;
    await streamVideoResponse(req, res, upstreamUrl, lifecycle);
  } catch (err: unknown) {
    if (isExpectedClientStreamError(err, lifecycle)) return;
    if (!res.headersSent && !lifecycle.isResponseClosed()) {
      console.error("[VideoResolver] media proxy error:", err);
      res.status(502).json({ message: "تعذر بث الفيديو" });
    } else if (res.headersSent) {
      console.error("[VideoResolver] media proxy error:", err);
      res.destroy(err instanceof Error ? err : undefined);
    }
  } finally {
    lifecycle.finish();
  }
});

export default router;
