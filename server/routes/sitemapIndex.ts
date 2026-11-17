import type { RequestHandler } from "express";
import { getOrBuildSitemapXml } from "../services/sitemapCacheService";

export const SITEMAP_INDEX_CACHE_KEY = "index_archive_v4";

type BucketCounts = { ar: number; en: number; ur: number };

export function createSitemapIndexHandler(buckets: BucketCounts): RequestHandler {
  return async (_req, res) => {
    try {
      const baseUrl = "https://sabq.org";
      const indexXml = await getOrBuildSitemapXml(SITEMAP_INDEX_CACHE_KEY, 30 * 60 * 1000, async () => {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
        xml += `  <sitemap><loc>${baseUrl}/sitemap-static.xml</loc></sitemap>\n  <sitemap><loc>${baseUrl}/sitemap-mawaeed.xml</loc></sitemap>\n`;
        xml += `  <sitemap><loc>${baseUrl}/sitemap-categories.xml</loc></sitemap>\n`;
        xml += `  <sitemap><loc>${baseUrl}/sitemap-news.xml</loc></sitemap>\n`;
        for (let i = 1; i <= buckets.ar; i++) xml += `  <sitemap><loc>${baseUrl}/sitemap-articles-${i}.xml</loc></sitemap>\n`;
        for (let i = 1; i <= buckets.en; i++) xml += `  <sitemap><loc>${baseUrl}/sitemap-en-articles-${i}.xml</loc></sitemap>\n`;
        for (let i = 1; i <= buckets.ur; i++) xml += `  <sitemap><loc>${baseUrl}/sitemap-ur-articles-${i}.xml</loc></sitemap>\n`;
        return xml + '</sitemapindex>';
      });
      res.header('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800');
      res.send(indexXml as string);
    } catch (error) {
      console.error("Error generating sitemap index:", error);
      res.status(500).send("Error generating sitemap");
    }
  };
}
