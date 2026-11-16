import { Router } from "express";
import { viewTrackingCache } from "../memoryCache";
import { getRealIp } from "../utils/trustedProxyIp";
import { addEnArticleViews } from "../services/enArticleViewsService";

/**
 * View counting for English articles, same rules as the Arabic
 * POST /api/articles/:id/view: one counted view per visitor (user, else real
 * IP) per article per 5 minutes, with the same 5-10 boost per distinct visitor.
 *
 * Before this, the English page POSTed to this path (404) and the public GET
 * /api/en/articles/:slug added 5-10 views on every request, so each refetch,
 * tab refocus or crawler hit inflated the counter.
 */
export const EN_VIEW_DEDUP_WINDOW_MS = 5 * 60 * 1000;
const router = Router();

router.post("/api/en/articles/:id/view", async (req: any, res) => {
  try {
    const articleId = String(req.params.id || "");
    if (!articleId || articleId.length > 64) return res.status(400).json({ message: "Article id required" });

    const viewer = req.user?.id ? `u:${req.user.id}` : getRealIp(req);
    const dedupKey = `en:view:seen:${articleId}:${viewer}`;
    if (viewTrackingCache.get<boolean>(dedupKey)) return res.json({ success: true, counted: false });
    viewTrackingCache.set(dedupKey, true, EN_VIEW_DEDUP_WINDOW_MS);

    const counted = await addEnArticleViews(articleId, Math.floor(Math.random() * 6) + 5);
    res.json({ success: true, counted });
  } catch (error) {
    console.error("[EN view] failed:", error);
    res.status(500).json({ message: "Failed to record view" });
  }
});

export default router;
