// GET /api/en/search?q=&page= — English reader search (public, read-only).
// The /en/search page itself is noindex (server/utils/noindexPaths.ts); the
// JSON API follows the Arabic /api/search cache headers.
import { Router } from "express";
import { CACHE_TTL, withCache } from "../memoryCache";
import { searchEnglishArticles } from "../services/enSearchService";
import {
  EN_SEARCH_PAGE_SIZE,
  normalizeEnSearchQuery,
  parseEnSearchPage,
  type EnSearchResponse,
} from "@shared/enSearch";

const router = Router();
const PUBLIC_SEARCH_CACHE = "public, max-age=30, s-maxage=60, stale-while-revalidate=120";

router.get("/api/en/search", async (req, res) => {
  const query = normalizeEnSearchQuery(req.query.q);
  const page = parseEnSearchPage(req.query.page);
  if (!query) {
    const empty: EnSearchResponse = { articles: [], total: 0, page, pageSize: EN_SEARCH_PAGE_SIZE, query: "" };
    res.set("Cache-Control", PUBLIC_SEARCH_CACHE);
    return res.json(empty);
  }
  try {
    const cacheKey = `en-search:v1:${query.toLowerCase()}:${page}`;
    const result = await withCache(cacheKey, CACHE_TTL.SHORT, () => searchEnglishArticles(query, page));
    res.set("Cache-Control", PUBLIC_SEARCH_CACHE);
    return res.json(result);
  } catch (error) {
    console.error("[EnSearch] search failed:", error);
    return res.status(500).json({ message: "Search failed" });
  }
});

export default router;
