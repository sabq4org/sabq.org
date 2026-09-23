import { extractTweetId, normalizeXPostUrl } from "./sahraaTvBlockUtils";
import { resolveXVideoFromPostUrl } from "./sahraaTvVideoResolver";

export interface ResolvedVideoInfo {
  platform: "youtube" | "dailymotion" | "twitter" | "direct";
  videoId?: string;
  tweetId?: string;
  directVideoUrl?: string;
  thumbnailUrl?: string;
  embedUrl?: string;
}

export function parseYouTubeId(raw: string): string | null {
  const url = raw.trim();
  const patterns = [
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i,
    /(?:youtube\.com\/shorts\/)([^"&?\/\s]{11})/i,
  ];
  for (const pattern of patterns) {
    const m = url.match(pattern);
    if (m && m[1]) return m[1];
  }
  return null;
}

export function parseDailymotionId(raw: string): string | null {
  const url = raw.trim();
  const patterns = [
    /(?:dailymotion\.com\/video\/|dai\.ly\/|dailymotion\.com\/embed\/video\/)([^_\n?#\/]+)/i,
  ];
  for (const pattern of patterns) {
    const m = url.match(pattern);
    if (m && m[1]) return m[1];
  }
  return null;
}

export async function resolveVideoUrl(rawUrl: string): Promise<ResolvedVideoInfo> {
  const trimmed = rawUrl.trim();
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate.replace(/^\/+/, "")}`;
  }

  // 1. YouTube
  const youtubeId = parseYouTubeId(candidate);
  if (youtubeId) {
    return {
      platform: "youtube",
      videoId: youtubeId,
      embedUrl: `https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`,
      thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`,
    };
  }

  // 2. Dailymotion
  const dailymotionId = parseDailymotionId(candidate);
  if (dailymotionId) {
    return {
      platform: "dailymotion",
      videoId: dailymotionId,
      embedUrl: `https://geo.dailymotion.com/player.html?video=${dailymotionId}&autoplay=1`,
      thumbnailUrl: `https://www.dailymotion.com/thumbnail/video/${dailymotionId}`,
    };
  }

  // 3. X / Twitter
  const tweetId = extractTweetId(candidate);
  if (tweetId) {
    const normalized = normalizeXPostUrl(candidate) || candidate;
    try {
      const resolved = await resolveXVideoFromPostUrl(normalized);
      return {
        platform: "twitter",
        tweetId,
        directVideoUrl: resolved.videoUrl,
        thumbnailUrl: resolved.posterUrl,
        embedUrl: `https://twitter.com/i/status/${tweetId}`,
      };
    } catch {
      return {
        platform: "twitter",
        tweetId,
        embedUrl: `https://twitter.com/i/status/${tweetId}`,
      };
    }
  }

  // 4. Direct video file
  return {
    platform: "direct",
    directVideoUrl: candidate,
  };
}
