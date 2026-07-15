/**
 * Social link-preview refresh (WhatsApp / Facebook / Twitter).
 *
 * Symptom: publish an article without a hero image → WhatsApp/Facebook cache
 * the brand logo as og:image. Later the editor adds a photo; our edge already
 * serves the correct meta (after CDN purge), but WhatsApp still shows the logo
 * because Meta caches the first scrape of the URL.
 *
 * Fix: after Cloudflare purge, ask Facebook's Graph API to re-scrape the URL
 * (`scrape=true`). WhatsApp uses the same crawler, so a successful scrape
 * updates WhatsApp previews. Twitter/X has no reliable public re-crawl API —
 * we return debugger links for manual refresh.
 *
 * Requires FACEBOOK_ACCESS_TOKEN (or META_ACCESS_TOKEN). Without it the
 * service still returns manual debugger URLs and never throws.
 */

const SITE_URL = (
  process.env.PUBLIC_SITE_URL ||
  process.env.FRONTEND_URL ||
  "https://sabq.org"
).replace(/\/+$/, "");

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v21.0";

export type SocialPreviewPlatform = "facebook" | "whatsapp" | "twitter" | "linkedin";

export interface SocialPreviewRefreshResult {
  url: string;
  success: boolean;
  platform: "facebook";
  /** True when Meta accepted the scrape and returned an image. */
  hasImage?: boolean;
  image?: string | null;
  title?: string | null;
  error?: string;
  /** Open these when auto-scrape is unavailable or failed. */
  debuggerUrls: {
    facebook: string;
    linkedin: string;
  };
}

export interface ArticleSocialRefreshSummary {
  configured: boolean;
  results: SocialPreviewRefreshResult[];
  /** At least one URL scraped successfully. */
  success: boolean;
  message: string;
}

type ArticleLike = {
  slug?: string | null;
  englishSlug?: string | null;
  status?: string | null;
  imageUrl?: string | null;
} | null | undefined;

function accessToken(): string | undefined {
  const raw =
    process.env.FACEBOOK_ACCESS_TOKEN ||
    process.env.META_ACCESS_TOKEN ||
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN ||
    "";
  const token = raw.trim();
  return token || undefined;
}

export function isSocialPreviewRefreshConfigured(): boolean {
  return Boolean(accessToken());
}

export function facebookDebuggerUrl(articleUrl: string): string {
  return `https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(articleUrl)}`;
}

export function linkedinInspectorUrl(articleUrl: string): string {
  return `https://www.linkedin.com/post-inspector/inspect/${encodeURIComponent(articleUrl)}`;
}

/** Canonical public URLs we should ask Meta to re-scrape for one article. */
export function articleShareUrls(article: ArticleLike): string[] {
  const urls = new Set<string>();
  const ar = article?.englishSlug || article?.slug;
  if (ar) urls.add(`${SITE_URL}/article/${ar}`);
  if (article?.englishSlug) {
    urls.add(`${SITE_URL}/en/article/${article.englishSlug}`);
  }
  // Also scrape the short/DB slug if it differs from englishSlug — WhatsApp
  // shares often use whichever path the editor copied from the address bar.
  if (article?.slug && article.slug !== article.englishSlug) {
    urls.add(`${SITE_URL}/article/${article.slug}`);
  }
  return Array.from(urls);
}

function debuggerUrlsFor(url: string): SocialPreviewRefreshResult["debuggerUrls"] {
  return {
    facebook: facebookDebuggerUrl(url),
    linkedin: linkedinInspectorUrl(url),
  };
}

/**
 * Ask Facebook Graph to re-scrape a single public URL.
 * Safe: never throws; returns a structured result.
 */
export async function refreshFacebookPreview(
  articleUrl: string,
): Promise<SocialPreviewRefreshResult> {
  const debuggerUrls = debuggerUrlsFor(articleUrl);
  const token = accessToken();
  if (!token) {
    return {
      url: articleUrl,
      success: false,
      platform: "facebook",
      error:
        "لم يُضبط FACEBOOK_ACCESS_TOKEN — استخدم Facebook Sharing Debugger يدوياً لتحديث واتساب",
      debuggerUrls,
    };
  }

  try {
    const endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/`;
    const body = new URLSearchParams({
      id: articleUrl,
      scrape: "true",
      access_token: token,
    });
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: number; type?: string };
      title?: string;
      description?: string;
      image?: Array<{ url?: string }> | string;
      og_object?: { image?: Array<{ url?: string }> | { url?: string } };
    };

    if (!res.ok || json.error) {
      const msg =
        json.error?.message ||
        `Facebook Graph HTTP ${res.status}`;
      console.warn(`[SocialPreview] scrape failed for ${articleUrl}: ${msg}`);
      return {
        url: articleUrl,
        success: false,
        platform: "facebook",
        error: msg,
        debuggerUrls,
      };
    }

    const imageFromArr = Array.isArray(json.image)
      ? json.image[0]?.url
      : typeof json.image === "string"
        ? json.image
        : undefined;
    const ogImg = json.og_object?.image;
    const imageFromOg = Array.isArray(ogImg)
      ? ogImg[0]?.url
      : ogImg && typeof ogImg === "object"
        ? ogImg.url
        : undefined;
    const image = imageFromArr || imageFromOg || null;

    console.log(
      `[SocialPreview] scraped ${articleUrl} image=${image ? "yes" : "no"}`,
    );
    return {
      url: articleUrl,
      success: true,
      platform: "facebook",
      hasImage: Boolean(image),
      image,
      title: json.title || null,
      debuggerUrls,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "network error";
    console.error(`[SocialPreview] scrape exception for ${articleUrl}:`, msg);
    return {
      url: articleUrl,
      success: false,
      platform: "facebook",
      error: msg,
      debuggerUrls,
    };
  }
}

export async function refreshArticleSocialPreviews(
  article: ArticleLike,
): Promise<ArticleSocialRefreshSummary> {
  const urls = articleShareUrls(article);
  if (urls.length === 0) {
    return {
      configured: isSocialPreviewRefreshConfigured(),
      results: [],
      success: false,
      message: "لا يوجد رابط مقال لإعادة الزحف",
    };
  }

  const configured = isSocialPreviewRefreshConfigured();
  const results: SocialPreviewRefreshResult[] = [];
  for (const url of urls) {
    // Sequential to stay under Graph rate limits; usually 1–2 URLs.
    results.push(await refreshFacebookPreview(url));
  }

  const success = results.some((r) => r.success);
  const message = !configured
    ? "أُعدّت روابط أدوات التحديث اليدوي — اضبط FACEBOOK_ACCESS_TOKEN للتحديث التلقائي لواتساب/فيسبوك"
    : success
      ? "تم تحديث معاينة فيسبوك/واتساب"
      : "تعذّر التحديث التلقائي — افتح Facebook Sharing Debugger واضغط Scrape Again";

  return { configured, results, success, message };
}

/** In-flight debounce so rapid saves don't spam Graph. */
const scheduled = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Fire-and-forget: after CDN purge settles, re-scrape share URLs.
 * Call only when a published article's hero image (or other OG-critical
 * fields) changed — not on every keystroke save.
 */
export function scheduleSocialPreviewRefresh(
  article: ArticleLike,
  opts: { delayMs?: number; reason?: string } = {},
): void {
  if (!article) return;
  if (article.status && article.status !== "published") return;

  const urls = articleShareUrls(article);
  if (urls.length === 0) return;

  const key = urls[0];
  const existing = scheduled.get(key);
  if (existing) clearTimeout(existing);

  const delayMs = opts.delayMs ?? 2500;
  const reason = opts.reason || "image-change";

  const timer = setTimeout(() => {
    scheduled.delete(key);
    console.log(
      `[SocialPreview] scheduled refresh (${reason}) urls=${urls.length}`,
    );
    void refreshArticleSocialPreviews(article).then((summary) => {
      console.log(
        `[SocialPreview] done (${reason}) success=${summary.success} configured=${summary.configured}`,
      );
    });
  }, delayMs);

  scheduled.set(key, timer);
}

/**
 * Convenience: refresh only when the hero image URL actually changed on a
 * published article (added, replaced, or cleared).
 */
export function maybeRefreshSocialPreviewOnImageChange(
  before: ArticleLike,
  after: ArticleLike,
  opts?: { reason?: string },
): void {
  if (!after || after.status !== "published") return;
  const prev = before?.imageUrl || "";
  const next = after.imageUrl || "";
  if (prev === next) return;
  scheduleSocialPreviewRefresh(after, {
    reason: opts?.reason || "image-url-changed",
  });
}
