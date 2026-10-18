import { Router, type NextFunction, type Request, type Response as ExpressResponse } from "express";
import { z } from "zod";
import { Readable } from "node:stream";
import { resolveVideoUrl } from "../services/videoResolverService";
import { resolveXVideoFromPostUrl } from "../services/sahraaTvVideoResolver";
import { extractTweetId } from "../services/sahraaTvBlockUtils";
import { requireAuth } from "../rbac";

const router = Router();

const resolveSchema = z.object({
  url: z.string().min(1),
});

const UPSTREAM_HEADER_TIMEOUT_MS = 30_000;
const VIDEO_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "cache-control",
] as const;

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

type ErrorWithCause = Error & {
  code?: unknown;
  cause?: unknown;
};

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as ErrorWithCause).code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Undici wraps an upstream socket closing during body streaming exactly this way.
 * It is an external transport interruption, not an uncaught application failure.
 * Keep the match narrow so arbitrary TypeErrors and database/network failures still
 * reach the normal Express/Sentry error path.
 */
export function isExpectedUpstreamStreamEnd(error: unknown): boolean {
  if (!(error instanceof TypeError) || error.message !== "terminated") return false;
  const cause = (error as ErrorWithCause).cause;
  return errorCode(cause) === "UND_ERR_SOCKET";
}

/**
 * Limit only the wait for upstream response headers. Keeping the same timer alive
 * while piping the MP4 aborts every stream that takes more than 30 seconds.
 */
export async function fetchUpstreamVideo(
  url: string,
  headers: Record<string, string>,
  controller: AbortController,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const timer = setTimeout(() => controller.abort(), UPSTREAM_HEADER_TIMEOUT_MS);
  try {
    return await fetchImpl(url, {
      headers,
      signal: controller.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

function streamErrorContext(error: unknown): Record<string, string | undefined> {
  const typed = error instanceof Error ? error as ErrorWithCause : undefined;
  return {
    name: typed?.name,
    message: typed?.message,
    code: errorCode(typed),
    causeCode: errorCode(typed?.cause),
  };
}

function clearVideoResponseHeaders(res: ExpressResponse): void {
  for (const name of VIDEO_RESPONSE_HEADERS) res.removeHeader(name);
}

function sendVideoProxyError(res: ExpressResponse, message: string): void {
  clearVideoResponseHeaders(res);
  res.status(502).setHeader("Cache-Control", "no-store").json({ message });
}

/**
 * `stream.pipeline(source, res)` destroys the HTTP response with the upstream
 * error before its promise rejects. A plain pipe lets the route classify the
 * source failure first and close the client socket without re-emitting it.
 */
export function pipeVideoToResponse(source: Readable, res: ExpressResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      source.off("error", onSourceError);
      res.off("finish", onFinish);
      res.off("close", onClose);
    };
    const settle = (error?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error !== undefined) reject(error);
      else resolve();
    };
    const onSourceError = (error: unknown) => {
      source.unpipe(res);
      settle(error);
    };
    const onFinish = () => settle();
    const onClose = () => {
      if (res.writableEnded) settle();
      else {
        source.unpipe(res);
        source.destroy();
        settle(Object.assign(new Error("Downstream closed during video stream"), {
          code: "SABQ_VIDEO_DOWNSTREAM_CLOSED",
        }));
      }
    };

    source.once("error", onSourceError);
    res.once("finish", onFinish);
    res.once("close", onClose);
    source.pipe(res);
  });
}

router.post("/api/video/resolve", requireAuth, async (req, res) => {
  try {
    const parsed = resolveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "رابط الفيديو مطلوب" });
    }

    const info = await resolveVideoUrl(parsed.data.url);
    res.json(info);
  } catch (error: unknown) {
    console.error("[VideoResolver] Failed to resolve video:", error);
    res.status(500).json({ message: "تعذر معالجة رابط الفيديو" });
  }
});

router.get("/api/video/stream/:tweetId", async (req: Request, res: ExpressResponse, next: NextFunction) => {
  const tweetId = req.params.tweetId;
  if (!tweetId || !/^\d{5,25}$/.test(tweetId)) {
    res.status(400).json({ message: "معرف التغريدة غير صالح" });
    return;
  }

  const controller = new AbortController();
  let downstreamClosed = false;
  const abortForDownstream = () => {
    downstreamClosed = true;
    controller.abort();
  };
  const abortForPrematureResponseClose = () => {
    if (!res.writableEnded) abortForDownstream();
  };
  req.once("aborted", abortForDownstream);
  res.once("close", abortForPrematureResponseClose);
  if (req.aborted || res.destroyed) abortForDownstream();

  try {
    if (downstreamClosed) return;

    const upstreamUrl = await getUpstreamMp4Url(tweetId);
    if (downstreamClosed || res.destroyed) return;
    if (!upstreamUrl) {
      res.status(404).json({ message: "تعذر العثور على ملف الفيديو" });
      return;
    }

    const headers: Record<string, string> = {
      Accept: "*/*",
      "User-Agent": "Mozilla/5.0 (compatible; SabqVideo/1.0; +https://sabq.org)",
      Referer: "https://x.com/",
      Origin: "https://x.com",
    };
    if (typeof req.headers.range === "string" && req.headers.range) {
      headers.Range = req.headers.range;
    }

    const upstream = await fetchUpstreamVideo(upstreamUrl, headers, controller);

    if (!upstream.ok && upstream.status !== 206) {
      console.error("[VideoResolver] upstream media error", {
        status: upstream.status,
        tweetId,
      });
      sendVideoProxyError(res, "تعذر بث الفيديو من المصدر");
      return;
    }

    res.status(upstream.status);
    const passHeaders = VIDEO_RESPONSE_HEADERS.slice(0, 4);
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
    await pipeVideoToResponse(nodeStream, res);
  } catch (err: unknown) {
    if (downstreamClosed) return;

    if (isExpectedUpstreamStreamEnd(err)) {
      console.error("[VideoResolver] upstream media stream ended early", {
        tweetId,
        ...streamErrorContext(err),
      });
      if (!res.headersSent) {
        sendVideoProxyError(res, "تعذر بث الفيديو");
      } else {
        // Do not re-emit the upstream Error on the downstream socket. Native
        // video clients can retry with Range; emitting it here created a fatal
        // process-level Sentry event (NODE-EXPRESS-Q).
        res.destroy();
      }
      return;
    }

    if (res.headersSent) res.destroy();
    else {
      clearVideoResponseHeaders(res);
      res.setHeader("Cache-Control", "no-store");
    }
    next(err);
  } finally {
    req.off("aborted", abortForDownstream);
    res.off("close", abortForPrematureResponseClose);
  }
});

export default router;
