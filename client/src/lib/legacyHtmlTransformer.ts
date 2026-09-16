import { buildCloudflareUrl, normalizeImageSrc } from "./cdnImage";
import { formatAspectRatio, getCachedAspectRatio } from "./legacyImageRatioCache";

const DEFAULT_IMG_STYLE = `width: 100%; height: auto;`;

const SOCIAL_EMBED_HEIGHTS: Array<{ match: RegExp; minHeight: number; wrapClass: string }> = [
  { match: /\btwitter-tweet\b/, minHeight: 520, wrapClass: "social-embed-wrap social-embed-twitter" },
  { match: /\binstagram-media\b/, minHeight: 600, wrapClass: "social-embed-wrap social-embed-instagram" },
  { match: /\btiktok-embed\b/, minHeight: 700, wrapClass: "social-embed-wrap social-embed-tiktok" },
];

function rewriteCdnUrl(src: string, width?: number): string {
  if (!src) return src;
  const normalized = normalizeImageSrc(src);
  return buildCloudflareUrl(normalized, { width: width ?? 960, quality: 80 });
}

function rewriteSrcset(srcset: string): string {
  if (!srcset) return srcset;
  return srcset
    .split(",")
    .map(part => {
      const trimmed = part.trim();
      if (!trimmed) return trimmed;
      const segments = trimmed.split(/\s+/);
      const url = segments[0];
      const descriptor = segments.slice(1).join(" ");
      const widthMatch = descriptor.match(/(\d+)w/);
      const width = widthMatch ? parseInt(widthMatch[1], 10) : undefined;
      const rewritten = rewriteCdnUrl(url, width);
      return descriptor ? `${rewritten} ${descriptor}` : rewritten;
    })
    .join(", ");
}

function transformImg(img: HTMLImageElement): void {
  const widthAttr = img.getAttribute("width");
  const heightAttr = img.getAttribute("height");
  const widthNum = widthAttr ? parseInt(widthAttr, 10) : NaN;
  const heightNum = heightAttr ? parseInt(heightAttr, 10) : NaN;
  const hasIntrinsicDims =
    Number.isFinite(widthNum) && Number.isFinite(heightNum) && widthNum > 0 && heightNum > 0;

  if (!img.hasAttribute("loading")) img.setAttribute("loading", "lazy");
  if (!img.hasAttribute("decoding")) img.setAttribute("decoding", "async");
  if (!img.hasAttribute("fetchpriority")) img.setAttribute("fetchpriority", "low");

  const src = img.getAttribute("src");
  let finalSrc = src || "";
  if (src) {
    const target = hasIntrinsicDims ? Math.min(widthNum, 1280) : 960;
    const rewritten = rewriteCdnUrl(src, target);
    if (rewritten !== src) {
      img.setAttribute("src", rewritten);
      finalSrc = rewritten;
    }
  }

  const srcset = img.getAttribute("srcset");
  if (srcset) {
    const rewritten = rewriteSrcset(srcset);
    if (rewritten !== srcset) img.setAttribute("srcset", rewritten);
  }

  const existingStyle = img.getAttribute("style") || "";
  const hasAspect = /aspect-ratio\s*:/i.test(existingStyle);
  const hasCustomWidth =
    /(?:^|;)\s*width\s*:/i.test(existingStyle) ||
    img.hasAttribute("data-width") ||
    img.classList.contains("sabq-article-image");
  const widthRule = hasCustomWidth ? "" : "width: 100%;";

  if (!hasAspect) {
    if (hasIntrinsicDims) {
      const ratio = `${widthNum} / ${heightNum}`;
      const styleSuffix = widthRule
        ? `aspect-ratio: ${ratio}; ${widthRule} height: auto;`
        : `aspect-ratio: ${ratio}; height: auto;`;
      img.setAttribute(
        "style",
        `${existingStyle ? existingStyle + ";" : ""}${styleSuffix}`,
      );
    } else {
      const cached = finalSrc ? getCachedAspectRatio(finalSrc) : null;
      if (cached) {
        const styleSuffix = widthRule
          ? `aspect-ratio: ${formatAspectRatio(cached)}; ${widthRule} height: auto;`
          : `aspect-ratio: ${formatAspectRatio(cached)}; height: auto;`;
        img.setAttribute(
          "style",
          `${existingStyle ? existingStyle + ";" : ""}${styleSuffix}`,
        );
        img.setAttribute("data-legacy-aspect", "cached");
      } else {
        // No intrinsic dims + no cached ratio → let the image render at its
        // natural aspect ratio (width:100%; height:auto) unless a custom width is defined.
        const styleSuffix = widthRule ? `${DEFAULT_IMG_STYLE}` : `height: auto;`;
        img.setAttribute(
          "style",
          `${existingStyle ? existingStyle + ";" : ""}${styleSuffix}`,
        );
        img.setAttribute("data-legacy-aspect", "natural");
      }
    }
  }
}

function transformIframe(iframe: HTMLIFrameElement, doc: Document): void {
  if (!iframe.hasAttribute("loading")) iframe.setAttribute("loading", "lazy");

  const parent = iframe.parentElement;
  if (parent && parent.classList && parent.classList.contains("embed-responsive")) {
    return;
  }

  iframe.removeAttribute("width");
  iframe.removeAttribute("height");
  const existingStyle = iframe.getAttribute("style") || "";
  const cleanedStyle = existingStyle
    .replace(/(?:^|;)\s*(?:width|height)\s*:[^;]+/gi, "")
    .replace(/^;+|;+$/g, "");
  if (cleanedStyle) {
    iframe.setAttribute("style", cleanedStyle);
  } else {
    iframe.removeAttribute("style");
  }

  const wrapper = doc.createElement("div");
  wrapper.className = "embed-responsive";
  wrapper.setAttribute(
    "style",
    "aspect-ratio: 16 / 9; position: relative; width: 100%;",
  );

  if (parent) {
    parent.insertBefore(wrapper, iframe);
    wrapper.appendChild(iframe);
  }
}

function transformSocialEmbed(blockquote: HTMLElement, doc: Document): void {
  const className = blockquote.getAttribute("class") || "";
  const match = SOCIAL_EMBED_HEIGHTS.find(rule => rule.match.test(className));
  if (!match) return;

  const parent = blockquote.parentElement;
  if (parent && parent.classList && parent.classList.contains("social-embed-wrap")) {
    return;
  }

  const wrapper = doc.createElement("div");
  wrapper.className = match.wrapClass;
  wrapper.setAttribute("style", `min-height: ${match.minHeight}px;`);

  if (parent) {
    parent.insertBefore(wrapper, blockquote);
    wrapper.appendChild(blockquote);
  }
}

export function transformArticleHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== "string") return rawHtml;
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return rawHtml;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="__root__">${rawHtml}</div>`, "text/html");
    const root = doc.getElementById("__root__");
    if (!root) return rawHtml;

    const images = Array.from(root.querySelectorAll("img"));
    images.forEach(img => transformImg(img as HTMLImageElement));

    const iframes = Array.from(root.querySelectorAll("iframe"));
    iframes.forEach(iframe => transformIframe(iframe as HTMLIFrameElement, doc));

    const socialEmbeds = Array.from(
      root.querySelectorAll(
        "blockquote.twitter-tweet, blockquote.instagram-media, blockquote.tiktok-embed",
      ),
    );
    socialEmbeds.forEach(node => transformSocialEmbed(node as HTMLElement, doc));

    return root.innerHTML;
  } catch (err) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[legacyHtmlTransformer] failed, returning original HTML", err);
    }
    return rawHtml;
  }
}
