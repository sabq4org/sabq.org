/**
 * استخراج رابط فيديو MP4 من منشور إكس — بلا عرض للتغريدة.
 * الترتيب: X API الرسمي (إن وُجد المفتاح) → FxTwitter كاحتياط عام.
 */
import {
  extractTweetId,
  pickBestMp4Url,
  type XVideoVariant,
} from "./sahraaTvBlockUtils";

export interface ResolvedXVideo {
  tweetId: string;
  videoUrl: string;
  posterUrl: string;
  source: "official" | "fxtwitter";
}

const FETCH_TIMEOUT_MS = 12_000;

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "SabqSahraaTvBlock/1.0",
        ...headers,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${body.slice(0, 160)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function resolveViaOfficial(tweetId: string): Promise<ResolvedXVideo | null> {
  const token = process.env.X_API_BEARER_TOKEN;
  if (!token) return null;

  const params = new URLSearchParams({
    expansions: "attachments.media_keys",
    "media.fields": "type,preview_image_url,variants,url,width,height",
  });
  const payload = await fetchJson(
    `https://api.x.com/2/tweets/${tweetId}?${params}`,
    { Authorization: `Bearer ${token}` },
  );

  const mediaList = payload?.includes?.media ?? [];
  const videoMedia = mediaList.find(
    (m: any) => m?.type === "video" || m?.type === "animated_gif",
  );
  if (!videoMedia) return null;

  const variants: XVideoVariant[] = Array.isArray(videoMedia.variants)
    ? videoMedia.variants.map((v: any) => ({
        url: String(v.url ?? ""),
        bitrate: Number(v.bit_rate) || undefined,
        content_type: String(v.content_type ?? ""),
      }))
    : [];

  const videoUrl = pickBestMp4Url(variants);
  if (!videoUrl) return null;

  return {
    tweetId,
    videoUrl,
    posterUrl: String(videoMedia.preview_image_url ?? ""),
    source: "official",
  };
}

async function resolveViaFxTwitter(tweetId: string): Promise<ResolvedXVideo | null> {
  const payload = await fetchJson(`https://api.fxtwitter.com/status/${tweetId}`);
  if (payload?.code !== 200 || !payload?.tweet) return null;

  const videos = payload.tweet.media?.videos;
  if (!Array.isArray(videos) || videos.length === 0) return null;
  const video = videos[0];

  const variants: XVideoVariant[] = [];
  if (Array.isArray(video.formats)) {
    for (const f of video.formats) {
      variants.push({
        url: String(f.url ?? ""),
        bitrate: Number(f.bitrate) || undefined,
        format: f.container === "mp4" ? "video/mp4" : undefined,
        container: String(f.container ?? ""),
      });
    }
  }
  if (Array.isArray(video.variants)) {
    for (const v of video.variants) {
      variants.push({
        url: String(v.url ?? ""),
        bitrate: Number(v.bitrate) || undefined,
        content_type: String(v.content_type ?? ""),
      });
    }
  }
  if (typeof video.url === "string" && video.url) {
    variants.push({ url: video.url, format: "video/mp4", container: "mp4" });
  }

  const videoUrl = pickBestMp4Url(variants);
  if (!videoUrl) return null;

  return {
    tweetId,
    videoUrl,
    posterUrl: String(video.thumbnail_url ?? ""),
    source: "fxtwitter",
  };
}

/** يستخرج فيديو المنشور من رابط إكس. يرمي VIDEO_NOT_FOUND إن تعذّر. */
export async function resolveXVideoFromPostUrl(xPostUrl: string): Promise<ResolvedXVideo> {
  const tweetId = extractTweetId(xPostUrl);
  if (!tweetId) {
    const err = new Error("INVALID_X_POST_URL");
    (err as Error & { code: string }).code = "INVALID_X_POST_URL";
    throw err;
  }

  const errors: string[] = [];

  try {
    const official = await resolveViaOfficial(tweetId);
    if (official) return official;
  } catch (e: any) {
    errors.push(`official: ${e?.message ?? e}`);
  }

  try {
    const fx = await resolveViaFxTwitter(tweetId);
    if (fx) return fx;
  } catch (e: any) {
    errors.push(`fxtwitter: ${e?.message ?? e}`);
  }

  const err = new Error("VIDEO_NOT_FOUND");
  (err as Error & { code: string; details?: string }).code = "VIDEO_NOT_FOUND";
  (err as Error & { details?: string }).details = errors.join(" | ") || "no video media";
  throw err;
}
