import { Router } from "express";
import { memoryCache, CACHE_TTL } from "../memoryCache";
import { getArticlesByKeyword } from "../services/keywordService";

const router: Router = Router();

// Get articles by keyword
router.get("/api/keyword/:keyword", async (req, res) => {
  try {
    const keyword = decodeURIComponent(req.params.keyword);

    const cacheKey = `keyword-tag-v2:${keyword}`;
    const cached = memoryCache.get(cacheKey);
    if (cached) return res.json(cached);

    const payload = await getArticlesByKeyword(keyword);
    memoryCache.set(cacheKey, payload, CACHE_TTL.MEDIUM);
    res.json(payload);
  } catch (error) {
    console.error("Error fetching articles by keyword:", error);
    res.status(500).json({ message: "Failed to fetch articles" });
  }
});

export default router;
