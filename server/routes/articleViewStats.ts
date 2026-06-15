import { Router } from "express";
import { requireAuth, requirePermission } from "../rbac";
import { getArticleIpBreakdown } from "../services/articleViewStatsService";

const router: Router = Router();

// Per-IP visit breakdown for a single article (on-demand report).
// Answers "is this article's traffic from one IP or many?" without exposing raw IPs.
router.get(
  "/api/admin/articles/:id/ip-views",
  requireAuth,
  requirePermission("analytics.view"),
  async (req: any, res) => {
    try {
      const articleId = req.params.id;
      if (!articleId) {
        return res.status(400).json({ message: "معرف المقال مطلوب" });
      }
      const limit = Number(req.query.limit) || 50;
      const breakdown = await getArticleIpBreakdown(articleId, limit);
      res.json(breakdown);
    } catch (error) {
      console.error("[ArticleIpViews] Error building report:", error);
      res.status(500).json({ message: "فشل في جلب تقرير الزيارات" });
    }
  },
);

export default router;
