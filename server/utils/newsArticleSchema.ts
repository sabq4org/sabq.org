/**
 * Shared NewsArticle JSON-LD enrichments for Google News / Discover.
 * Used by server/routes/edgeMeta.ts (Cloudflare edge path) and
 * server/seoInjector.ts (Replit single-process path) so both surfaces
 * emit identical structured data.
 */

/** Strip HTML tags and collapse whitespace for plain-text schema fields. */
export function htmlToPlainText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Word count for schema.org wordCount (Arabic + Latin whitespace-delimited). */
export function countWords(text: string): number {
  const plain = text.trim();
  if (!plain) return 0;
  return plain.split(/\s+/).filter(Boolean).length;
}

/**
 * Google News carousel prefers three distinct aspect ratios (16:9, 4:3, 1:1).
 * Uses Cloudflare Image Resizing (/cdn-cgi/image) for same-origin paths and
 * flexible variants for imagedelivery.net URLs.
 */
export function buildNewsArticleImageVariants(
  imageUrl: string,
  siteUrl: string,
): string[] {
  const base = imageUrl || `${siteUrl}/icon.png`;
  const specs = [
    { width: 1200, height: 675 },
    { width: 1200, height: 900 },
    { width: 1200, height: 1200 },
  ];

  const out = specs.map(({ width, height }) =>
    resizeForSchema(base, siteUrl, width, height),
  );
  // Dedupe if transforms collapsed to the same URL (external/CDN without resize).
  return [...new Set(out)];
}

function resizeForSchema(src: string, siteUrl: string, width: number, height: number): string {
  if (!src) return src;
  if (src.includes("/cdn-cgi/image/")) return src;

  if (src.includes("imagedelivery.net")) {
    const parts = [`w=${width}`, `h=${height}`, "q=90", "fit=cover", "gravity=auto"];
    return src.replace(/\/[^/]+$/, `/${parts.join(",")}`);
  }

  let imagePath = src;
  if (src.startsWith("http")) {
    try {
      const u = new URL(src);
      if (!u.hostname.endsWith("sabq.org")) return src;
      // News R2 assets are served from media.sabq.org.  That host already
      // exposes the original, valid WebP and is not backed by the Pages
      // /cdn-cgi/image transformer.  Rewriting it to siteUrl produces a
      // 415 response from the HTML origin, so preserve the source URL.
      if (u.hostname !== new URL(siteUrl).hostname) return src;
      imagePath = u.pathname + u.search;
    } catch {
      return src;
    }
  }

  if (
    imagePath.startsWith("/api/") ||
    imagePath.startsWith("/cdn-cgi/") ||
    imagePath.startsWith("/public-objects/")
  ) {
    return src;
  }

  const params = [
    `width=${width}`,
    `height=${height}`,
    "quality=85",
    "format=auto",
    "fit=cover",
    "gravity=auto",
  ];
  const path = imagePath.startsWith("/") ? imagePath : `/${imagePath}`;
  return `${siteUrl}/cdn-cgi/image/${params.join(",")}${path}`;
}

/** SpeakableSpecification for Google Assistant / voice surfaces. */
export function buildSpeakableSpecification(): Record<string, unknown> {
  return {
    "@type": "SpeakableSpecification",
    cssSelector: ["h1", ".article-title", ".article-summary", ".article-lead"],
  };
}

/** Map the stored editorial type to the most specific Schema.org article type. */
export function getArticleSchemaType(articleType?: string | null): string {
  if (articleType === "opinion") return "OpinionNewsArticle";
  if (articleType === "analysis") return "AnalysisNewsArticle";
  return "NewsArticle";
}

export interface NewsArticleSchemaExtras {
  articleBody?: string;
  wordCount?: number;
  image: string[];
  speakable: Record<string, unknown>;
}

/** Build optional NewsArticle fields from raw HTML content. */
export function buildNewsArticleSchemaExtras(
  contentHtml: string | null | undefined,
  imageUrl: string,
  siteUrl: string,
): NewsArticleSchemaExtras {
  const articleBody = htmlToPlainText(contentHtml || "");
  const wordCount = countWords(articleBody);
  const image = buildNewsArticleImageVariants(imageUrl, siteUrl);
  const speakable = buildSpeakableSpecification();
  return {
    ...(articleBody ? { articleBody } : {}),
    ...(wordCount > 0 ? { wordCount } : {}),
    image,
    speakable,
  };
}
