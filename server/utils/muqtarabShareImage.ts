import { db } from "../db";
import { mediaFiles } from "@shared/schema";
import { eq } from "drizzle-orm";

/** مقاس OG المفضّل — واتساب/فيسبوك لا يتبعان 302 ولا يحبّان PNG ضخمة */
export const MUQTARAB_OG_VARIANT = "w=1200,h=630,q=85,fit=cover";
const DEFAULT_FALLBACK_PATH = "/branding/sabq-og-image.png";

/** أولوية صورة المشاركة لمواضيع/زوايا مُقترب */
export function pickMuqtarabShareImageRaw(...candidates: Array<string | null | undefined>): string | null {
  for (const raw of candidates) {
    const trimmed = raw?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/** استبدال variant الأخير في روابط Cloudflare Images بمقاس OG مضغوط */
export function normalizeImagedeliveryForOg(url: string): string {
  if (!url.includes("imagedelivery.net")) return url;
  if (url.includes(`/${MUQTARAB_OG_VARIANT}`)) return url;
  return url.replace(/\/[^/]+$/, `/${MUQTARAB_OG_VARIANT}`);
}

function extractMediaProxyId(url: string): string | null {
  const match = url.match(/\/api\/media\/proxy\/([^/?#]+)/i);
  return match ? match[1] : null;
}

function parseObjectStoragePath(url: string): string | null {
  if (url.startsWith("/public-objects/uploads/")) {
    return `uploads/${url.replace("/public-objects/uploads/", "")}`;
  }
  if (url.startsWith("/public-objects/")) {
    const rest = url.replace("/public-objects/", "");
    return rest.includes("/") ? rest : `uploads/${rest}`;
  }
  const bucketMatch = url.match(/^\/api\/public-media\/(replit-objstore-[a-f0-9-]+)\/public\/(.+)$/);
  if (bucketMatch) return bucketMatch[2];
  if (url.startsWith("/api/public-media/public/")) {
    return url.replace("/api/public-media/public/", "");
  }
  if (url.startsWith("/api/public-media/")) {
    const rest = url.replace("/api/public-media/", "");
    return rest.includes("/") ? rest : `uploads/${rest}`;
  }
  return null;
}

function toSocialImageUrl(storagePath: string, baseUrl: string): string {
  const clean = storagePath.replace(/\.[^.]+$/, "");
  return `${baseUrl}/social-image/${clean}.jpg`;
}

function finalizeOgUrl(url: string, baseUrl: string): string {
  if (url.includes("imagedelivery.net")) {
    return normalizeImagedeliveryForOg(url);
  }
  return url;
}

/**
 * يحوّل أي مصدر صورة (proxy، تخزين، Cloudflare) إلى رابط OG مباشر
 * بدون إعادة توجيه — ضروري لواتساب وتيليجرام.
 */
export async function resolveMuqtarabOgImage(
  baseUrl: string,
  ...candidates: Array<string | null | undefined>
): Promise<{ raw: string | null; absolute: string }> {
  const siteUrl = baseUrl.replace(/\/$/, "");
  const raw = pickMuqtarabShareImageRaw(...candidates);
  if (!raw) {
    return { raw: null, absolute: `${siteUrl}${DEFAULT_FALLBACK_PATH}` };
  }

  let url = raw.trim();

  const proxyId = extractMediaProxyId(url);
  if (proxyId) {
    const [row] = await db
      .select({ url: mediaFiles.url })
      .from(mediaFiles)
      .where(eq(mediaFiles.id, proxyId))
      .limit(1);
    if (row?.url?.trim()) {
      url = row.url.trim();
    } else {
      return { raw, absolute: `${siteUrl}${DEFAULT_FALLBACK_PATH}` };
    }
  }

  if (extractMediaProxyId(url)) {
    return { raw, absolute: `${siteUrl}${DEFAULT_FALLBACK_PATH}` };
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return { raw, absolute: finalizeOgUrl(url, siteUrl) };
  }

  const storagePath = parseObjectStoragePath(url);
  if (storagePath) {
    return { raw, absolute: toSocialImageUrl(storagePath, siteUrl) };
  }

  if (url.startsWith("/")) {
    const absolute = `${siteUrl}${url}`;
    if (absolute.includes("imagedelivery.net")) {
      return { raw, absolute: finalizeOgUrl(absolute, siteUrl) };
    }
    if (absolute.includes("/api/media/proxy/")) {
      return { raw, absolute: `${siteUrl}${DEFAULT_FALLBACK_PATH}` };
    }
    return { raw, absolute };
  }

  return { raw, absolute: `${siteUrl}/${url}` };
}

export function toAbsoluteShareImage(
  raw: string | null | undefined,
  baseUrl: string,
  ensureAbsoluteUrl: (url: string, base: string) => string,
  fallbackPath = DEFAULT_FALLBACK_PATH,
): string {
  const picked = pickMuqtarabShareImageRaw(raw);
  if (!picked) return `${baseUrl}${fallbackPath}`;
  const abs = ensureAbsoluteUrl(picked, baseUrl);
  return finalizeOgUrl(abs, baseUrl);
}
