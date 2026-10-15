import { Router } from "express";
import { z } from "zod";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { resolveVideoUrl } from "../services/videoResolverService";
import { resolveXVideoFromPostUrl } from "../services/sahraaTvVideoResolver";
import { extractTweetId } from "../services/sahraaTvBlockUtils";
import { requireAuth } from "../rbac";

const router = Router();

const resolveSchema = z.object({
  url: z.string().min(1),
});

const UPSTREAM_TIMEOUT_MS = 30_000;

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

  const upstreamUrl = await getUpstreamMp4Url(tweetId);
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(upstreamUrl, {
      headers,
      signal: controller.signal,
      redirect: "follow",
    });

    if (!upstream.ok && upstream.status !== 206) {
      console.error("[VideoResolver] upstream media error", upstream.status, upstreamUrl);
      res.status(502).json({ message: "تعذر بث الفيديو من المصدر" });
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
    await pipeline(nodeStream, res);
  } catch (err: unknown) {
    if (!res.headersSent) {
      console.error("[VideoResolver] media proxy error:", err);
      res.status(502).json({ message: "تعذر بث الفيديو" });
    } else {
      res.destroy(err instanceof Error ? err : undefined);
    }
  } finally {
    clearTimeout(timer);
  }
});

export default router;
