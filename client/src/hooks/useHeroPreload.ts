import { useEffect } from "react";
import {
  buildCloudflareUrl,
  generateResponsiveSrcSet,
  HERO_SIZES_ATTR,
  normalizeImageSrc,
} from "@/lib/cdnImage";

export function useHeroPreload(imageUrl: string | null | undefined): void {
  useEffect(() => {
    if (!imageUrl || typeof document === "undefined") return;

    // Keep quality in lockstep with HeroCarousel's HERO_QUALITY. If the
    // preloaded srcset uses a different quality than the rendered <img>, the
    // browser treats them as different resources and downloads the hero twice.
    const HERO_QUALITY = 72;
    const normalized = normalizeImageSrc(imageUrl);
    const srcset = generateResponsiveSrcSet(normalized, HERO_QUALITY);
    const fallbackHref = buildCloudflareUrl(normalized, { width: 960, quality: HERO_QUALITY }) || normalized;

    // The Pages middleware may have already injected this exact preload into
    // the served HTML (data-hero-preload-edge, built from the same shared
    // cdnImage helpers). Only skip on an exact href match — if the hero
    // changed after the edge cached its copy, ours is the correct one.
    const edgeLink = document.querySelector('link[data-hero-preload-edge]');
    if (edgeLink && edgeLink.getAttribute("href") === fallbackHref) return;

    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.setAttribute("fetchpriority", "high");
    if (srcset) {
      link.setAttribute("imagesrcset", srcset);
      link.setAttribute("imagesizes", HERO_SIZES_ATTR);
    }
    link.href = fallbackHref;
    link.dataset.heroPreload = "1";

    document.head.appendChild(link);

    return () => {
      try {
        document.head.removeChild(link);
      } catch {
        /* already removed */
      }
    };
  }, [imageUrl]);
}
