import type { Metadata } from "next";
import type { SeoBundleMeta } from "./seoBundle";

function alternatesFrom(meta: SeoBundleMeta) {
  const languages: Record<string, string> = {};
  for (const h of meta.hreflang || []) {
    languages[h.lang] = h.href;
  }
  return {
    canonical: meta.canonical,
    languages: Object.keys(languages).length ? languages : undefined,
  };
}

/** Build Next Metadata from a seo-bundle meta payload (shared ar/en/ur). */
export function articleMetadata(m: SeoBundleMeta): Metadata {
  return {
    title: { absolute: m.title },
    description: m.description,
    alternates: alternatesFrom(m),
    robots:
      process.env.STAGING_NO_INDEX === "true"
        ? { index: false, follow: false, nocache: true }
        : m.robots,
    openGraph: {
      type: "article",
      title: m.title,
      description: m.description,
      url: m.canonical,
      siteName: m.siteName,
      locale: m.locale,
      images: m.image ? [{ url: m.image, width: 1200, height: 630 }] : undefined,
      publishedTime: m.publishedTime,
      modifiedTime: m.modifiedTime,
      section: m.section,
      tags: m.tags,
    },
    twitter: {
      card: "summary_large_image",
      site: "@sabq",
      title: m.title,
      description: m.description,
      images: m.image ? [m.image] : undefined,
    },
  };
}
