import { Router } from "express";
import { isAuthenticated } from "../auth";
import { requireAnyPermission } from "../rbac";
import { analyzeSEO } from "../openai";
import { authorizeArticleWrite } from "../services/articleAccessService";
import {
  applyEnSeoAnalysis,
  getEnArticleForSeoAnalysis,
} from "../services/translatedArticleSeoService";

/**
 * «Analyze» in the English editor's SEO tab. The editor has called this path
 * since it was built, but only the Arabic /api/articles/:id/analyze-seo
 * existed, so the button always answered 404.
 */
const router = Router();

router.post(
  "/api/en/articles/:id/analyze-seo",
  isAuthenticated,
  requireAnyPermission("articles.create", "articles.edit_any", "articles.edit_own"),
  async (req: any, res) => {
    try {
      const articleId = String(req.params.id);
      const access = await authorizeArticleWrite(req.user.id, articleId, undefined, "en");
      if (!access.ok) return res.status(access.httpStatus).json({ message: access.message });

      const article = await getEnArticleForSeoAnalysis(articleId);
      if (!article) return res.status(404).json({ message: "Article not found" });

      const analysis = await analyzeSEO(article.title, article.content, article.excerpt || undefined, "en");
      if (req.body?.applyChanges) await applyEnSeoAnalysis(articleId, article.seo, analysis);
      res.json(analysis);
    } catch (error) {
      console.error("[EN SEO] analyze failed:", error);
      res.status(500).json({ message: "SEO analysis failed" });
    }
  },
);

export default router;
