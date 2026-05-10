import { RefObject, useEffect } from "react";
import {
  formatAspectRatio,
  getCachedAspectRatio,
  setCachedAspectRatio,
} from "@/lib/legacyImageRatioCache";

const PROCESSED_FLAG = "data-legacy-aspect-measured";
const MIN_RATIO = 0.1;
const MAX_RATIO = 10;

// Use the post-transform `src` attribute as the cache key so the transformer's
// first-paint lookup (which also reads `src`) always matches what the hook
// stores. Avoid `currentSrc`, which can resolve to a different `srcset` URL.
function getCacheKey(img: HTMLImageElement): string {
  return img.getAttribute("src") || "";
}

function applyMeasuredRatio(img: HTMLImageElement, ratio: number): void {
  if (!Number.isFinite(ratio) || ratio < MIN_RATIO || ratio > MAX_RATIO) return;
  const formatted = formatAspectRatio(ratio);
  const existingStyle = img.getAttribute("style") || "";
  const cleaned = existingStyle.replace(/aspect-ratio\s*:[^;]+;?/gi, "").trim();
  const next = cleaned
    ? `${cleaned}${cleaned.endsWith(";") ? "" : ";"} aspect-ratio: ${formatted}; width: 100%; height: auto;`
    : `aspect-ratio: ${formatted}; width: 100%; height: auto;`;
  img.setAttribute("style", next);
  img.setAttribute("data-legacy-aspect", "measured");
}

// Only mutate the inline aspect-ratio when the image's top edge is at or below
// the viewport bottom. Resizing an off-screen element does not contribute to
// CLS and cannot shift any text the user is currently looking at. For images
// in or above the viewport we still cache the measurement so the correct box
// is reserved on the next visit / back-navigation / prerender.
function isSafeToMutate(img: HTMLImageElement): boolean {
  const rect = img.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  return rect.top >= viewportHeight;
}

function measureAndApply(img: HTMLImageElement): void {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return;
  const ratio = w / h;
  const key = getCacheKey(img);
  if (key) setCachedAspectRatio(key, ratio);
  if (isSafeToMutate(img)) {
    applyMeasuredRatio(img, ratio);
  }
}

function processImage(img: HTMLImageElement, cleanups: Array<() => void>): void {
  if (img.getAttribute(PROCESSED_FLAG) === "1") return;
  img.setAttribute(PROCESSED_FLAG, "1");

  // Late cache hit: the cache may have been populated after the transformer
  // ran (e.g. by a sibling article render in the same session). Apply it now
  // if doing so won't shift visible content.
  if (img.getAttribute("data-legacy-aspect") === "default") {
    const key = getCacheKey(img);
    if (key) {
      const cached = getCachedAspectRatio(key);
      if (cached && isSafeToMutate(img)) applyMeasuredRatio(img, cached);
    }
  }

  if (img.complete && img.naturalWidth > 0) {
    measureAndApply(img);
    return;
  }

  const onLoad = () => {
    measureAndApply(img);
    img.removeEventListener("load", onLoad);
    img.removeEventListener("error", onError);
  };
  const onError = () => {
    img.removeEventListener("load", onLoad);
    img.removeEventListener("error", onError);
  };
  img.addEventListener("load", onLoad);
  img.addEventListener("error", onError);
  cleanups.push(() => {
    img.removeEventListener("load", onLoad);
    img.removeEventListener("error", onError);
  });
}

export function useNaturalAspectRatio<T extends HTMLElement>(
  ref: RefObject<T>,
  htmlKey?: string,
): void {
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof window === "undefined") return;

    const cleanups: Array<() => void> = [];

    const scan = () => {
      const candidates = root.querySelectorAll<HTMLImageElement>(
        'img[data-legacy-aspect]',
      );
      candidates.forEach(img => processImage(img, cleanups));
    };

    scan();

    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(() => scan());
      observer.observe(root, { childList: true, subtree: true });
    }

    return () => {
      if (observer) observer.disconnect();
      cleanups.forEach(fn => fn());
    };
  }, [ref, htmlKey]);
}
