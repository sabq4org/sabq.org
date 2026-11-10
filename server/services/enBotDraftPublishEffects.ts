// إبطال كاش النسخة الإنجليزية بعد نشر بوت /en أو أرشفته أو تعديل خبره المنشور.
// لا يستدعي queueBotDraftPublishEffects: ذلك المسار يخص جدول articles العربي.

import { memoryCache } from "../memoryCache";
import { notifySearchEngines } from "../indexNow";
import { purgeArticle, purgeUrls } from "./cloudflarePurge";
import { invalidateSitemapXmlCache } from "./sitemapCacheService";
import { clearNewsSitemapMemoryCache } from "./newsSitemapMemoryCache";

export interface EnBotDraftSurface {
  id: string;
  slug: string;
  englishSlug?: string | null;
  title?: string | null;
}

function siteOrigin(): string {
  return (process.env.PUBLIC_SITE_URL || process.env.FRONTEND_URL || "https://sabq.org").replace(/\/+$/, "");
}

function apiOrigin(): string {
  return (process.env.PUBLIC_API_URL || "https://api.sabq.org").replace(/\/+$/, "");
}

export async function applyEnBotDraftSurfaceEffects(
  row: EnBotDraftSurface,
  kind: "publish" | "archive" | "update" | "visibility",
): Promise<void> {
  const canonical = (row.englishSlug || row.slug || "").trim();
  memoryCache.invalidatePattern("^en:article:base:");
  memoryCache.invalidatePattern("^articles:");
  memoryCache.invalidatePattern("^article:");
  if (kind === "update" && !canonical) return;

  if (kind === "publish" || kind === "archive") {
    clearNewsSitemapMemoryCache();
    await invalidateSitemapXmlCache(["__sitemapEnArticles", "index"]).catch((error) => {
      console.error("[EnBotDrafts] sitemap invalidation failed:", error);
    });
  }

  if (!canonical) return;
  const path = `/en/article/${encodeURIComponent(canonical)}`;
  const urls = [
    `${siteOrigin()}${path}`,
    `${apiOrigin()}/api/en/articles/${encodeURIComponent(canonical)}`,
    `${siteOrigin()}/api/en/articles/${encodeURIComponent(canonical)}`,
    `${apiOrigin()}/api/edge/seo-meta?path=${encodeURIComponent(path)}`,
  ];
  await purgeUrls(urls).catch((error) => {
    console.error("[EnBotDrafts] English URL purge failed:", error);
  });
  if (kind === "publish" || kind === "archive" || kind === "update") {
    await purgeArticle(canonical).catch((error) => {
      console.error("[EnBotDrafts] purgeArticle failed:", error);
    });
  }
  if (kind === "publish") {
    await notifySearchEngines(canonical, "en").catch((error) => {
      console.error("[EnBotDrafts] IndexNow failed:", error);
    });
  }
}

export function queueEnBotDraftSurfaceEffects(
  row: EnBotDraftSurface,
  kind: "publish" | "archive" | "update" | "visibility",
): void {
  void applyEnBotDraftSurfaceEffects(row, kind).catch((error) => {
    console.error(`[EnBotDrafts] surface effects failed after ${kind}:`, error);
  });
}
