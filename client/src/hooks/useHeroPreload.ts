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

    const normalized = normalizeImageSrc(imageUrl);
    const srcset = generateResponsiveSrcSet(normalized);
    const fallbackHref = buildCloudflareUrl(normalized, { width: 960, quality: 80 }) || normalized;

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
