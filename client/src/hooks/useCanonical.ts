import { useEffect } from "react";

/**
 * Custom React hook to dynamically manage the `<link rel="canonical">` tag in document.head.
 * Always ensures only one canonical tag exists and updates its href correctly.
 * 
 * @param url The canonical URL to set. If null or undefined, the hook does nothing (e.g. while data is loading).
 */
export function useCanonical(url: string | null | undefined) {
  useEffect(() => {
    if (!url) return;

    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (link) {
      link.href = url;
    } else {
      link = document.createElement("link");
      link.rel = "canonical";
      link.href = url;
      document.head.appendChild(link);
    }
  }, [url]);
}
