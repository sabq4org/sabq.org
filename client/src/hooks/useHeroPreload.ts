import { useEffect } from "react";
import { buildHeroImagePreload } from "@shared/articleHeroPreload";

export function useHeroPreload(imageUrl: string | null | undefined, quality = 72, fallbackWidth = 960): void {
  useEffect(() => {
    if (!imageUrl || typeof document === "undefined") return;

    const preload = buildHeroImagePreload(imageUrl, quality, fallbackWidth);
    if (!preload) return;
    const { href: fallbackHref, imagesrcset: srcset, imagesizes } = preload;

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
      link.setAttribute("imagesizes", imagesizes!);
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
  }, [imageUrl, quality, fallbackWidth]);
}
