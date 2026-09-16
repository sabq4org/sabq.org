import { Router } from "express";
import { requireAuth, requirePermission } from "../rbac";
import { resurfaceArticle } from "../services/articleResurfaceService";
import { invalidateArticleWrite } from "../services/contentInvalidation";

const router: Router = Router();

// «إنعاش الخبر»: يعيد خبرًا منشورًا إلى صدارة الموجز دون تغيير تاريخه أو
// مشاهداته أو رابطه. نفس صلاحية النشر لأنه قرار تحريري بوزن إعادة النشر.
router.post(
  "/api/articles/:id/resurface",
  requireAuth,
  requirePermission("articles.publish"),
  async (req: any, res) => {
    try {
      const articleId = req.params.id;
      if (!articleId) {
        return res.status(400).json({ message: "معرف الخبر مطلوب" });
      }
      const article = await resurfaceArticle(articleId);
      if (!article) {
        return res.status(404).json({ message: "لا يوجد خبر منشور بهذا المعرف — الإنعاش للأخبار المنشورة فقط" });
      }
      invalidateArticleWrite(article, { reason: "article-resurface" });
      res.json({
        message: "تم إنعاش الخبر — عاد إلى صدارة الموجز",
        articleId: article.id,
        resurfacedAt: article.resurfacedAt,
      });
    } catch (error) {
      console.error("[ArticleResurface] Error resurfacing article:", error);
      res.status(500).json({ message: "فشل في إنعاش الخبر" });
    }
  },
);

export default router;
