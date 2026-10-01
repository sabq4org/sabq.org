/**
 * بروكسي تشغيل فيديو الصحراء — video.twimg.com يرفض Referer من sabq.org (403).
 * نجلب من الخادم بـ Referer إكس ونمرّر Range للتمرير/التقديم.
 */
import type { Request, Response } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getSahraaTvBlockConfig } from "./sahraaTvBlockService";

const UPSTREAM_TIMEOUT_MS = 30_000;

async function resolveUpstreamVideoUrl(): Promise<string | null> {
  const config = await getSahraaTvBlockConfig();
  if (!config.isActive) return null;
  // Playback only uses URLs already saved by an admin. A media request must
  // never resolve a post or write settings as a side effect.
  return config.mirroredVideoUrl || config.videoUrl || null;
}

export async function proxySahraaTvMedia(req: Request, res: Response): Promise<void> {
  let upstreamUrl: string | null;
  try {
    upstreamUrl = await resolveUpstreamVideoUrl();
  } catch (err) {
    console.error("[SahraaTvBlock] media config read failed:", err);
    res.status(404).json({ message: "لا يوجد فيديو" });
    return;
  }
  if (!upstreamUrl) {
    res.status(404).json({ message: "لا يوجد فيديو" });
    return;
  }

  const headers: Record<string, string> = {
    Accept: "*/*",
    "User-Agent":
      "Mozilla/5.0 (compatible; SabqSahraaTv/1.0; +https://sabq.org)",
    // بدون Referer sabq — إكس يعيد 403. نستخدم نطاق إكس.
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
      console.error("[SahraaTvBlock] upstream media", upstream.status, upstreamUrl);
      res.status(502).json({ message: "تعذر جلب الفيديو من المصدر" });
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
    // كاش قصير على الحافة — فيديو يومي واحد
    res.setHeader(
      "Cache-Control",
      "public, max-age=1800, stale-while-revalidate=86400",
    );

    if (!upstream.body) {
      res.end();
      return;
    }

    const nodeStream = Readable.fromWeb(upstream.body as import("stream/web").ReadableStream);
    await pipeline(nodeStream, res);
  } catch (err: unknown) {
    if (!res.headersSent) {
      console.error("[SahraaTvBlock] media proxy error:", err);
      res.status(502).json({ message: "تعذر بث الفيديو" });
    } else {
      res.destroy(err instanceof Error ? err : undefined);
    }
  } finally {
    clearTimeout(timer);
  }
}
