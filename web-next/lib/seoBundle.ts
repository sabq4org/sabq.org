import { serverApiFetch, serverApiUrl } from "./apiUrl";

export interface SeoBundleMeta {
  title: string;
  description: string;
  canonical: string;
  image: string;
  robots: string;
  googlebotNews?: string;
  locale: string;
  siteName: string;
  hreflang: { lang: string; href: string }[];
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  tags?: string[];
}

export interface SeoBundle {
  slug: string;
  englishSlug: string | null;
  title: string;
  excerpt: string;
  contentHtml: string;
  imageUrl: string;
  publishedAt: string | null;
  updatedAt: string | null;
  author: string;
  articleType?: string | null;
  imageAlt?: string | null;
  imageCaption?: string | null;
  imageSource?: string | null;
  isAiGeneratedImage?: boolean;
  isAiGeneratedThumbnail?: boolean;
  reporterHref?: string | null;
  category: string | null;
  categoryHref: string | null;
  categoryLatest?: ArticleListItem[];
  articleTags?: ArticleTagLink[];
  keywords: string[];
  meta: SeoBundleMeta;
  jsonLd: Record<string, unknown>;
}

export type Lang = "ar" | "en" | "ur";

export interface ArticleListItem {
  href: string;
  title: string;
  excerpt: string;
  imageUrl: string | null;
  publishedAt: string | null;
  newsType?: string | null;
  category?: string | null;
  categoryColor?: string | null;
}

export interface ArticleTagLink {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string | null;
  href: string;
}

export interface CategoryBundle {
  slug: string;
  englishSlug: string | null;
  name: string;
  description: string;
  canonical: string;
  color?: string | null;
  articles: ArticleListItem[];
  pagination?: {
    page: number;
    limit: number;
    hasMore: boolean;
    previousHref: string | null;
    nextHref: string | null;
  };
}

export interface HomeBundle {
  canonical: string;
  articles: ArticleListItem[];
  sections: { href: string; title: string; color?: string | null }[];
}

/**
 * Fetch the aggregated SSR bundle for an article from the Railway API.
 * Returns null on 404 (so the page can render notFound()) and throws on other
 * failures (so Next surfaces a 500 instead of silently rendering an empty page,
 * which would poison the edge cache).
 */
export async function getArticleSeoBundle(
  slug: string,
  lang: Lang = "ar",
  revalidate = 60,
): Promise<SeoBundle | null> {
  const url = serverApiUrl(
    `/api/articles/${encodeURIComponent(slug)}/seo-bundle?lang=${lang}`,
  );
  // The Pages layer caches validated HTML for a bounded period. Keep
  // the Next data cache disabled so a render cannot
  // resurrect an older ISR payload. The API has a bounded, invalidated projection cache. The parameter remains for call-site
  // compatibility while cache ownership lives at the edge.
  void revalidate;
  const res = await serverApiFetch(url, { cache: "no-store" });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`seo-bundle fetch failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as SeoBundle;
}

export async function getCategoryBundle(
  slug: string,
  page = 1,
): Promise<CategoryBundle | null> {
  const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const url = serverApiUrl(
    `/api/categories/${encodeURIComponent(slug)}/seo-bundle?limit=30&page=${normalizedPage}`,
  );
  const res = await serverApiFetch(url, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`category bundle failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as CategoryBundle;
}

export async function getHomeBundle(revalidate = 60): Promise<HomeBundle> {
  const url = serverApiUrl(`/api/edge/home-bundle`);
  void revalidate;
  const res = await serverApiFetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`home bundle failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as HomeBundle;
}
